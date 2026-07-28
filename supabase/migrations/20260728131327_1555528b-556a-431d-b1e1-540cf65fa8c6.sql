
CREATE OR REPLACE FUNCTION public.ai_booking_summary(
  p_start_date date,
  p_end_date date,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_confirmed_bookings int := 0;
  v_confirmed_hikers int := 0;
  v_pending_bookings int := 0;
  v_pending_hikers int := 0;
  v_cancelled_bookings int := 0;
  v_capacity int := 0;
BEGIN
  IF v_uid IS NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;
  IF (p_end_date - p_start_date) > 92 THEN
    RAISE EXCEPTION 'date range too large';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.group_size ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.status = 'pending' THEN b.group_size ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END), 0)
  INTO v_confirmed_bookings, v_confirmed_hikers, v_pending_bookings, v_pending_hikers, v_cancelled_bookings
  FROM public.bookings b
  WHERE b.booking_date BETWEEN p_start_date AND p_end_date
    AND (p_location_id IS NULL OR b.location_id = p_location_id);

  SELECT COALESCE(SUM(dc.max_capacity), 0)
  INTO v_capacity
  FROM public.daily_capacity dc
  WHERE dc.date BETWEEN p_start_date AND p_end_date
    AND (p_location_id IS NULL OR dc.location_id = p_location_id);

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'confirmed_booking_count', v_confirmed_bookings,
    'confirmed_hiker_count', v_confirmed_hikers,
    'pending_booking_count', v_pending_bookings,
    'pending_hiker_count', v_pending_hikers,
    'cancelled_booking_count', v_cancelled_bookings,
    'capacity', v_capacity,
    'remaining_capacity', GREATEST(v_capacity - v_confirmed_hikers, 0),
    'timezone', 'Asia/Manila',
    'checked_at', to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_attendance_summary(
  p_start_date date,
  p_end_date date,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_expected int := 0;
  v_checked_in int := 0;
  v_completed int := 0;
BEGIN
  IF v_uid IS NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;
  IF (p_end_date - p_start_date) > 92 THEN
    RAISE EXCEPTION 'date range too large';
  END IF;

  SELECT COALESCE(SUM(b.group_size), 0)
  INTO v_expected
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND b.booking_date BETWEEN p_start_date AND p_end_date
    AND (p_location_id IS NULL OR b.location_id = p_location_id);

  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END), 0)
  INTO v_checked_in, v_completed
  FROM public.hiker_sessions s
  WHERE ((s.start_time AT TIME ZONE 'Asia/Manila')::date) BETWEEN p_start_date AND p_end_date
    AND (p_location_id IS NULL OR s.location_id = p_location_id);

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'expected_hiker_count', v_expected,
    'checked_in_hiker_count', v_checked_in,
    'completed_hiker_count', v_completed,
    'no_show_hiker_count', GREATEST(v_expected - v_checked_in, 0),
    'timezone', 'Asia/Manila',
    'checked_at', to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
  );
END;
$$;
