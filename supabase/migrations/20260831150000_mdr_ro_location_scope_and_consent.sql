-- Location-scoped dispatch access plus a limited MDRRMO emergency directory.
-- The mdrrmo enum value is added by the immediately preceding migration so
-- this migration can safely reference it in policies and functions.

INSERT INTO public.locations (
  slug, name, lgu, region, address, center_lat, center_lng, status,
  entry_fee, default_guide_fee, description
)
VALUES (
  'sto-tomas', 'Sto. Tomas Trailhead', 'Calauan', 'Laguna',
  'Sto. Tomas, Calauan, Laguna, Philippines', 14.1505, 121.3490, 'active',
  50, 500, 'Sto. Tomas entry point to Mt. Kalisungan'
)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mdrrmo_consent_version text;

CREATE OR REPLACE FUNCTION public.admin_can_access_location(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _location_id IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN true
    WHEN public.has_role(auth.uid(), 'mdrrmo'::public.app_role) THEN true
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN EXISTS (
      SELECT 1
      FROM public.user_locations ul
      WHERE ul.user_id = auth.uid()
        AND ul.location_id = _location_id
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.admin_can_access_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_can_access_location(uuid) TO authenticated;

-- This table intentionally contains no hiker details. It records who opened the
-- emergency directory and what booking/location scope was requested.
CREATE TABLE IF NOT EXISTS public.mdrrmo_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mdrrmo_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  access_type text NOT NULL DEFAULT 'directory_view',
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_accessed_at
  ON public.mdrrmo_access_logs(accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mdrrmo_access_logs_booking_id
  ON public.mdrrmo_access_logs(booking_id);

ALTER TABLE public.mdrrmo_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mdrrmo_access_logs_select ON public.mdrrmo_access_logs;
CREATE POLICY mdrrmo_access_logs_select ON public.mdrrmo_access_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR mdrrmo_user_id = auth.uid()
  );

DROP POLICY IF EXISTS mdrrmo_access_logs_insert ON public.mdrrmo_access_logs;
CREATE POLICY mdrrmo_access_logs_insert ON public.mdrrmo_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    mdrrmo_user_id = auth.uid()
    AND public.has_role(auth.uid(), 'mdrrmo'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.safe_booking_meta(_notes text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _notes IS NULL OR jsonb_typeof(_notes::jsonb) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN _notes::jsonb;
EXCEPTION WHEN others THEN
  RETURN '{}'::jsonb;
END;
$$;

-- Only emergency-response fields are returned. Raw notes, email, address,
-- payment data, and arbitrary booking metadata never leave this function.
CREATE OR REPLACE FUNCTION public.mdrrmo_daily_booking_directory(
  p_date date DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  location_id uuid,
  location_name text,
  booking_date date,
  group_size integer,
  lead_name text,
  contact_number text,
  age text,
  sex text,
  medical_notes text,
  people jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'mdrrmo'::public.app_role) THEN
    RAISE EXCEPTION 'MDRRMO access required';
  END IF;

  RETURN QUERY
  WITH source_rows AS (
    SELECT
      b.id,
      b.location_id,
      l.name AS location_name,
      b.booking_date,
      b.group_size,
      b.emergency_contact_name,
      b.emergency_contact_phone,
      public.safe_booking_meta(b.notes) AS meta
    FROM public.bookings b
    LEFT JOIN public.locations l ON l.id = b.location_id
    WHERE b.booking_date = p_date
      AND b.status <> 'cancelled'
      AND (p_location_id IS NULL OR b.location_id = p_location_id)
  )
  SELECT
    s.id,
    s.location_id,
    COALESCE(s.location_name, 'Unassigned location'),
    s.booking_date,
    COALESCE(s.group_size, 1),
    COALESCE(NULLIF(s.meta->>'fullName', ''), s.emergency_contact_name, 'Unnamed hiker'),
    COALESCE(NULLIF(s.meta->>'phoneNumber', ''), s.emergency_contact_phone, 'Not provided'),
    COALESCE(NULLIF(s.meta->>'age', ''), 'Not provided'),
    COALESCE(NULLIF(s.meta->>'sex', ''), 'Not provided'),
    COALESCE(NULLIF(s.meta->>'medicalNotes', ''), 'None recorded'),
    jsonb_build_array(jsonb_build_object(
      'name', COALESCE(NULLIF(s.meta->>'fullName', ''), s.emergency_contact_name, 'Unnamed hiker'),
      'age', COALESCE(NULLIF(s.meta->>'age', ''), 'Not provided'),
      'sex', COALESCE(NULLIF(s.meta->>'sex', ''), 'Not provided'),
      'medicalNotes', COALESCE(NULLIF(s.meta->>'medicalNotes', ''), 'None recorded')
    )) || COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'name', COALESCE(NULLIF(companion->>'name', ''), 'Companion'),
          'age', COALESCE(NULLIF(companion->>'age', ''), 'Not provided'),
          'sex', COALESCE(NULLIF(companion->>'sex', ''), 'Not provided'),
          'medicalNotes', COALESCE(NULLIF(companion->>'medicalNotes', ''), 'None recorded')
        ))
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(s.meta->'companionDetails') = 'array' THEN s.meta->'companionDetails'
            ELSE '[]'::jsonb
          END
        ) companion
      ),
      '[]'::jsonb
    )
  FROM source_rows s
  ORDER BY s.location_name, s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.mdrrmo_daily_booking_directory(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mdrrmo_daily_booking_directory(date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mdrrmo_log_access(
  p_booking_ids uuid[] DEFAULT '{}',
  p_location_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'mdrrmo'::public.app_role) THEN
    RAISE EXCEPTION 'MDRRMO access required';
  END IF;

  INSERT INTO public.mdrrmo_access_logs (mdrrmo_user_id, booking_id, location_id)
  SELECT auth.uid(), booking_id, p_location_id
  FROM unnest(COALESCE(p_booking_ids, '{}')) AS booking_id;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mdrrmo_log_access(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mdrrmo_log_access(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.session_location_id(_session_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    hs.location_id,
    (SELECT b.location_id FROM public.bookings b WHERE b.id = hs.booking_id)
  )
  FROM public.hiker_sessions hs
  WHERE hs.id = _session_id;
$$;

REVOKE ALL ON FUNCTION public.session_location_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_location_id(uuid) TO authenticated;

-- Replace broad staff policies with exact location-aware policies.
DROP POLICY IF EXISTS "bk_admin_all" ON public.bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can manage bookings" ON public.bookings;
DROP POLICY IF EXISTS bookings_admin_location ON public.bookings;
CREATE POLICY bookings_admin_location ON public.bookings
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.admin_can_access_location(location_id)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.admin_can_access_location(location_id)
  );

DROP POLICY IF EXISTS ba_admin_all ON public.booking_assignments;
DROP POLICY IF EXISTS booking_assignments_admin_location ON public.booking_assignments;
CREATE POLICY booking_assignments_admin_location ON public.booking_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_assignments.booking_id
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
      AND public.admin_can_access_location(b.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_assignments.booking_id
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
      AND public.admin_can_access_location(b.location_id)
  ));

DROP POLICY IF EXISTS "hs_staff_scope_all" ON public.hiker_sessions;
DROP POLICY IF EXISTS hiker_sessions_admin_location ON public.hiker_sessions;
DROP POLICY IF EXISTS hiker_sessions_admin_location_select ON public.hiker_sessions;
DROP POLICY IF EXISTS hiker_sessions_admin_location_insert ON public.hiker_sessions;
DROP POLICY IF EXISTS hiker_sessions_admin_location_update ON public.hiker_sessions;
CREATE POLICY hiker_sessions_admin_location_select ON public.hiker_sessions
  FOR SELECT TO authenticated
  USING (public.admin_can_access_location(public.session_location_id(hiker_sessions.id)));
CREATE POLICY hiker_sessions_admin_location_insert ON public.hiker_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ranger'::public.app_role))
    AND public.admin_can_access_location(COALESCE(
      hiker_sessions.location_id,
      (SELECT b.location_id FROM public.bookings b WHERE b.id = hiker_sessions.booking_id)
    ))
  );
CREATE POLICY hiker_sessions_admin_location_update ON public.hiker_sessions
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ranger'::public.app_role))
    AND public.admin_can_access_location(public.session_location_id(hiker_sessions.id))
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'ranger'::public.app_role))
    AND public.admin_can_access_location(COALESCE(
      hiker_sessions.location_id,
      (SELECT b.location_id FROM public.bookings b WHERE b.id = hiker_sessions.booking_id)
    ))
  );

DROP POLICY IF EXISTS "hl_staff_scope_select" ON public.hiker_locations;
DROP POLICY IF EXISTS hiker_locations_admin_location ON public.hiker_locations;
CREATE POLICY hiker_locations_admin_location ON public.hiker_locations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.hiker_sessions hs
    WHERE hs.id = hiker_locations.session_id
      AND public.admin_can_access_location(public.session_location_id(hs.id))
  ));

DROP POLICY IF EXISTS dc_admin_manage ON public.daily_capacity;
DROP POLICY IF EXISTS "Admins can manage capacity" ON public.daily_capacity;
DROP POLICY IF EXISTS daily_capacity_admin_location ON public.daily_capacity;
CREATE POLICY daily_capacity_admin_location ON public.daily_capacity
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.admin_can_access_location(location_id)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.admin_can_access_location(location_id)
  );

DROP POLICY IF EXISTS guides_admin_read ON public.guides;
DROP POLICY IF EXISTS guides_admin_manage ON public.guides;
DROP POLICY IF EXISTS guides_admin_location ON public.guides;
CREATE POLICY guides_admin_location ON public.guides
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.admin_can_access_location(location_id))
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.admin_can_access_location(location_id))
    OR auth.uid() = user_id
  );
