-- Keep reschedule ownership and decisions in the booking workflow.
-- A hiker request is one locked booking transition; chat is never used to
-- create or decide a booking change.

CREATE OR REPLACE FUNCTION public.request_booking_reschedule(
  p_booking_id uuid,
  p_new_date date,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  meta jsonb;
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  existing_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to request a reschedule' USING ERRCODE = '42501';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) < 5 THEN
    RAISE EXCEPTION 'A reschedule reason is required';
  END IF;
  IF p_new_date IS NULL OR p_new_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a future hike date';
  END IF;

  SELECT * INTO b
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the booking owner may request a reschedule' USING ERRCODE = '42501';
  END IF;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    meta := jsonb_build_object('userNotes', b.notes);
  END;

  -- A pending request is already the single active request. Repeating the
  -- same submit is idempotent; a different submit must wait for a decision.
  IF b.status = 'adjustment_pending' AND b.requested_new_date IS NOT NULL THEN
    existing_reason := NULLIF(meta ->> 'requestedRescheduleReason', '');
    IF b.requested_new_date = p_new_date AND existing_reason = clean_reason THEN
      RETURN jsonb_build_object('bookingId', b.id, 'duplicate', true, 'requestedDate', b.requested_new_date);
    END IF;
    RAISE EXCEPTION 'A reschedule request is already pending for this booking';
  END IF;
  IF b.status NOT IN ('pending', 'confirmed', 'accepted', 'approved') THEN
    RAISE EXCEPTION 'This booking cannot be rescheduled in its current state';
  END IF;

  meta := meta || jsonb_build_object(
    'requestedRescheduleReason', clean_reason,
    'rescheduleRequestedBy', auth.uid(),
    'rescheduleRequestedAt', now()
  );

  UPDATE public.bookings
  SET status = 'adjustment_pending',
      requested_new_date = p_new_date,
      requested_at = now(),
      notes = meta::text
  WHERE id = b.id;

  RETURN jsonb_build_object('bookingId', b.id, 'duplicate', false, 'requestedDate', p_new_date);
END;
$$;

REVOKE ALL ON FUNCTION public.request_booking_reschedule(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_booking_reschedule(uuid, date, text) TO authenticated;

-- Do not notify the hiker about their own request, and do not notify guides
-- until an administrator has actually decided the request.
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

  -- A hiker-created adjustment is addressed to the admin dispatch queue,
  -- not back to the hiker who just created it.
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
    LEFT JOIN public.user_locations user_location ON user_location.user_id = user_role.user_id
    WHERE user_role.user_id IS DISTINCT FROM actor_id
      AND (user_role.role = 'super_admin' OR (user_role.role = 'admin' AND user_location.location_id = NEW.location_id));
  END IF;

  -- Guides receive a notification for an administrator's decision or an
  -- actual date change, never for the initial hiker request.
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

DROP TRIGGER IF EXISTS booking_lifecycle_notification_after_update ON public.bookings;
CREATE TRIGGER booking_lifecycle_notification_after_update
  AFTER UPDATE OF status, booking_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_lifecycle_change();
