ALTER TABLE public.emergency_alerts
  ADD COLUMN IF NOT EXISTS pushed_latitude double precision,
  ADD COLUMN IF NOT EXISTS pushed_longitude double precision,
  ADD COLUMN IF NOT EXISTS last_location_at timestamptz;

CREATE INDEX IF NOT EXISTS emergency_alerts_open_booking_idx
  ON public.emergency_alerts(booking_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_own_emergency_alert_location(
  p_alert_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.emergency_alerts
  SET latitude = p_latitude, longitude = p_longitude, last_location_at = now()
  WHERE id = p_alert_id AND user_id = auth.uid() AND status IN ('open', 'acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'Emergency alert is not active or not owned by this account'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_emergency_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.emergency_alerts
  SET status = 'cancelled', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_alert_id AND user_id = auth.uid() AND status IN ('open', 'acknowledged');
  IF NOT FOUND THEN RAISE EXCEPTION 'Emergency alert is not active or not owned by this account'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_own_emergency_alert_location(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_emergency_alert(uuid) TO authenticated;
