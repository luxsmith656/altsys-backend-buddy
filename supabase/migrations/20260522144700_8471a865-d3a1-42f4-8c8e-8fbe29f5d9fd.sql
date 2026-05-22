
-- Hiker session metrics for Strava-style summary
ALTER TABLE public.hiker_sessions
  ADD COLUMN IF NOT EXISTS moving_time_sec integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resting_time_sec integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elevation_gain_m integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elevation_loss_m integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ascent_time_sec integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descent_time_sec integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summit_reached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encoded_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS hiker_sessions_client_session_id_key
  ON public.hiker_sessions(client_session_id)
  WHERE client_session_id IS NOT NULL;

-- Booking assignment audit for reassignment
ALTER TABLE public.booking_assignments
  ADD COLUMN IF NOT EXISTS reassignment_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by uuid,
  ADD COLUMN IF NOT EXISTS replaces uuid;

-- Rescue points
CREATE TABLE IF NOT EXISTS public.rescue_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'rescue',
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rescue_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_public_read ON public.rescue_points;
CREATE POLICY rp_public_read ON public.rescue_points FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS rp_admin_manage ON public.rescue_points;
CREATE POLICY rp_admin_manage ON public.rescue_points FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ranger'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ranger'::app_role));
