-- Operational booking notifications belong to the local admin responsible
-- for the booking trailhead. Central Admin still has dashboard visibility,
-- but must not receive local booking, chat-dispatch, reschedule, or session
-- alerts in the notification inbox.

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
    ELSE 'New message from ' || initcap(coalesce(NEW.sender_role, 'user'))
  END;
  notification_body text := left(
    coalesce(nullif(trim(NEW.content), ''), 'You have a new message about a booking.'),
    240
  );
BEGIN
  IF NEW.recipient_role IS NULL OR (NEW.kind = 'system' AND NEW.sender_role IN ('guide', 'system')) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.recipient_role = 'hiker' AND booking_row.user_id IS DISTINCT FROM NEW.sender_id THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    VALUES (booking_row.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/hiker?bookingId=' || NEW.booking_id::text);
  ELSIF NEW.recipient_role = 'guide' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT guide.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/guide?bookingId=' || NEW.booking_id::text
    FROM public.booking_assignments assignment
    JOIN public.guides guide ON guide.id = assignment.guide_id
    WHERE assignment.booking_id = NEW.booking_id
      AND assignment.status IN ('pending', 'accepted')
      AND guide.user_id IS NOT NULL
      AND guide.user_id IS DISTINCT FROM NEW.sender_id;
  ELSIF NEW.recipient_role = 'admin' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT user_role.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/admin?tab=requests&bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role
    JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND user_role.role = 'admin'
      AND user_location.location_id = booking_row.location_id;
  ELSIF NEW.recipient_role = 'ranger' THEN
    INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
    SELECT DISTINCT user_role.user_id, NEW.sender_id, 'chat', NEW.id, notification_title, notification_body, 'booking', '/ranger?bookingId=' || NEW.booking_id::text
    FROM public.user_roles user_role
    JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.role = 'ranger'
      AND user_role.user_id IS DISTINCT FROM NEW.sender_id
      AND user_location.location_id = booking_row.location_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
  SELECT DISTINCT user_role.user_id, NEW.user_id, 'booking', NEW.id,
    'New booking request',
    'A new hike booking for ' || to_char(NEW.booking_date, 'Mon DD, YYYY') || ' needs guide assignment.',
    'booking', '/admin?tab=requests&bookingId=' || NEW.id::text
  FROM public.user_roles user_role
  JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
  WHERE user_role.user_id IS DISTINCT FROM NEW.user_id
    AND user_role.role = 'admin'
    AND user_location.location_id = NEW.location_id;
  RETURN NEW;
END;
$$;

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

  IF NOT (actor_id = NEW.user_id AND NEW.status = 'adjustment_pending') THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    VALUES (NEW.user_id, title, body, 'booking', '/hiker?bookingId=' || NEW.id::text);
  END IF;

  IF actor_id = NEW.user_id AND NEW.status IN ('adjustment_pending', 'cancelled') THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT
      user_role.user_id,
      CASE NEW.status WHEN 'adjustment_pending' THEN 'Hiker reschedule request' ELSE 'Hiker cancellation' END,
      CASE NEW.status WHEN 'adjustment_pending' THEN 'A hiker requested a booking schedule change.' ELSE 'A hiker cancelled a booking.' END,
      'booking', '/admin?tab=requests&bookingId=' || NEW.id::text
    FROM public.user_roles user_role
    JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM actor_id
      AND user_role.role = 'admin'
      AND user_location.location_id = NEW.location_id;
  END IF;

  IF (NEW.status IN ('cancelled') OR change_is_date_only
      OR (NEW.status = 'adjustment_pending' AND actor_id IS DISTINCT FROM NEW.user_id)) THEN
    INSERT INTO public.app_notifications (user_id, title, body, category, link)
    SELECT DISTINCT guide.user_id, title, body, 'booking', '/guide?bookingId=' || NEW.id::text
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

CREATE OR REPLACE FUNCTION public.notify_booking_message_dispatch_copy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  message_title text := 'New message from ' || initcap(coalesce(NEW.sender_role, 'user'));
  message_body text := left(coalesce(nullif(trim(NEW.content), ''), 'You have a new message about a booking.'), 240);
BEGIN
  IF NEW.recipient_role NOT IN ('guide', 'hiker') OR NEW.sender_role NOT IN ('hiker', 'guide') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.app_notifications(user_id, sender_id, type, reference_id, title, body, category, link)
  SELECT DISTINCT
    user_role.user_id, NEW.sender_id, 'chat', NEW.id, message_title, message_body,
    'booking', '/admin?tab=requests&bookingId=' || NEW.booking_id::text
  FROM public.user_roles user_role
  JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
  WHERE user_role.user_id IS DISTINCT FROM NEW.sender_id
    AND user_role.role = 'admin'
    AND user_location.location_id = booking_row.location_id
    AND NOT EXISTS (
      SELECT 1 FROM public.app_notifications existing
      WHERE existing.user_id = user_role.user_id
        AND existing.type = 'chat'
        AND existing.reference_id = NEW.id
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_trailhead_slot_capacity(p_location_id uuid, p_max_groups integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_value integer;
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Central Admin may change slot capacity' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NULL OR p_max_groups IS NULL OR p_max_groups < 1 OR p_max_groups > 50 THEN
    RAISE EXCEPTION 'Capacity must be between 1 and 50 groups';
  END IF;
  SELECT max_groups INTO old_value
  FROM public.trailhead_slot_capacity_settings
  WHERE location_id = p_location_id;
  INSERT INTO public.trailhead_slot_capacity_settings(location_id, max_groups, updated_by)
  VALUES (p_location_id, p_max_groups, actor)
  ON CONFLICT (location_id) DO UPDATE SET
    max_groups = excluded.max_groups,
    updated_by = excluded.updated_by,
    updated_at = now();

  IF old_value IS DISTINCT FROM p_max_groups THEN
    INSERT INTO public.trailhead_slot_capacity_audit(location_id, old_max_groups, new_max_groups, changed_by)
    VALUES (p_location_id, old_value, p_max_groups, actor);
    INSERT INTO public.app_notifications(
      user_id, sender_id, type, title, body, category, reference_id,
      target_type, target_id, link, route, read, is_read
    )
    SELECT ur.user_id, actor, 'capacity', 'Booking capacity updated',
      format('The trailhead slot capacity changed from %s to %s groups.', coalesce(old_value, 1), p_max_groups),
      'system', p_location_id, 'location', p_location_id, '/admin', '/admin', false, false
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'guide'::public.app_role)
      AND (
        ur.role = 'guide'::public.app_role
        OR EXISTS (
          SELECT 1 FROM public.user_locations ul
          WHERE ul.user_id = ur.user_id AND ul.location_id = p_location_id
        )
      );
  END IF;
  RETURN jsonb_build_object(
    'locationId', p_location_id,
    'oldMaxGroups', coalesce(old_value, 1),
    'maxGroups', p_max_groups
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_trailhead_slot_capacity(uuid, integer) TO authenticated;

-- Remove legacy operational inbox rows that were incorrectly delivered to
-- Central Admin before this audience scope was installed.
DELETE FROM public.app_notifications notification
USING public.user_roles role_row
WHERE role_row.user_id = notification.user_id
  AND role_row.role = 'super_admin'
  AND (
    notification.category IN ('booking', 'session')
    OR notification.type IN ('booking', 'session')
  );

NOTIFY pgrst, 'reload schema';
