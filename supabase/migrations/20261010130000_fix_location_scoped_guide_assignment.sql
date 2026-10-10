-- Make two-guide assignment safe to retry and keep every assignment at its
-- booking trailhead. The client can safely retry after a network timeout.
CREATE OR REPLACE FUNCTION public.admin_add_hike_guide(
  p_booking_id uuid,
  p_guide_id uuid
) RETURNS jsonb
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
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.user_locations WHERE user_id = auth.uid() AND location_id = b.location_id
  ) THEN RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501'; END IF;

  required_guides := GREATEST(1, CEIL(GREATEST(1, b.group_size)::numeric / 5)::integer);
  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true
     OR g.location_id IS DISTINCT FROM b.location_id
     OR lower(coalesce(g.status, '')) IN ('off-duty', 'off_duty', 'inactive', 'deactivated') THEN
    RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead';
  END IF;

  -- Idempotency comes before the capacity guard. A repeated click must return
  -- the existing assignment instead of claiming the booking is already full.
  SELECT id INTO assignment_id
  FROM public.booking_assignments
  WHERE booking_id = b.id AND guide_id = g.id AND status IN ('pending', 'accepted')
  ORDER BY created_at DESC
  LIMIT 1;
  IF assignment_id IS NOT NULL THEN
    SELECT count(*)::integer INTO active_assignments
    FROM public.booking_assignments
    WHERE booking_id = b.id AND status IN ('pending', 'accepted');
    RETURN jsonb_build_object(
      'assignmentId', assignment_id,
      'guideUserId', g.user_id,
      'guideName', g.full_name,
      'bookingDate', b.booking_date,
      'requiredGuides', required_guides,
      'assignedGuides', active_assignments,
      'unchanged', true
    );
  END IF;

  SELECT count(*)::integer INTO active_assignments
  FROM public.booking_assignments
  WHERE booking_id = b.id AND status IN ('pending', 'accepted');
  IF active_assignments >= required_guides THEN
    RAISE EXCEPTION 'This booking already has the required number of guides';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.bookings other ON other.id = ba.booking_id
    WHERE ba.guide_id = g.id
      AND ba.status IN ('pending', 'accepted')
      AND other.booking_date = b.booking_date
      AND other.id <> b.id
      AND other.status NOT IN ('cancelled', 'declined', 'completed')
  ) THEN
    RAISE EXCEPTION 'This guide already has an active assignment on the selected date';
  END IF;

  INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status)
  VALUES (b.id, g.id, b.location_id, 'pending')
  RETURNING id INTO assignment_id;

  RETURN jsonb_build_object(
    'assignmentId', assignment_id,
    'guideUserId', g.user_id,
    'guideName', g.full_name,
    'bookingDate', b.booking_date,
    'requiredGuides', required_guides,
    'assignedGuides', active_assignments + 1,
    'unchanged', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_hike_guide(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_hike_guide(uuid, uuid) TO authenticated;

-- The primary-guide RPC needs the same date conflict guard as the second-guide
-- RPC. UI filtering is helpful, but the database remains authoritative.
CREATE OR REPLACE FUNCTION public.admin_assign_hike_guide(
  p_booking_id uuid, p_guide_id uuid, p_trail_id uuid DEFAULT NULL
) RETURNS jsonb
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
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Only an administrator may assign a guide' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not accessible'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.user_locations WHERE user_id = auth.uid() AND location_id = b.location_id
  ) THEN RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501'; END IF;
  IF b.status NOT IN ('pending', 'adjustment_pending', 'confirmed', 'approved') THEN
    RAISE EXCEPTION 'Guide assignment is closed for this booking';
  END IF;
  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true
     OR g.location_id IS DISTINCT FROM b.location_id
     OR lower(coalesce(g.status, '')) IN ('off-duty', 'off_duty', 'inactive', 'deactivated') THEN
    RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead';
  END IF;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN meta := jsonb_build_object('userNotes', b.notes);
  END;
  IF meta->>'onsiteStartConfirmed' = 'true' THEN RAISE EXCEPTION 'This hike has already started'; END IF;
  IF p_trail_id IS NOT NULL THEN
    SELECT name INTO route_name FROM public.trail_zones WHERE id = p_trail_id AND location_id = b.location_id
      AND status = 'active' AND is_official = true AND review_status = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a published route at the booking trailhead'; END IF;
    meta := meta || jsonb_build_object('assignedTrailZoneId', p_trail_id, 'assignedTrailName', route_name);
  END IF;

  SELECT id, status INTO assignment_id, current_status FROM public.booking_assignments
    WHERE booking_id = b.id AND guide_id = g.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF meta->>'assignedGuideId' = g.id::text AND current_status IN ('pending', 'accepted') THEN
    IF p_trail_id IS NOT NULL THEN UPDATE public.bookings SET notes = meta::text WHERE id = b.id; END IF;
    RETURN jsonb_build_object('guideUserId', g.user_id, 'guideName', g.full_name, 'bookingDate', b.booking_date, 'unchanged', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.bookings other ON other.id = ba.booking_id
    WHERE ba.guide_id = g.id
      AND ba.status IN ('pending', 'accepted')
      AND other.booking_date = b.booking_date
      AND other.id <> b.id
      AND other.status NOT IN ('cancelled', 'declined', 'completed')
  ) THEN
    RAISE EXCEPTION 'This guide already has an active assignment on the selected date';
  END IF;

  UPDATE public.booking_assignments SET status = 'declined', decided_at = now()
    WHERE booking_id = b.id AND guide_id::text = meta->>'assignedGuideId' AND guide_id <> g.id AND status IN ('pending', 'accepted');
  IF assignment_id IS NULL THEN
    INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status)
      VALUES (b.id, g.id, b.location_id, 'pending');
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
