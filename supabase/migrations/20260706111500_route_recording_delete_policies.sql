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
