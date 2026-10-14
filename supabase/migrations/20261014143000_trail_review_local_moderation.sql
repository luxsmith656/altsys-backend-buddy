-- Trail experience review moderation, scoped to each local admin's trailhead.
-- Hikers can submit one trail review for a completed booking. Local admins can
-- publish or hide only reviews attached to bookings at their own location.

BEGIN;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS review_type text NOT NULL DEFAULT 'trail',
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_moderate_trail_review(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.bookings booking
        JOIN public.user_locations assignment ON assignment.location_id = booking.location_id
        WHERE booking.id = _booking_id
          AND assignment.user_id = auth.uid()
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_moderate_trail_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_trail_review(uuid) TO authenticated;

-- Replace the historical global-admin policies. The narrower policy below
-- prevents a Lamot 1 admin from moderating a Lamot 2 or Sto. Tomas submission.
DROP POLICY IF EXISTS "Admins can manage reviews" ON public.reviews;
DROP POLICY IF EXISTS rv_admin_all ON public.reviews;
DROP POLICY IF EXISTS trail_reviews_local_admin_select ON public.reviews;
DROP POLICY IF EXISTS trail_reviews_local_admin_update ON public.reviews;

CREATE POLICY trail_reviews_local_admin_select ON public.reviews
  FOR SELECT TO authenticated
  USING (
    review_type = 'trail'
    AND public.can_moderate_trail_review(booking_id)
  );

CREATE POLICY trail_reviews_local_admin_update ON public.reviews
  FOR UPDATE TO authenticated
  USING (
    review_type = 'trail'
    AND public.can_moderate_trail_review(booking_id)
  )
  WITH CHECK (
    review_type = 'trail'
    AND public.can_moderate_trail_review(booking_id)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
