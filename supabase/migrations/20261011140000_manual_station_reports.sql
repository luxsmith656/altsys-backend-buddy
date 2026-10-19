CREATE TABLE IF NOT EXISTS public.hike_station_reports (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.hiker_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  station smallint NOT NULL CHECK (station BETWEEN 1 AND 6),
  reported_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hike_station_reports ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.hike_station_reports ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.hike_station_reports ADD COLUMN IF NOT EXISTS accuracy double precision;
ALTER TABLE public.hike_station_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.hike_station_reports TO authenticated;
-- This migration is also used in the SQL editor during recovery. Recreate
-- only these named policies so rerunning it never fails with 42710.
DROP POLICY IF EXISTS station_report_read ON public.hike_station_reports;
DROP POLICY IF EXISTS station_report_insert ON public.hike_station_reports;
CREATE POLICY station_report_read ON public.hike_station_reports FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR
  (public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.hiker_sessions hs JOIN public.user_locations ul
      ON ul.location_id = hs.location_id AND ul.user_id = auth.uid()
    WHERE hs.id = session_id
  ))
);
CREATE POLICY station_report_insert ON public.hike_station_reports FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.hiker_sessions hs
  WHERE hs.id = session_id AND hs.user_id = auth.uid() AND hs.status = 'active'
));
CREATE INDEX IF NOT EXISTS station_report_session_time ON public.hike_station_reports(session_id, reported_at DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'hike_station_reports' AND schemaname = 'public') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hike_station_reports;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
