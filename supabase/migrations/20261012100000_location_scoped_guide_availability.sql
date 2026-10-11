-- Location-scoped guide rosters and time-aware assignment availability.
-- Schedule metadata is stored in bookings.notes by the existing booking flow.

CREATE OR REPLACE FUNCTION public.booking_schedule_range(p_booking_id uuid)
RETURNS tstzrange
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  meta jsonb := '{}'::jsonb;
  raw_time text;
  normalized_time text;
  hike_kind text;
  start_at timestamptz;
  duration interval;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.booking_date IS NULL THEN RETURN NULL; END IF;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := '{}'::jsonb; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    meta := '{}'::jsonb;
  END;

  raw_time := upper(trim(COALESCE(meta->>'hikeTime', meta->>'hike_time', '')));
  IF raw_time ~ '^\d{1,2}:\d{2}\s*(AM|PM)$' THEN
    normalized_time := to_char(to_timestamp(raw_time, 'HH12:MI AM'), 'HH24:MI');
  ELSIF raw_time ~ '^\d{2}:\d{2}$' THEN
    normalized_time := raw_time;
  ELSE
    -- Legacy rows without schedule metadata reserve the whole local date.
    normalized_time := '00:00';
  END IF;

  start_at := ((b.booking_date::text || ' ' || normalized_time || ':00')::timestamp AT TIME ZONE 'Asia/Manila');
  hike_kind := lower(COALESCE(meta->>'hikeType', meta->>'hike_type', 'legacy'));
  duration := CASE
    WHEN hike_kind = 'overnight' THEN interval '20 hours'
    WHEN hike_kind IN ('morning', 'day', 'night') AND raw_time <> '' THEN interval '8 hours'
    ELSE interval '24 hours'
  END;
  RETURN tstzrange(start_at, start_at + duration, '[)');
END;
$$;

CREATE OR REPLACE FUNCTION public.guide_slot_range(
  p_booking_date date,
  p_hike_time text,
  p_hike_type text
)
RETURNS tstzrange
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  raw_time text := upper(trim(COALESCE(p_hike_time, '')));
  normalized_time text;
  start_at timestamptz;
  duration interval;
BEGIN
  IF p_booking_date IS NULL THEN RETURN NULL; END IF;
  IF raw_time ~ '^\d{1,2}:\d{2}\s*(AM|PM)$' THEN
    normalized_time := to_char(to_timestamp(raw_time, 'HH12:MI AM'), 'HH24:MI');
  ELSIF raw_time ~ '^\d{2}:\d{2}$' THEN
    normalized_time := raw_time;
  ELSE
    normalized_time := '00:00';
  END IF;
  start_at := ((p_booking_date::text || ' ' || normalized_time || ':00')::timestamp AT TIME ZONE 'Asia/Manila');
  duration := CASE
    WHEN lower(COALESCE(p_hike_type, '')) = 'overnight' THEN interval '20 hours'
    WHEN raw_time <> '' THEN interval '8 hours'
    ELSE interval '24 hours'
  END;
  RETURN tstzrange(start_at, start_at + duration, '[)');
END;
$$;

