-- Serialize assignment writes per guide before checking overlapping bookings.
-- Without this lock, two admins could both pass the availability read before
-- either transaction committed and assign the same guide to overlapping hikes.

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

  -- Transaction-scoped: concurrent assignment attempts for this guide wait,
  -- while different guides remain fully parallel.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.guide_id::text, 0));

  SELECT location_id INTO booking_location
  FROM public.bookings
  WHERE id = NEW.booking_id;
  SELECT location_id INTO guide_location
  FROM public.guides
  WHERE id = NEW.guide_id;

  IF booking_location IS NULL
     OR guide_location IS DISTINCT FROM booking_location
     OR NEW.location_id IS DISTINCT FROM booking_location THEN
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
  BEFORE INSERT OR UPDATE OF guide_id, booking_id, location_id, status
  ON public.booking_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_guide_assignment_schedule();

NOTIFY pgrst, 'reload schema';
