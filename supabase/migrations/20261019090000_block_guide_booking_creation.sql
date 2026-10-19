-- Guides may manage assignments, but a guide account must never create a hiker booking.
CREATE OR REPLACE FUNCTION public.prevent_guide_booking_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'guide') THEN
    RAISE EXCEPTION 'Guide accounts cannot create bookings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_guide_booking_creation ON public.bookings;
CREATE TRIGGER prevent_guide_booking_creation
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_guide_booking_creation();

REVOKE ALL ON FUNCTION public.prevent_guide_booking_creation() FROM PUBLIC;

