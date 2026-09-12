-- Run this whole file in the project's SQL editor. It is safe to rerun.
-- Restores the missing guide profile/review schema without deleting data.
-- Requires the existing bookings, guides, assignments, roles and user_locations tables.
-- Does NOT change login accounts, Auth email settings, routes, payments or OTP data.
BEGIN;

ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS facebook_url text;

CREATE TABLE IF NOT EXISTS public.guide_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_id, guide_id)
);

ALTER TABLE public.guide_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guide_reviews_guide_created_idx
  ON public.guide_reviews (guide_id, created_at DESC);

-- Explicit role + location checks: MDRRMO directory access never grants moderation.
CREATE OR REPLACE FUNCTION public.can_moderate_guide_review(_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.user_locations ul ON ul.location_id = b.location_id
      WHERE b.id = _booking_id AND ul.user_id = auth.uid()
    ))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_submit_guide_review(_booking_id uuid, _guide_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.booking_assignments ba ON ba.booking_id = b.id
    WHERE b.id = _booking_id
      AND b.status = 'completed'
      AND ba.guide_id = _guide_id
      -- Accepted is retained when assignment cleanup failed after a completed hike.
      AND ba.status IN ('accepted', 'completed')
      AND (b.user_id = auth.uid() OR public.can_moderate_guide_review(b.id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_moderate_guide_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_submit_guide_review(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_guide_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_guide_review(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS guide_reviews_public_read ON public.guide_reviews;
CREATE POLICY guide_reviews_public_read ON public.guide_reviews
  FOR SELECT TO anon, authenticated USING (is_approved = true);

DROP POLICY IF EXISTS guide_reviews_owner_read ON public.guide_reviews;
CREATE POLICY guide_reviews_owner_read ON public.guide_reviews
  FOR SELECT TO authenticated USING (reviewer_id = auth.uid());

DROP POLICY IF EXISTS guide_reviews_owner_insert ON public.guide_reviews;
CREATE POLICY guide_reviews_owner_insert ON public.guide_reviews
  FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = auth.uid() AND public.can_submit_guide_review(booking_id, guide_id)
  );

DROP POLICY IF EXISTS guide_reviews_admin_all ON public.guide_reviews;
CREATE POLICY guide_reviews_admin_all ON public.guide_reviews
  FOR ALL TO authenticated
  USING (public.can_moderate_guide_review(booking_id))
  WITH CHECK (public.can_moderate_guide_review(booking_id));

-- Restrictive guards prevent an older permissive policy from bypassing these rules.
DROP POLICY IF EXISTS guide_reviews_insert_guard ON public.guide_reviews;
CREATE POLICY guide_reviews_insert_guard ON public.guide_reviews AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = auth.uid() AND public.can_submit_guide_review(booking_id, guide_id)
  );
DROP POLICY IF EXISTS guide_reviews_update_guard ON public.guide_reviews;
CREATE POLICY guide_reviews_update_guard ON public.guide_reviews AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.can_moderate_guide_review(booking_id))
  WITH CHECK (public.can_moderate_guide_review(booking_id));
DROP POLICY IF EXISTS guide_reviews_delete_guard ON public.guide_reviews;
CREATE POLICY guide_reviews_delete_guard ON public.guide_reviews AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.can_moderate_guide_review(booking_id));

GRANT SELECT ON public.guide_reviews TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.guide_reviews FROM anon;
GRANT INSERT, DELETE ON public.guide_reviews TO authenticated;
-- Moderation may hide/show a review, never rewrite its author, rating or booking.
REVOKE UPDATE ON public.guide_reviews FROM authenticated;
GRANT UPDATE (is_approved) ON public.guide_reviews TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
