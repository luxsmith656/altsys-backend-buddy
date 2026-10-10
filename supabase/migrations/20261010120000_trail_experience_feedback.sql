-- Separate post-hike trail feedback from guide ratings.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS review_type text NOT NULL DEFAULT 'trail',
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_review_type_check;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_review_type_check CHECK (review_type IN ('trail'));

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_difficulty_check;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_difficulty_check CHECK (difficulty IS NULL OR difficulty IN ('easy', 'moderate', 'hard'));

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_trail_feedback_per_booking_user_idx
  ON public.reviews (booking_id, user_id, review_type)
  WHERE booking_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
