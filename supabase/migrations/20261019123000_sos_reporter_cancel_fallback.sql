DROP POLICY IF EXISTS emergency_alerts_reporter_cancel ON public.emergency_alerts;
CREATE POLICY emergency_alerts_reporter_cancel ON public.emergency_alerts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('open', 'acknowledged'))
  WITH CHECK (user_id = auth.uid() AND status IN ('cancelled', 'open', 'acknowledged'));
