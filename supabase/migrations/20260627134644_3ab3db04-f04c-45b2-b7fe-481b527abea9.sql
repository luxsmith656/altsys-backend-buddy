ALTER TABLE public.trail_zones
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS official_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_trail_zones_review_status
  ON public.trail_zones(review_status);

DROP POLICY IF EXISTS tz_guide_insert_draft ON public.trail_zones;
CREATE POLICY tz_guide_insert_draft ON public.trail_zones
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'guide'::app_role)
    AND recorded_by = auth.uid()
    AND status = 'draft'
    AND review_status = 'pending'
    AND is_official = false
  );

DROP POLICY IF EXISTS tz_guide_update_own_draft ON public.trail_zones;
CREATE POLICY tz_guide_update_own_draft ON public.trail_zones
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'guide'::app_role)
    AND recorded_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'guide'::app_role)
    AND recorded_by = auth.uid()
    AND status = 'draft'
    AND review_status = 'pending'
    AND is_official = false
  );

CREATE OR REPLACE FUNCTION public.sync_trail_zone_official_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    NEW.is_official := true;
    NEW.review_status := 'approved';
    NEW.official_at := COALESCE(NEW.official_at, now());
  ELSIF NEW.status = 'draft' THEN
    NEW.is_official := false;
    NEW.review_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trail_zone_official_state ON public.trail_zones;
CREATE TRIGGER trg_sync_trail_zone_official_state
BEFORE INSERT OR UPDATE ON public.trail_zones
FOR EACH ROW EXECUTE FUNCTION public.sync_trail_zone_official_state();