CREATE OR REPLACE FUNCTION public.guide_has_schedule_conflict(
  p_guide_id uuid,
  p_booking_id uuid,
  p_exclude_assignment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.bookings other ON other.id = ba.booking_id
    WHERE ba.guide_id = p_guide_id
      AND ba.status IN ('pending', 'accepted')
      AND ba.booking_id <> p_booking_id
      AND (p_exclude_assignment_id IS NULL OR ba.id <> p_exclude_assignment_id)
      AND other.status NOT IN ('cancelled', 'declined', 'completed')
      AND public.booking_schedule_range(other.id) && public.booking_schedule_range(p_booking_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_available_guide_ids_for_slot(
  p_location_id uuid,
  p_booking_date date,
  p_hike_time text,
  p_hike_type text,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  slot tstzrange;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only an administrator may view guide availability' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NULL THEN RETURN '{}'::uuid[]; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.user_locations
    WHERE user_id = auth.uid() AND location_id = p_location_id
  ) THEN
    RAISE EXCEPTION 'Guide availability belongs to another trailhead' USING ERRCODE = '42501';
  END IF;
  slot := public.guide_slot_range(p_booking_date, p_hike_time, p_hike_type);
  RETURN COALESCE((
    SELECT array_agg(g.id ORDER BY g.full_name)
    FROM public.guides g
    WHERE g.location_id = p_location_id
      AND g.is_active IS TRUE
      AND g.user_id IS NOT NULL
      AND lower(coalesce(g.status, '')) NOT IN ('off-duty', 'off_duty', 'inactive', 'deactivated')
      AND NOT EXISTS (
        SELECT 1 FROM public.guide_off_duty_requests d
        WHERE d.guide_id = g.id
          AND d.status = 'approved'
          AND d.request_type = 'off_duty'
          AND d.start_date <= p_booking_date
          AND COALESCE(d.end_date, d.start_date) >= p_booking_date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_assignments ba
        JOIN public.bookings other ON other.id = ba.booking_id
        WHERE ba.guide_id = g.id
          AND ba.status IN ('pending', 'accepted')
          AND (p_exclude_booking_id IS NULL OR ba.booking_id <> p_exclude_booking_id)
          AND other.status NOT IN ('cancelled', 'declined', 'completed')
          AND public.booking_schedule_range(other.id) && slot
      )
  ), '{}'::uuid[]);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_available_guide_ids_for_slot(uuid, date, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_available_guide_ids_for_slot(uuid, date, text, text, uuid) TO authenticated;

-- Active guides remain visible in the public directory, but never to a local
-- admin through the old broad public-read policy. Central admins retain the
-- all-location policy created by the location-scope migrations.
DROP POLICY IF EXISTS guides_public_read ON public.guides;
CREATE POLICY guides_public_read ON public.guides
  FOR SELECT
  USING (
    is_active = true
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Replace the two assignment RPCs with the same schedule-aware conflict rule.
CREATE OR REPLACE FUNCTION public.admin_add_hike_guide(p_booking_id uuid, p_guide_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  g public.guides%ROWTYPE;
  required_guides integer;
  active_assignments integer;
  assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only an administrator may assign a guide' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not accessible'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (SELECT 1 FROM public.user_locations WHERE user_id = auth.uid() AND location_id = b.location_id) THEN
    RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501';
  END IF;
  required_guides := GREATEST(1, CEIL(GREATEST(1, b.group_size)::numeric / 5)::integer);
  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true OR g.location_id IS DISTINCT FROM b.location_id OR lower(coalesce(g.status, '')) IN ('off-duty', 'off_duty', 'inactive', 'deactivated') THEN
    RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead';
  END IF;
  SELECT id INTO assignment_id FROM public.booking_assignments WHERE booking_id = b.id AND guide_id = g.id AND status IN ('pending', 'accepted') ORDER BY created_at DESC LIMIT 1;
  IF assignment_id IS NOT NULL THEN
    SELECT count(*)::integer INTO active_assignments FROM public.booking_assignments WHERE booking_id = b.id AND status IN ('pending', 'accepted');
    RETURN jsonb_build_object('assignmentId', assignment_id, 'guideUserId', g.user_id, 'guideName', g.full_name, 'bookingDate', b.booking_date, 'requiredGuides', required_guides, 'assignedGuides', active_assignments, 'unchanged', true);
  END IF;
  SELECT count(*)::integer INTO active_assignments FROM public.booking_assignments WHERE booking_id = b.id AND status IN ('pending', 'accepted');
  IF active_assignments >= required_guides THEN RAISE EXCEPTION 'This booking already has the required number of guides'; END IF;
  IF public.guide_has_schedule_conflict(g.id, b.id) THEN RAISE EXCEPTION 'This guide already has an overlapping booking at the selected time'; END IF;
  INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status) VALUES (b.id, g.id, b.location_id, 'pending') RETURNING id INTO assignment_id;
  RETURN jsonb_build_object('assignmentId', assignment_id, 'guideUserId', g.user_id, 'guideName', g.full_name, 'bookingDate', b.booking_date, 'requiredGuides', required_guides, 'assignedGuides', active_assignments + 1, 'unchanged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_hike_guide(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_hike_guide(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_hike_guide(p_booking_id uuid, p_guide_id uuid, p_trail_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  g public.guides%ROWTYPE;
  meta jsonb;
  assignment_id uuid;
  route_name text;
  current_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'Only an administrator may assign a guide' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not accessible'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (SELECT 1 FROM public.user_locations WHERE user_id = auth.uid() AND location_id = b.location_id) THEN RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501'; END IF;
  IF b.status NOT IN ('pending', 'adjustment_pending', 'confirmed', 'approved') THEN RAISE EXCEPTION 'Guide assignment is closed for this booking'; END IF;
  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true OR g.location_id IS DISTINCT FROM b.location_id OR lower(coalesce(g.status, '')) IN ('off-duty', 'off_duty', 'inactive', 'deactivated') THEN RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead'; END IF;
  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN meta := jsonb_build_object('userNotes', b.notes); END;
  IF meta->>'onsiteStartConfirmed' = 'true' THEN RAISE EXCEPTION 'This hike has already started'; END IF;
  IF p_trail_id IS NOT NULL THEN
    SELECT name INTO route_name FROM public.trail_zones WHERE id = p_trail_id AND location_id = b.location_id AND status = 'active' AND is_official = true AND review_status = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a published route at the booking trailhead'; END IF;
    meta := meta || jsonb_build_object('assignedTrailZoneId', p_trail_id, 'assignedTrailName', route_name);
  END IF;
  SELECT id, status INTO assignment_id, current_status FROM public.booking_assignments WHERE booking_id = b.id AND guide_id = g.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF meta->>'assignedGuideId' = g.id::text AND current_status IN ('pending', 'accepted') THEN
    IF p_trail_id IS NOT NULL THEN UPDATE public.bookings SET notes = meta::text WHERE id = b.id; END IF;
    RETURN jsonb_build_object('guideUserId', g.user_id, 'guideName', g.full_name, 'bookingDate', b.booking_date, 'unchanged', true);
  END IF;
  IF public.guide_has_schedule_conflict(g.id, b.id, assignment_id) THEN RAISE EXCEPTION 'This guide already has an overlapping booking at the selected time'; END IF;
  UPDATE public.booking_assignments SET status = 'declined', decided_at = now() WHERE booking_id = b.id AND guide_id::text = meta->>'assignedGuideId' AND guide_id <> g.id AND status IN ('pending', 'accepted');
  IF assignment_id IS NULL THEN
    INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status) VALUES (b.id, g.id, b.location_id, 'pending');
  ELSE
    UPDATE public.booking_assignments SET status = 'pending', decided_at = NULL, location_id = b.location_id WHERE id = assignment_id;
  END IF;
  meta := meta || jsonb_build_object('assignedGuide', g.full_name, 'assignedGuideId', g.id, 'guideStatus', 'pending', 'assignedAt', now());
  UPDATE public.bookings SET notes = meta::text WHERE id = b.id;
  RETURN jsonb_build_object('guideUserId', g.user_id, 'guideName', g.full_name, 'bookingDate', b.booking_date, 'unchanged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_hike_guide(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_hike_guide(uuid, uuid, uuid) TO authenticated;

-- Walk-in and reassignment flows write booking_assignments directly or from a
-- separate RPC. This trigger makes the same overlap rule apply to every path.
CREATE OR REPLACE FUNCTION public.enforce_guide_assignment_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_location uuid;
  guide_location uuid;
BEGIN
  IF NEW.status NOT IN ('pending', 'accepted') THEN RETURN NEW; END IF;
  SELECT location_id INTO booking_location FROM public.bookings WHERE id = NEW.booking_id;
  SELECT location_id INTO guide_location FROM public.guides WHERE id = NEW.guide_id;
  IF booking_location IS NULL OR guide_location IS DISTINCT FROM booking_location OR NEW.location_id IS DISTINCT FROM booking_location THEN
    RAISE EXCEPTION 'Guide and booking must belong to the same trailhead';
  END IF;
  IF public.guide_has_schedule_conflict(NEW.guide_id, NEW.booking_id, NEW.id) THEN
    RAISE EXCEPTION 'This guide already has an overlapping booking at the selected time';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guide_assignment_schedule_guard ON public.booking_assignments;
CREATE TRIGGER guide_assignment_schedule_guard
  BEFORE INSERT OR UPDATE OF guide_id, booking_id, location_id, status ON public.booking_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guide_assignment_schedule();

NOTIFY pgrst, 'reload schema';
