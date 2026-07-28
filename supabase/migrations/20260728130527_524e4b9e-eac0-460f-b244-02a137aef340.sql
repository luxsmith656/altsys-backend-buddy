
CREATE TABLE IF NOT EXISTS public.ai_tool_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_tool_logs TO authenticated;
GRANT ALL ON public.ai_tool_logs TO service_role;

ALTER TABLE public.ai_tool_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai tool logs" ON public.ai_tool_logs;
CREATE POLICY "Users can view own ai tool logs" ON public.ai_tool_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Users can insert own ai tool logs" ON public.ai_tool_logs;
CREATE POLICY "Users can insert own ai tool logs" ON public.ai_tool_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

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
  v_confirmed_bookings int := 0;
  v_confirmed_hikers int := 0;
  v_pending_bookings int := 0;
  v_pending_hikers int := 0;
  v_cancelled_bookings int := 0;
  v_capacity int := 0;
  v_used int := 0;
BEGIN
  IF v_uid IS NULL THEN
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

  v_used := v_confirmed_hikers;

  RETURN jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'confirmed_booking_count', v_confirmed_bookings,
    'confirmed_hiker_count', v_confirmed_hikers,
    'pending_booking_count', v_pending_bookings,
    'pending_hiker_count', v_pending_hikers,
    'cancelled_booking_count', v_cancelled_bookings,
    'capacity', v_capacity,
    'remaining_capacity', GREATEST(v_capacity - v_used, 0),
    'timezone', 'Asia/Manila',
    'checked_at', to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_booking_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_booking_summary(date, date, uuid) TO authenticated, service_role;

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
  v_expected int := 0;
  v_checked_in int := 0;
  v_completed int := 0;
BEGIN
  IF v_uid IS NULL THEN
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

REVOKE ALL ON FUNCTION public.ai_attendance_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_attendance_summary(date, date, uuid) TO authenticated, service_role;
