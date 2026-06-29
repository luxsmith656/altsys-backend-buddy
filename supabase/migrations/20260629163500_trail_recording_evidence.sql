-- Store raw GPS evidence separately from the cleaned official trail geometry.
ALTER TABLE public.trail_zones
  ADD COLUMN IF NOT EXISTS raw_recording_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cleaned_recording_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recording_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.trail_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_zone_id uuid REFERENCES public.trail_zones(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'gps_recording',
  status text NOT NULL DEFAULT 'draft',
  raw_points_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  cleaned_points_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trail_recordings_trail_zone_id
  ON public.trail_recordings(trail_zone_id);

CREATE INDEX IF NOT EXISTS idx_trail_recordings_location_id
  ON public.trail_recordings(location_id);

CREATE INDEX IF NOT EXISTS idx_trail_recordings_recorded_by
  ON public.trail_recordings(recorded_by);

ALTER TABLE public.trail_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trail_recordings_read ON public.trail_recordings;
CREATE POLICY trail_recordings_read ON public.trail_recordings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'ranger'::app_role)
    OR public.has_role(auth.uid(), 'guide'::app_role)
    OR recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS trail_recordings_insert_staff ON public.trail_recordings;
CREATE POLICY trail_recordings_insert_staff ON public.trail_recordings
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'ranger'::app_role)
      OR public.has_role(auth.uid(), 'guide'::app_role)
    )
  );

DROP POLICY IF EXISTS trail_recordings_update_staff ON public.trail_recordings;
CREATE POLICY trail_recordings_update_staff ON public.trail_recordings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'ranger'::app_role)
    OR recorded_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'ranger'::app_role)
    OR recorded_by = auth.uid()
  );
