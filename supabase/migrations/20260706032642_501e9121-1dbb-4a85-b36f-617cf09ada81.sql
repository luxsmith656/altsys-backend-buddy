ALTER TABLE public.trail_recordings
  ADD COLUMN IF NOT EXISTS review_decision text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS comparison_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_trail_recordings_review_decision
  ON public.trail_recordings(review_decision);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trail_recordings TO authenticated;
GRANT ALL ON public.trail_recordings TO service_role;
REVOKE ALL ON public.trail_recordings FROM anon;

DROP POLICY IF EXISTS trail_recordings_delete_staff ON public.trail_recordings;
CREATE POLICY trail_recordings_delete_staff ON public.trail_recordings
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'ranger'::app_role)
    OR recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS tz_guide_delete_own_draft ON public.trail_zones;
CREATE POLICY tz_guide_delete_own_draft ON public.trail_zones
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'guide'::app_role)
    AND recorded_by = auth.uid()
    AND status = 'draft'
    AND is_official = false
  );