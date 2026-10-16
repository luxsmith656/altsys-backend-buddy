-- Store trail-review photos in Supabase Storage so the review upload and the
-- review row use the same authenticated backend. This avoids Firebase bucket
-- CORS/404 failures on the Vercel origin.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trail-reviews',
  'trail-reviews',
  true,
  2097152,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg']::text[];

DROP POLICY IF EXISTS trail_review_public_read ON storage.objects;
CREATE POLICY trail_review_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'trail-reviews');

DROP POLICY IF EXISTS trail_review_authenticated_upload ON storage.objects;
CREATE POLICY trail_review_authenticated_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trail-reviews'
    AND lower(name) LIKE '%.jpg'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
