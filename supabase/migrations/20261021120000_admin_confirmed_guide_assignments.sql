-- Guide assignments are confirmed by the administrator. Guides are notified
-- after assignment and may request reassignment, but they do not accept or
-- decline the booking themselves.

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
  -- Older RPCs used pending while waiting for a guide response. Normalize that
  -- legacy write at the database boundary so it cannot recreate the removed
  -- acceptance workflow.
  IF NEW.status = 'pending' THEN
    NEW.status := 'accepted';
    NEW.decided_at := COALESCE(NEW.decided_at, now());
  END IF;

  IF NEW.status NOT IN ('accepted', 'declined') THEN RETURN NEW; END IF;
  SELECT location_id INTO booking_location FROM public.bookings WHERE id = NEW.booking_id;
  SELECT location_id INTO guide_location FROM public.guides WHERE id = NEW.guide_id;
  IF booking_location IS NULL OR guide_location IS DISTINCT FROM booking_location OR NEW.location_id IS DISTINCT FROM booking_location THEN
    RAISE EXCEPTION 'Guide and booking must belong to the same trailhead';
  END IF;
  IF NEW.status = 'accepted' AND public.guide_has_schedule_conflict(NEW.guide_id, NEW.booking_id, NEW.id) THEN
    RAISE EXCEPTION 'This guide already has an overlapping booking at the selected time';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guide_assignment_schedule_guard ON public.booking_assignments;
CREATE TRIGGER guide_assignment_schedule_guard
  BEFORE INSERT OR UPDATE OF guide_id, booking_id, location_id, status ON public.booking_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guide_assignment_schedule();

CREATE OR REPLACE FUNCTION public.sync_confirmed_booking_after_guide_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row public.bookings%ROWTYPE;
  guide_row public.guides%ROWTYPE;
  meta jsonb;
  assigned_guides jsonb;
  required_guides integer;
  accepted_guides integer;
  next_status text;
BEGIN
  IF NEW.status <> 'accepted' THEN RETURN NEW; END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = NEW.booking_id FOR UPDATE;
  SELECT * INTO guide_row FROM public.guides WHERE id = NEW.guide_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  BEGIN
    meta := COALESCE(NULLIF(booking_row.notes, '')::jsonb, '{}'::jsonb);
    IF jsonb_typeof(meta) <> 'object' THEN meta := '{}'::jsonb; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    meta := '{}'::jsonb;
  END;

  assigned_guides := CASE
    WHEN jsonb_typeof(meta->'assignedGuides') = 'array' THEN meta->'assignedGuides'
    ELSE '[]'::jsonb
  END;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(assigned_guides) entry
    WHERE entry->>'id' = NEW.guide_id::text
  ) THEN
    assigned_guides := assigned_guides || jsonb_build_array(jsonb_build_object(
      'id', NEW.guide_id,
      'name', guide_row.full_name,
      'status', 'accepted',
      'acceptedAt', COALESCE(NEW.decided_at, now())
    ));
  END IF;

  IF meta->>'assignedGuideId' IS NULL OR meta->>'assignedGuideId' = NEW.guide_id::text THEN
    meta := meta || jsonb_build_object(
      'assignedGuide', guide_row.full_name,
      'assignedGuideId', NEW.guide_id,
      'guideStatus', 'accepted',
      'guideAcceptedAt', COALESCE(NEW.decided_at, now())
    );
  ELSE
    meta := meta || jsonb_build_object('guideStatus', 'accepted');
  END IF;
  meta := meta || jsonb_build_object('assignedGuides', assigned_guides);

  required_guides := GREATEST(1, CEIL(GREATEST(1, booking_row.group_size)::numeric / 5)::integer);
  SELECT count(*)::integer INTO accepted_guides
  FROM public.booking_assignments
  WHERE booking_id = NEW.booking_id AND status = 'accepted';
  next_status := booking_row.status;
  IF accepted_guides >= required_guides AND booking_row.status IN ('pending', 'adjustment_pending', 'approved') THEN
    next_status := 'confirmed';
  END IF;

  UPDATE public.bookings
  SET notes = meta::text, status = next_status
  WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_assignment_confirmation_sync ON public.booking_assignments;
CREATE TRIGGER booking_assignment_confirmation_sync
  AFTER INSERT OR UPDATE OF guide_id, booking_id, status ON public.booking_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_confirmed_booking_after_guide_assignment();

-- When an older reassignment RPC writes its legacy metadata after inserting
-- the replacement, keep the metadata consistent with the accepted assignment.
CREATE OR REPLACE FUNCTION public.normalize_confirmed_guide_booking_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  meta jsonb;
BEGIN
  IF NEW.notes IS NULL OR NEW.notes = OLD.notes THEN RETURN NEW; END IF;
  BEGIN
    meta := NULLIF(NEW.notes, '')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;
  IF jsonb_typeof(meta) = 'object' AND meta->>'guideStatus' IN ('pending', 'reassigned_pending') THEN
    NEW.notes := (meta || jsonb_build_object('guideStatus', 'accepted', 'guideAcceptedAt', now()))::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_confirmed_guide_booking_notes ON public.bookings;
CREATE TRIGGER normalize_confirmed_guide_booking_notes
  BEFORE UPDATE OF notes ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.normalize_confirmed_guide_booking_notes();

-- Repair assignments created by the previous pending-acceptance workflow.
-- Do not force an overlapping assignment to accepted: the schedule guard must
-- remain authoritative. Those rows stay pending until an admin reassigns or
-- resolves the conflicting booking.
UPDATE public.booking_assignments
SET status = 'accepted', decided_at = COALESCE(decided_at, now())
WHERE status = 'pending'
  AND NOT public.guide_has_schedule_conflict(guide_id, booking_id, id);

NOTIFY pgrst, 'reload schema';
