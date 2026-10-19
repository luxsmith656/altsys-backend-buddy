-- A hiker may see the guide profile attached to their own booking.
-- This is intentionally narrower than the public guide directory: it only
-- exposes guide rows linked through that authenticated hiker's booking.
DROP POLICY IF EXISTS guides_hiker_assigned_booking_read ON public.guides;
CREATE POLICY guides_hiker_assigned_booking_read
ON public.guides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.booking_assignments ba
    JOIN public.bookings b ON b.id = ba.booking_id
    WHERE ba.guide_id = guides.id
      AND b.user_id = auth.uid()
  )
);
