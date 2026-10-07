-- Keep the published Lamot 2 jump-off marker aligned with the active GPS reference.
-- This is intentionally a small metadata/anchor repair; it does not replace the
-- route's measured intermediate points.
UPDATE public.locations
SET center_lat = 14.1486888,
    center_lng = 121.3291523
WHERE slug = 'lamot-2';

DO $$
DECLARE
  v_route record;
  v_points jsonb;
BEGIN
  FOR v_route IN
    SELECT id, coordinates_json
    FROM public.trail_zones
    WHERE location_id IN (SELECT id FROM public.locations WHERE slug = 'lamot-2')
      AND status = 'active'
      AND is_official = true
      AND review_status = 'approved'
      AND jsonb_typeof(coordinates_json) = 'array'
      AND jsonb_array_length(coordinates_json) >= 2
  LOOP
    v_points := jsonb_set(
      v_route.coordinates_json,
      '{0}',
      jsonb_build_object('lat', 14.1486888, 'lng', 121.3291523),
      false
    );
    UPDATE public.trail_zones
    SET coordinates_json = v_points
    WHERE id = v_route.id;
  END LOOP;
END $$;

-- Referral links expose a stable code, never a guide's display name or UUID.
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS referral_code text;
UPDATE public.guides
SET referral_code = 'KALI-' || upper(left(replace(id::text, '-', ''), 8))
WHERE referral_code IS NULL OR btrim(referral_code) = '';
CREATE UNIQUE INDEX IF NOT EXISTS guides_referral_code_unique_idx
  ON public.guides (referral_code)
  WHERE referral_code IS NOT NULL;

-- A completed booking can have at most one hiker experience review.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Preserve the oldest existing review if older data contains duplicates, so the
-- unique index can be installed safely on an already-used database.
DELETE FROM public.reviews newer
USING public.reviews older
WHERE newer.booking_id IS NOT NULL
  AND newer.booking_id = older.booking_id
  AND newer.user_id = older.user_id
  AND (
    newer.created_at > older.created_at
    OR (newer.created_at = older.created_at AND newer.id > older.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_booking_user_idx
  ON public.reviews (booking_id, user_id)
  WHERE booking_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
