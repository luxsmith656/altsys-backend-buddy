-- Ensure addressed admin/system booking messages reach the durable notification
-- feed. The message row remains the source of truth for the conversation.
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
  IF NEW.recipient_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guide/system acceptance paths already issue their own detailed durable
  -- notification. Admin-authored system rows do not, so they continue below.
  IF NEW.kind = 'system' AND NEW.sender_role IN ('guide', 'system') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.recipient_role = 'hiker' THEN
    IF booking_row.user_id IS DISTINCT FROM NEW.sender_id THEN
      INSERT INTO public.app_notifications (user_id, title, body, category, link)
      VALUES (booking_row.user_id, notification_title, notification_body, 'booking', '/hiker?bookingId=' || NEW.booking_id::text);
    END IF;
  ELSIF NEW.recipient_role = 'guide' THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT guide.user_id, notification_title, notification_body, 'booking', '/guide?bookingId=' || NEW.booking_id::text
    FROM public.booking_assignments assignment
    JOIN public.guides guide ON guide.id = assignment.guide_id
    WHERE assignment.booking_id = NEW.booking_id
      AND assignment.status IN ('pending', 'accepted')
      AND guide.user_id IS NOT NULL
      AND guide.user_id IS DISTINCT FROM NEW.sender_id;
  ELSIF NEW.recipient_role = 'admin' THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT user_role.user_id, notification_title, notification_body, 'booking', '/admin?tab=requests&bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role
    LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND (user_role.role = 'super_admin' OR (user_role.role = 'admin' AND user_location.location_id = booking_row.location_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_message_notification_after_insert ON public.booking_messages;
CREATE TRIGGER booking_message_notification_after_insert
  AFTER INSERT ON public.booking_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_message_recipient();
