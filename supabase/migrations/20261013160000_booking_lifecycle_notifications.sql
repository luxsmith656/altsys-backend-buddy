-- Durable notifications for every booking lifecycle change and addressed
-- booking conversation message. These run in the database so a notification
-- is not lost when a client refreshes after committing the booking update.

CREATE OR REPLACE FUNCTION public.notify_booking_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  notification_title text := CASE
    WHEN NEW.kind = 'reschedule_request' THEN 'Booking reschedule request'
    WHEN NEW.kind = 'reassignment_request' THEN 'Guide reassignment request'
    WHEN NEW.kind = 'system' THEN 'Booking update'
    ELSE 'New booking message'
  END;
  notification_body text := CASE
    WHEN NEW.kind = 'reschedule_request' THEN 'A hiker requested a change to a booking schedule.'
    WHEN NEW.kind = 'reassignment_request' THEN 'A guide requested reassignment for a booking.'
    WHEN NEW.kind = 'system' THEN 'There is an update on your booking.'
    ELSE 'You have a new message about a booking.'
  END;
BEGIN
  -- Assignment and completion services already issue their own detailed
  -- notification for system rows. Recipient-addressed chat and decision rows
  -- are handled here so they cannot be lost after a browser refresh.
  IF NEW.recipient_role IS NULL OR NEW.kind = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.recipient_role = 'hiker' THEN
    IF booking_row.user_id IS DISTINCT FROM NEW.sender_id THEN
      INSERT INTO public.app_notifications (user_id, title, body, category, link)
      VALUES (
        booking_row.user_id,
        notification_title,
        notification_body,
        'booking',
        '/hiker?bookingId=' || NEW.booking_id::text
      );
    END IF;
  ELSIF NEW.recipient_role = 'guide' THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      guide.user_id,
      notification_title,
      notification_body,
      'booking',
      '/guide?bookingId=' || NEW.booking_id::text
    FROM public.booking_assignments assignment
    JOIN public.guides guide ON guide.id = assignment.guide_id
    WHERE assignment.booking_id = NEW.booking_id
      AND assignment.status IN ('pending', 'accepted')
      AND guide.user_id IS NOT NULL
      AND guide.user_id IS DISTINCT FROM NEW.sender_id;
  ELSIF NEW.recipient_role = 'admin' THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      notification_title,
      notification_body,
      'booking',
      '/admin?tab=requests&bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role
    LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND (
        user_role.role = 'super_admin'
        OR (
        user_role.role = 'admin'
        AND user_location.location_id = booking_row.location_id
        )
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_message_notification_after_insert ON public.booking_messages;
CREATE TRIGGER booking_message_notification_after_insert
  AFTER INSERT ON public.booking_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_message_recipient();

CREATE OR REPLACE FUNCTION public.notify_booking_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  title text;
  body text;
  change_is_date_only boolean := OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD.booking_date IS DISTINCT FROM NEW.booking_date;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.booking_date IS NOT DISTINCT FROM NEW.booking_date THEN
    RETURN NEW;
  END IF;

  IF change_is_date_only THEN
    title := 'Booking date updated';
    body := 'Your hike booking is now scheduled for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || '.';
  ELSE
    CASE NEW.status
      WHEN 'pending' THEN
        title := 'Booking pending guide assignment';
        body := 'Your booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' is awaiting guide assignment.';
      WHEN 'confirmed' THEN
        title := 'Booking confirmed';
        body := 'Your hike booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' is confirmed.';
      WHEN 'adjustment_pending' THEN
        title := 'Booking schedule change pending';
        body := 'There is a pending schedule change for your booking on ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || '.';
      WHEN 'cancelled' THEN
        title := 'Booking cancelled';
        body := 'Your hike booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' was cancelled.';
      WHEN 'completed' THEN
        title := 'Hike completed';
        body := 'Your hike on ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' is marked as completed.';
      ELSE
        title := 'Booking status updated';
        body := 'Your hike booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' is now ' || replace(NEW.status, '_', ' ') || '.';
    END CASE;
  END IF;

  INSERT INTO public.app_notifications (user_id, title, body, category, link)
  VALUES (
    NEW.user_id,
    title,
    body,
    'booking',
    '/hiker?bookingId=' || NEW.id::text
  );

  -- When a hiker cancels or asks for a schedule change, the responsible
  -- trailhead administrators need a durable dispatch alert too.
  IF actor_id = NEW.user_id AND NEW.status IN ('adjustment_pending', 'cancelled') THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      CASE NEW.status
        WHEN 'adjustment_pending' THEN 'Hiker reschedule request'
        ELSE 'Hiker cancellation'
      END,
      CASE NEW.status
        WHEN 'adjustment_pending' THEN 'A hiker requested a booking schedule change.'
        ELSE 'A hiker cancelled a booking.'
      END,
      'booking',
      '/admin?tab=requests&bookingId=' || NEW.id::text
    FROM public.user_roles user_role
    LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM actor_id
      AND (
        user_role.role = 'super_admin'
        OR (user_role.role = 'admin' AND user_location.location_id = NEW.location_id)
      );
  END IF;

  -- Guides should also know when an accepted booking they are scheduled for
  -- is cancelled or moved to a pending schedule change.
  IF NEW.status IN ('adjustment_pending', 'cancelled') OR change_is_date_only THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      guide.user_id,
      title,
      body,
      'booking',
      '/guide?bookingId=' || NEW.id::text
    FROM public.booking_assignments assignment
    JOIN public.guides guide ON guide.id = assignment.guide_id
    WHERE assignment.booking_id = NEW.id
      AND assignment.status IN ('pending', 'accepted')
      AND guide.user_id IS NOT NULL
      AND guide.user_id IS DISTINCT FROM actor_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_lifecycle_notification_after_update ON public.bookings;
CREATE TRIGGER booking_lifecycle_notification_after_update
  AFTER UPDATE OF status, booking_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_lifecycle_change();
