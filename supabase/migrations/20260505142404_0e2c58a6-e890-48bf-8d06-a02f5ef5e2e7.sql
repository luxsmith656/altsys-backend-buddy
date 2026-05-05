
-- SOS Alerts
CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID,
  booking_id UUID,
  location_id UUID,
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', -- active | acknowledged | resolved | escalated
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hikers create own sos"
  ON public.sos_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Hikers view own sos"
  ON public.sos_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Location staff view location sos"
  ON public.sos_alerts FOR SELECT
  USING (location_id IS NULL OR works_at_location(auth.uid(), location_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Location staff update location sos"
  ON public.sos_alerts FOR UPDATE
  USING (works_at_location(auth.uid(), location_id) OR is_super_admin(auth.uid()))
  WITH CHECK (works_at_location(auth.uid(), location_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages sos"
  ON public.sos_alerts FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_sos_alerts_updated_at
  BEFORE UPDATE ON public.sos_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
ALTER TABLE public.sos_alerts REPLICA IDENTITY FULL;

-- Bookings: preferred_guide_fee + planned route
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS preferred_guide_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS planned_route_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS sos_alerts_status_idx ON public.sos_alerts(status);
CREATE INDEX IF NOT EXISTS sos_alerts_location_idx ON public.sos_alerts(location_id);
CREATE INDEX IF NOT EXISTS sos_alerts_created_idx ON public.sos_alerts(created_at DESC);
