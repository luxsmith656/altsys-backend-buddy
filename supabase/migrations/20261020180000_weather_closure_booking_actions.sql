-- Weather closures are central-admin actions against the existing booking
-- lifecycle. They cancel only open bookings, preserve the reason in notes,
-- and give paid hikers an auditable refund-request path.

CREATE OR REPLACE FUNCTION public.central_cancel_bookings_for_weather(
  p_booking_date date,
  p_reason text,
  p_announcement_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  cancelled_at timestamptz := now();
  booking_row public.bookings%ROWTYPE;
  meta jsonb;
  payment_paid boolean;
  affected integer := 0;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Central Admin may cancel bookings for a weather closure' USING ERRCODE = '42501';
  END IF;
  IF p_booking_date IS NULL THEN
    RAISE EXCEPTION 'A closure date is required' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'A weather closure reason is required' USING ERRCODE = '22023';
  END IF;

  FOR booking_row IN
    SELECT *
    FROM public.bookings
    WHERE booking_date = p_booking_date
      AND status IN ('pending', 'confirmed', 'accepted', 'approved', 'adjustment_pending')
    FOR UPDATE
  LOOP
    meta := public.safe_booking_meta(booking_row.notes);
    payment_paid := lower(COALESCE(meta->>'paymentStatus', '')) IN ('paid', 'partial');
    IF COALESCE(meta->>'amountPaid', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      payment_paid := payment_paid OR (meta->>'amountPaid')::numeric > 0;
    END IF;
    meta := meta || jsonb_build_object(
      'weatherCancellation', jsonb_build_object(
        'announcementId', p_announcement_id,
        'reason', clean_reason,
        'cancelledAt', cancelled_at,
        'cancelledBy', actor_id,
        'refundEligible', payment_paid
      ),
      'cancellationReason', clean_reason,
      'cancelledBy', 'central_weather'
    );

    UPDATE public.bookings
    SET status = 'cancelled', notes = meta::text
    WHERE id = booking_row.id;

    -- Replace the generic lifecycle alert with one that carries the actual
    -- closure reason. The lifecycle trigger has already run in this txn.
    DELETE FROM public.app_notifications
    WHERE user_id = booking_row.user_id
      AND category = 'booking'
      AND link = '/hiker?bookingId=' || booking_row.id::text
      AND title = 'Booking cancelled'
      AND created_at >= cancelled_at;

    INSERT INTO public.app_notifications(user_id, title, body, category, link)
    VALUES (
      booking_row.user_id,
      'Weather cancellation — action available',
      'Your ' || to_char(booking_row.booking_date, 'Mon DD, YYYY') || ' hike was cancelled because of a weather closure: ' || clean_reason || CASE WHEN payment_paid THEN ' You may request a reschedule or refund from your dashboard.' ELSE ' You may request a reschedule from your dashboard.' END,
      'booking',
      '/hiker?bookingId=' || booking_row.id::text
    );
    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.central_cancel_bookings_for_weather(date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.central_cancel_bookings_for_weather(date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_weather_booking_reschedule(
  p_booking_id uuid,
  p_new_date date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  meta jsonb;
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to request a reschedule' USING ERRCODE = '42501';
  END IF;
  IF p_new_date IS NULL OR p_new_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a future hike date';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) < 5 THEN
    RAISE EXCEPTION 'A reschedule reason is required';
  END IF;

  SELECT * INTO booking_row
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  meta := public.safe_booking_meta(booking_row.notes);
  IF booking_row.status <> 'cancelled' OR jsonb_typeof(meta->'weatherCancellation') <> 'object' THEN
    RAISE EXCEPTION 'Only a weather-cancelled booking can use this reschedule option';
  END IF;
  IF meta->>'refundStatus' IN ('requested', 'processing', 'refunded') THEN
    RAISE EXCEPTION 'A refund request already exists for this booking';
  END IF;

  meta := meta || jsonb_build_object(
    'weatherRescheduleRequestedAt', now(),
    'weatherRescheduleRequestedBy', auth.uid(),
    'requestedRescheduleReason', clean_reason
  );
  UPDATE public.bookings
  SET status = 'adjustment_pending', requested_new_date = p_new_date, requested_at = now(), notes = meta::text
  WHERE id = booking_row.id;

  RETURN jsonb_build_object('bookingId', booking_row.id, 'requestedDate', p_new_date, 'status', 'adjustment_pending');
END;
$$;

REVOKE ALL ON FUNCTION public.request_weather_booking_reschedule(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_weather_booking_reschedule(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_weather_booking_refund(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  meta jsonb;
  amount_paid numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to request a refund' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO booking_row
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  meta := public.safe_booking_meta(booking_row.notes);
  IF COALESCE(meta->>'amountPaid', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    amount_paid := (meta->>'amountPaid')::numeric;
  END IF;
  IF booking_row.status <> 'cancelled' OR jsonb_typeof(meta->'weatherCancellation') <> 'object' THEN
    RAISE EXCEPTION 'Refunds are available only for weather-cancelled bookings';
  END IF;
  IF lower(COALESCE(meta->>'paymentStatus', '')) NOT IN ('paid', 'partial') AND amount_paid <= 0 THEN
    RAISE EXCEPTION 'This booking has no recorded payment to refund';
  END IF;
  IF meta->>'refundStatus' IN ('requested', 'processing', 'refunded') THEN
    RETURN jsonb_build_object('bookingId', booking_row.id, 'status', meta->>'refundStatus');
  END IF;

  meta := meta || jsonb_build_object(
    'refundStatus', 'requested',
    'refundRequestedAt', now(),
    'refundRequestedBy', auth.uid(),
    'refundAmount', amount_paid
  );
  UPDATE public.bookings SET notes = meta::text WHERE id = booking_row.id;

  INSERT INTO public.app_notifications(user_id, title, body, category, link)
  SELECT DISTINCT
    roles.user_id,
    'Weather booking refund requested',
    'A hiker requested a refund for a weather-cancelled booking on ' || to_char(booking_row.booking_date, 'Mon DD, YYYY') || '.',
    'booking',
    '/admin?tab=requests&bookingId=' || booking_row.id::text
  FROM public.user_roles roles
  LEFT JOIN public.user_locations locations ON locations.user_id = roles.user_id
  WHERE roles.role IN ('admin', 'super_admin')
    AND (roles.role = 'super_admin' OR locations.location_id = booking_row.location_id);

  RETURN jsonb_build_object('bookingId', booking_row.id, 'status', 'requested', 'amount', amount_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.request_weather_booking_refund(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_weather_booking_refund(uuid) TO authenticated;

-- Valid companion links remain usable while the booking is awaiting a weather
-- reschedule decision or has an older approved status.
CREATE OR REPLACE FUNCTION public.get_booking_companion_options(p_join_code text)
RETURNS TABLE (
  booking_id uuid,
  booking_date date,
  group_size integer,
  companion_index integer,
  companion_name text,
  claimed boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.booking_date, b.group_size, names.companion_index,
         names.companion_name, claims.id IS NOT NULL
  FROM public.bookings b
  JOIN LATERAL public.booking_companion_names(b.id) names ON true
  LEFT JOIN public.booking_companion_claims claims
    ON claims.booking_id = b.id AND claims.companion_index = names.companion_index
  WHERE b.companion_join_code = upper(trim(p_join_code))
    AND b.group_size > 1
    AND b.status IN ('pending', 'confirmed', 'accepted', 'approved', 'checked_in', 'in_progress', 'active', 'adjustment_pending');
$$;

CREATE OR REPLACE FUNCTION public.claim_booking_companion(
  p_join_code text,
  p_companion_index integer,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  name_row record;
  existing public.booking_companion_claims%ROWTYPE;
  claimant uuid := auth.uid();
BEGIN
  IF NULLIF(trim(p_join_code), '') IS NULL OR p_companion_index IS NULL OR NULLIF(trim(p_device_id), '') IS NULL THEN
    RAISE EXCEPTION 'A valid companion link and companion selection are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM public.bookings
  WHERE companion_join_code = upper(trim(p_join_code))
    AND group_size > 1
    AND status IN ('pending', 'confirmed', 'accepted', 'approved', 'checked_in', 'in_progress', 'active', 'adjustment_pending')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This companion link is invalid, expired, or no longer active'; END IF;
  SELECT * INTO name_row FROM public.booking_companion_names(b.id) WHERE companion_index = p_companion_index;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a companion name from this booking'; END IF;
  SELECT * INTO existing FROM public.booking_companion_claims
  WHERE booking_id = b.id AND companion_index = p_companion_index FOR UPDATE;
  IF FOUND THEN
    IF existing.claimed_device_id = p_device_id OR (claimant IS NOT NULL AND existing.claimed_by = claimant) THEN
      RETURN jsonb_build_object('bookingId', b.id, 'companionIndex', existing.companion_index, 'companionName', existing.companion_name, 'alreadyClaimedByThisDevice', true);
    END IF;
    RAISE EXCEPTION 'That companion has already been claimed on another device';
  END IF;
  INSERT INTO public.booking_companion_claims (booking_id, companion_index, companion_name, claimed_by, claimed_device_id)
  VALUES (b.id, p_companion_index, name_row.companion_name, claimant, p_device_id);
  RETURN jsonb_build_object('bookingId', b.id, 'companionIndex', p_companion_index, 'companionName', name_row.companion_name, 'alreadyClaimedByThisDevice', false);
END;
$$;

-- Repair codes left blank by earlier trigger failures.
UPDATE public.bookings
SET companion_join_code = upper(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10))
WHERE COALESCE(group_size, 1) > 1
  AND NULLIF(trim(companion_join_code), '') IS NULL;

GRANT EXECUTE ON FUNCTION public.get_booking_companion_options(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_companion(text, integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
