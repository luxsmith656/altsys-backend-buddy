-- Complete the trail-review moderation boundary for central admins.
-- Local admins remain scoped by their assigned trailhead; central admins can
-- review and publish submissions from any official trailhead.

BEGIN;

DROP POLICY IF EXISTS trail_reviews_central_admin_select ON public.reviews;
CREATE POLICY trail_reviews_central_admin_select ON public.reviews
  FOR SELECT TO authenticated
  USING (
    review_type = 'trail'
    AND public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS trail_reviews_central_admin_update ON public.reviews;
CREATE POLICY trail_reviews_central_admin_update ON public.reviews
  FOR UPDATE TO authenticated
  USING (
    review_type = 'trail'
    AND public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    review_type = 'trail'
    AND public.has_role(auth.uid(), 'super_admin')
  );

CREATE INDEX IF NOT EXISTS reviews_published_trail_created_idx
  ON public.reviews (created_at DESC)
  WHERE review_type = 'trail' AND is_approved = true;

NOTIFY pgrst, 'reload schema';

COMMIT;
