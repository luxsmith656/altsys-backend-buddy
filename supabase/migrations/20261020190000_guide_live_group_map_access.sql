-- Allow a guide to monitor only the active participants in bookings assigned to
-- that guide. Staff location policies remain unchanged, and no guide receives
-- access to another guide's booking or to unrelated hikers.

DROP POLICY IF EXISTS hs_guide_assigned_select ON public.hiker_sessions;
CREATE POLICY hs_guide_assigned_select
ON public.hiker_sessions
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
    WHERE ba.booking_id = hiker_sessions.booking_id
      AND ba.status IN ('pending', 'accepted')
      AND assigned_guide.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS hl_guide_assigned_select ON public.hiker_locations;
CREATE POLICY hl_guide_assigned_select
ON public.hiker_locations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    JOIN public.booking_assignments ba ON ba.booking_id = hs.booking_id
    JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
    WHERE hs.id = hiker_locations.session_id
      AND hs.status = 'active'
      AND ba.status IN ('pending', 'accepted')
      AND assigned_guide.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS profiles_guide_assigned_select ON public.profiles;
CREATE POLICY profiles_guide_assigned_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    JOIN public.booking_assignments ba ON ba.booking_id = hs.booking_id
    JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
    WHERE hs.user_id = profiles.user_id
      AND hs.status = 'active'
      AND ba.status IN ('pending', 'accepted')
      AND assigned_guide.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS station_report_guide_read ON public.hike_station_reports;
CREATE POLICY station_report_guide_read
ON public.hike_station_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    JOIN public.booking_assignments ba ON ba.booking_id = hs.booking_id
    JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
    WHERE hs.id = hike_station_reports.session_id
      AND hs.status = 'active'
      AND ba.status IN ('pending', 'accepted')
      AND assigned_guide.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS checkpoint_survey_guide_select ON public.checkpoint_surveys;
CREATE POLICY checkpoint_survey_guide_select
ON public.checkpoint_surveys
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    JOIN public.booking_assignments ba ON ba.booking_id = hs.booking_id
    JOIN public.guides assigned_guide ON assigned_guide.id = ba.guide_id
    WHERE hs.id = checkpoint_surveys.session_id
      AND hs.status = 'active'
      AND ba.status IN ('pending', 'accepted')
      AND assigned_guide.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_booking_assignments_guide_booking_status
  ON public.booking_assignments(guide_id, booking_id, status);

NOTIFY pgrst, 'reload schema';
