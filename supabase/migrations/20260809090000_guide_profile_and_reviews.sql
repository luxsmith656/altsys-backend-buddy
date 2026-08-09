-- Public guide profiles, referral links, and durable guide reviews.
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS facebook_url text;

DROP POLICY IF EXISTS guides_own_update ON public.guides;
CREATE POLICY guides_own_update ON public.guides
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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
CREATE INDEX IF NOT EXISTS guide_reviews_guide_created_idx ON public.guide_reviews (guide_id, created_at DESC);

DROP POLICY IF EXISTS guide_reviews_public_read ON public.guide_reviews;
CREATE POLICY guide_reviews_public_read ON public.guide_reviews
  FOR SELECT USING (is_approved = true);

DROP POLICY IF EXISTS guide_reviews_owner_insert ON public.guide_reviews;
CREATE POLICY guide_reviews_owner_insert ON public.guide_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );

DROP POLICY IF EXISTS guide_reviews_admin_all ON public.guide_reviews;
CREATE POLICY guide_reviews_admin_all ON public.guide_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
