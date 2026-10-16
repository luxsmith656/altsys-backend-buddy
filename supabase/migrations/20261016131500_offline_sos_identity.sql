ALTER TABLE public.emergency_alerts
  ADD COLUMN IF NOT EXISTS client_alert_id text;

CREATE UNIQUE INDEX IF NOT EXISTS emergency_alerts_client_alert_id_key
  ON public.emergency_alerts(client_alert_id)
  WHERE client_alert_id IS NOT NULL;
