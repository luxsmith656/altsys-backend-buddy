-- A guide can only be attached to a booking from the same trailhead.
-- This also protects direct client inserts (including hiker referral bookings).
CREATE OR REPLACE FUNCTION public.enforce_booking_assignment_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_location_id uuid;
  guide_location_id uuid;
BEGIN
  SELECT b.location_id INTO booking_location_id
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND OR booking_location_id IS NULL THEN
    RAISE EXCEPTION 'Booking must have a selected trailhead before assigning a guide';
  END IF;

  SELECT g.location_id INTO guide_location_id
  FROM public.guides g
  WHERE g.id = NEW.guide_id;

  IF NOT FOUND OR guide_location_id IS NULL THEN
    RAISE EXCEPTION 'Guide must belong to a trailhead before assignment';
  END IF;

  IF guide_location_id <> booking_location_id THEN
    RAISE EXCEPTION 'Guide and booking must belong to the same trailhead';
  END IF;

  IF NEW.location_id IS NOT NULL AND NEW.location_id <> booking_location_id THEN
    RAISE EXCEPTION 'Assignment trailhead must match the booking trailhead';
  END IF;

  NEW.location_id := booking_location_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_booking_assignment_location() FROM PUBLIC;

DROP TRIGGER IF EXISTS booking_assignment_location_guard ON public.booking_assignments;
CREATE TRIGGER booking_assignment_location_guard
BEFORE INSERT OR UPDATE OF booking_id, guide_id, location_id
ON public.booking_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_assignment_location();

CREATE OR REPLACE FUNCTION public.prevent_active_booking_trailhead_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'bookings' AND NEW.location_id IS DISTINCT FROM OLD.location_id
     AND EXISTS (
       SELECT 1
       FROM public.booking_assignments ba
       JOIN public.guides g ON g.id = ba.guide_id
       WHERE ba.booking_id = NEW.id
         AND ba.status IN ('pending', 'accepted')
         AND g.location_id IS DISTINCT FROM NEW.location_id
     ) THEN
    RAISE EXCEPTION 'Reassign the active guide before changing the booking trailhead';
  END IF;

  IF TG_TABLE_NAME = 'guides' AND NEW.location_id IS DISTINCT FROM OLD.location_id
     AND EXISTS (
       SELECT 1
       FROM public.booking_assignments ba
       JOIN public.bookings b ON b.id = ba.booking_id
       WHERE ba.guide_id = NEW.id
         AND ba.status IN ('pending', 'accepted')
         AND b.location_id IS DISTINCT FROM NEW.location_id
     ) THEN
    RAISE EXCEPTION 'Finish or reassign active bookings before moving this guide to another trailhead';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_active_booking_trailhead_mismatch() FROM PUBLIC;

DROP TRIGGER IF EXISTS booking_trailhead_change_guard ON public.bookings;
CREATE TRIGGER booking_trailhead_change_guard
BEFORE UPDATE OF location_id ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_active_booking_trailhead_mismatch();

DROP TRIGGER IF EXISTS guide_trailhead_change_guard ON public.guides;
CREATE TRIGGER guide_trailhead_change_guard
BEFORE UPDATE OF location_id ON public.guides
FOR EACH ROW
EXECUTE FUNCTION public.prevent_active_booking_trailhead_mismatch();
