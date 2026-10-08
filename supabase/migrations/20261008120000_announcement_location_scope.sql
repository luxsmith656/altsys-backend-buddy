-- Scope local-admin announcements to their trailhead. Central announcements
-- keep location_id NULL and are visible across all trailheads.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS announcements_location_created_idx
  ON public.announcements (location_id, created_at DESC);
