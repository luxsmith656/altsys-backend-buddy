-- Support the second guide required for groups larger than the configured
-- five-person safety ratio. The existing admin_assign_hike_guide function
-- remains the lead-guide replacement path; this function only appends a
-- second pending assignment.
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
  SELECT count(*)::integer INTO active_assignments
  FROM public.booking_assignments
  WHERE booking_id = b.id AND status IN ('pending', 'accepted');
  IF active_assignments >= required_guides THEN
    RAISE EXCEPTION 'This booking already has the required number of guides';
  END IF;

  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true
     OR g.location_id IS DISTINCT FROM b.location_id
     OR g.status IN ('off-duty', 'off_duty') THEN
    RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_assignments
    WHERE booking_id = b.id AND guide_id = g.id AND status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'This guide is already assigned to the booking';
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
    'assignedGuides', active_assignments + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_hike_guide(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_hike_guide(uuid, uuid) TO authenticated;
