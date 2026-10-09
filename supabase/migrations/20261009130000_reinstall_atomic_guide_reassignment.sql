-- Repair for hosted databases where 20261006120000 was committed but its
-- atomic reassignment functions were not installed. Safe to run repeatedly.

ALTER TABLE IF EXISTS public.booking_assignments
  ADD COLUMN IF NOT EXISTS reassignment_reason text;

ALTER TABLE IF EXISTS public.booking_messages
  ADD COLUMN IF NOT EXISTS recipient_role text;

DO $$
BEGIN
  IF to_regclass('public.booking_messages') IS NOT NULL THEN
    ALTER TABLE public.booking_messages
      DROP CONSTRAINT IF EXISTS booking_messages_recipient_role_check;
    ALTER TABLE public.booking_messages
      ADD CONSTRAINT booking_messages_recipient_role_check
      CHECK (recipient_role IS NULL OR recipient_role IN ('hiker', 'guide', 'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reassign_hike_guide(
  p_booking_id uuid,
  p_guide_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  g public.guides%ROWTYPE;
  meta jsonb;
  old_guide_id uuid;
  old_guide_name text;
  old_guide_user_id uuid;
  new_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Only an administrator may reassign a guide' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.admin_can_access_location(b.location_id) THEN
    RAISE EXCEPTION 'Booking belongs to another trailhead' USING ERRCODE = '42501';
  END IF;
  IF b.status NOT IN ('pending', 'adjustment_pending', 'confirmed', 'approved') THEN
    RAISE EXCEPTION 'Guide cannot be changed after the hike has ended or been cancelled';
  END IF;

  SELECT * INTO g FROM public.guides WHERE id = p_guide_id FOR UPDATE;
  IF NOT FOUND OR g.user_id IS NULL OR g.is_active IS DISTINCT FROM true
     OR g.location_id IS DISTINCT FROM b.location_id
     OR g.status IN ('off-duty', 'off_duty') THEN
    RAISE EXCEPTION 'Choose an active guide with an account at this booking trailhead';
  END IF;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    meta := jsonb_build_object('userNotes', b.notes);
  END;
  IF meta->>'onsiteStartConfirmed' = 'true' THEN
    RAISE EXCEPTION 'This hike has already started';
  END IF;

  BEGIN old_guide_id := NULLIF(meta->>'assignedGuideId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN old_guide_id := NULL;
  END;
  old_guide_name := meta->>'assignedGuide';
  IF old_guide_id IS NOT NULL THEN
    SELECT full_name, user_id INTO old_guide_name, old_guide_user_id
    FROM public.guides WHERE id = old_guide_id;
  END IF;
  IF old_guide_id = g.id THEN
    RAISE EXCEPTION 'This guide is already assigned to the booking';
  END IF;

  UPDATE public.booking_assignments
  SET status = 'declined', decided_at = now(),
      reassignment_reason = 'Reassigned by admin: ' || trim(p_reason)
  WHERE booking_id = b.id AND guide_id = old_guide_id AND status IN ('pending', 'accepted');
  UPDATE public.guides SET status = 'available', updated_at = now()
  WHERE id = old_guide_id AND status = 'assigned';

  SELECT id INTO new_assignment_id FROM public.booking_assignments
  WHERE booking_id = b.id AND guide_id = g.id
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF new_assignment_id IS NULL THEN
    INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status)
    VALUES (b.id, g.id, b.location_id, 'pending') RETURNING id INTO new_assignment_id;
  ELSE
    UPDATE public.booking_assignments
    SET status = 'pending', decided_at = NULL, location_id = b.location_id, reassignment_reason = NULL
    WHERE id = new_assignment_id;
  END IF;
  IF g.status NOT IN ('on_duty', 'on-duty', 'off_duty', 'off-duty') THEN
    UPDATE public.guides SET status = 'assigned', updated_at = now() WHERE id = g.id;
  END IF;

  meta := meta || jsonb_build_object(
    'assignedGuide', g.full_name, 'assignedGuideId', g.id,
    'guideStatus', 'reassigned_pending', 'previousGuide', old_guide_name,
    'previousGuideId', old_guide_id, 'guideChangeReason', trim(p_reason), 'guideChangedAt', now()
  );
  UPDATE public.bookings SET notes = meta::text WHERE id = b.id;

  RETURN jsonb_build_object(
    'guideUserId', g.user_id, 'guideName', g.full_name, 'guidePhone', g.phone,
    'oldGuideUserId', old_guide_user_id, 'oldGuideName', old_guide_name,
    'hikerUserId', b.user_id, 'bookingDate', b.booking_date, 'locationId', b.location_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guide_reassign_hike_assignment(
  p_assignment_id uuid,
  p_replacement_guide_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_assignment public.booking_assignments%ROWTYPE;
  b public.bookings%ROWTYPE;
  current_guide public.guides%ROWTYPE;
  replacement public.guides%ROWTYPE;
  meta jsonb;
  replacement_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to update this assignment' USING ERRCODE = '42501'; END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required';
  END IF;

  SELECT * INTO current_assignment FROM public.booking_assignments
  WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR current_assignment.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'This guide assignment is no longer active';
  END IF;
  SELECT * INTO current_guide FROM public.guides
  WHERE id = current_assignment.guide_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the assigned guide may decline this booking' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = current_assignment.booking_id FOR UPDATE;
  IF NOT FOUND OR b.status IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'This hike has already ended'; END IF;

  BEGIN
    meta := COALESCE(NULLIF(b.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := jsonb_build_object('userNotes', b.notes); END IF;
  EXCEPTION WHEN invalid_text_representation THEN meta := jsonb_build_object('userNotes', b.notes);
  END;
  IF meta->>'onsiteStartConfirmed' = 'true' THEN RAISE EXCEPTION 'This hike has already started'; END IF;

  IF p_replacement_guide_id IS NOT NULL THEN
    SELECT * INTO replacement FROM public.guides WHERE id = p_replacement_guide_id FOR UPDATE;
    IF NOT FOUND OR replacement.user_id IS NULL OR replacement.is_active IS DISTINCT FROM true
       OR replacement.location_id IS DISTINCT FROM b.location_id
       OR replacement.id = current_guide.id
       OR replacement.status IN ('off-duty', 'off_duty') THEN
      RAISE EXCEPTION 'Choose another active guide with an account at this booking trailhead';
    END IF;
    SELECT id INTO replacement_assignment_id FROM public.booking_assignments
    WHERE booking_id = b.id AND guide_id = replacement.id
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF replacement_assignment_id IS NULL THEN
      INSERT INTO public.booking_assignments (booking_id, guide_id, location_id, status)
      VALUES (b.id, replacement.id, b.location_id, 'pending') RETURNING id INTO replacement_assignment_id;
    ELSE
      UPDATE public.booking_assignments SET status = 'pending', decided_at = NULL,
        location_id = b.location_id, reassignment_reason = NULL
      WHERE id = replacement_assignment_id;
    END IF;
    meta := meta || jsonb_build_object(
      'assignedGuide', replacement.full_name, 'assignedGuideId', replacement.id,
      'guideStatus', 'reassigned_pending', 'previousGuide', current_guide.full_name,
      'previousGuideId', current_guide.id, 'guideChangeReason', trim(p_reason), 'guideChangedAt', now()
    );
  ELSE
    meta := meta || jsonb_build_object(
      'assignedGuide', NULL, 'assignedGuideId', NULL, 'guideStatus', 'declined',
      'previousGuide', current_guide.full_name, 'previousGuideId', current_guide.id,
      'guideDeclineReason', trim(p_reason), 'guideChangedAt', now()
    );
  END IF;

  UPDATE public.booking_assignments SET status = 'declined', decided_at = now(),
    reassignment_reason = trim(p_reason) WHERE id = current_assignment.id;
  UPDATE public.guides SET status = 'available', updated_at = now()
  WHERE id = current_guide.id AND status = 'assigned';
  IF p_replacement_guide_id IS NOT NULL
     AND replacement.status NOT IN ('on_duty', 'on-duty', 'off_duty', 'off-duty') THEN
    UPDATE public.guides SET status = 'assigned', updated_at = now() WHERE id = replacement.id;
  END IF;
  UPDATE public.bookings SET notes = meta::text WHERE id = b.id;

  RETURN jsonb_build_object(
    'oldGuideUserId', current_guide.user_id, 'oldGuideName', current_guide.full_name,
    'replacementGuideUserId', replacement.user_id, 'replacementGuideName', replacement.full_name,
    'hikerUserId', b.user_id, 'bookingDate', b.booking_date, 'bookingId', b.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reassign_hike_guide(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reassign_hike_guide(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.guide_reassign_hike_assignment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guide_reassign_hike_assignment(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
