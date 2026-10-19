-- Hikers may read assignment rows only for their own bookings. This is the
-- bridge needed to hydrate the assigned guide on the hiker dashboard and Kali.
DROP POLICY IF EXISTS booking_assignments_hiker_read ON public.booking_assignments;
CREATE POLICY booking_assignments_hiker_read
ON public.booking_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = booking_assignments.booking_id
      AND b.user_id = auth.uid()
  )
);
