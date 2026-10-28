-- Let an assigned guide see the active tracking records for the booking they
-- are guiding. The security-definer helpers avoid recursive RLS evaluation
-- when a guide reads a session's locations or participant profile.

CREATE OR REPLACE FUNCTION public.guide_can_view_active_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.booking_assignments ba ON ba.booking_id = b.id
    JOIN public.guides g ON g.id = ba.guide_id
    WHERE b.id = _booking_id
      AND b.status IN ('confirmed', 'checked_in', 'in_progress', 'active', 'accepted')
      AND ba.status IS DISTINCT FROM 'declined'
      AND ba.status IS DISTINCT FROM 'completed'
      AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.guide_can_view_active_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    WHERE hs.id = _session_id
      AND hs.status = 'active'
      AND hs.booking_id IS NOT NULL
      AND public.guide_can_view_active_booking(hs.booking_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.guide_can_view_active_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guide_can_view_active_session(uuid) TO authenticated;

DROP POLICY IF EXISTS hs_guide_assigned_select ON public.hiker_sessions;
CREATE POLICY hs_guide_assigned_select
ON public.hiker_sessions
FOR SELECT TO authenticated
USING (public.guide_can_view_active_session(id));

DROP POLICY IF EXISTS hl_guide_assigned_select ON public.hiker_locations;
CREATE POLICY hl_guide_assigned_select
ON public.hiker_locations
FOR SELECT TO authenticated
USING (public.guide_can_view_active_session(session_id));

DROP POLICY IF EXISTS profiles_guide_assigned_select ON public.profiles;
CREATE POLICY profiles_guide_assigned_select
ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    WHERE hs.user_id = profiles.user_id
      AND public.guide_can_view_active_session(hs.id)
  )
);

DROP POLICY IF EXISTS station_report_guide_read ON public.hike_station_reports;
CREATE POLICY station_report_guide_read
ON public.hike_station_reports
FOR SELECT TO authenticated
USING (public.guide_can_view_active_session(session_id));

DROP POLICY IF EXISTS checkpoint_survey_guide_select ON public.checkpoint_surveys;
CREATE POLICY checkpoint_survey_guide_select
ON public.checkpoint_surveys
FOR SELECT TO authenticated
USING (public.guide_can_view_active_session(session_id));

-- QR companions do not have an auth.users row. Keep their latest beacon in a
-- separate, bounded table and expose it only through the join claim or the
-- assigned guide's active booking.
CREATE TABLE IF NOT EXISTS public.booking_companion_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  companion_index integer NOT NULL CHECK (companion_index >= 0),
  companion_name text NOT NULL,
  device_id text NOT NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  accuracy numeric(8,2),
  speed_m_s numeric(8,3),
  heading numeric(7,3),
  timestamp timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  UNIQUE (booking_id, companion_index)
);

ALTER TABLE public.booking_companion_locations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS booking_companion_locations_booking_idx
  ON public.booking_companion_locations(booking_id, status, timestamp DESC);

DROP POLICY IF EXISTS companion_location_guide_select ON public.booking_companion_locations;
CREATE POLICY companion_location_guide_select
ON public.booking_companion_locations
FOR SELECT TO authenticated
USING (public.guide_can_view_active_booking(booking_id));

DROP POLICY IF EXISTS companion_location_staff_select ON public.booking_companion_locations;
CREATE POLICY companion_location_staff_select
ON public.booking_companion_locations
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ranger'::public.app_role))
  AND public.admin_can_access_location((SELECT b.location_id FROM public.bookings b WHERE b.id = booking_id))
);

CREATE OR REPLACE FUNCTION public.upsert_booking_companion_location(
  p_join_code text,
  p_companion_index integer,
  p_device_id text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL,
  p_speed_m_s numeric DEFAULT NULL,
  p_heading numeric DEFAULT NULL,
  p_timestamp timestamptz DEFAULT now()
)
RETURNS public.booking_companion_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  claim_row public.booking_companion_claims%ROWTYPE;
  saved public.booking_companion_locations%ROWTYPE;
BEGIN
  IF NULLIF(trim(p_join_code), '') IS NULL
    OR NULLIF(trim(p_device_id), '') IS NULL
    OR p_companion_index IS NULL
    OR p_latitude IS NULL OR p_longitude IS NULL
    OR p_latitude NOT BETWEEN -90 AND 90
    OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'A valid companion location is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO booking_row
  FROM public.bookings
  WHERE companion_join_code = upper(trim(p_join_code))
    AND status IN ('confirmed', 'checked_in', 'in_progress', 'active', 'accepted')
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This companion link is invalid or no longer active' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO claim_row
  FROM public.booking_companion_claims
  WHERE booking_id = booking_row.id
    AND companion_index = p_companion_index
    AND claimed_device_id = trim(p_device_id)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim this companion slot before sending location' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.booking_companion_locations (
    booking_id, companion_index, companion_name, device_id,
    latitude, longitude, accuracy, speed_m_s, heading, timestamp, updated_at, status
  ) VALUES (
    booking_row.id, p_companion_index, claim_row.companion_name, trim(p_device_id),
    p_latitude, p_longitude, p_accuracy, p_speed_m_s, p_heading,
    COALESCE(p_timestamp, now()), now(), 'active'
  )
  ON CONFLICT (booking_id, companion_index) DO UPDATE
  SET companion_name = EXCLUDED.companion_name,
      device_id = EXCLUDED.device_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      accuracy = EXCLUDED.accuracy,
      speed_m_s = EXCLUDED.speed_m_s,
      heading = EXCLUDED.heading,
      timestamp = EXCLUDED.timestamp,
      updated_at = now(),
      status = 'active'
  WHERE public.booking_companion_locations.device_id = EXCLUDED.device_id
    AND EXCLUDED.timestamp >= public.booking_companion_locations.timestamp;

  SELECT * INTO saved
  FROM public.booking_companion_locations
  WHERE booking_id = booking_row.id AND companion_index = p_companion_index;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_booking_companion_location(text, integer, text, numeric, numeric, numeric, numeric, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_booking_companion_location(text, integer, text, numeric, numeric, numeric, numeric, numeric, timestamptz) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
