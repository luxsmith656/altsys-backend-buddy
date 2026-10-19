-- Scoped permanent deletion for trail reviews, including their submitted photo.
BEGIN;

CREATE TABLE IF NOT EXISTS public.trail_review_delete_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  deleted_by uuid NOT NULL REFERENCES auth.users(id),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  review_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trail_review_delete_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trail_review_delete_audit_admin_read ON public.trail_review_delete_audit;
CREATE POLICY trail_review_delete_audit_admin_read ON public.trail_review_delete_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.delete_trail_review(_review_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
  row_data public.reviews%ROWTYPE;
  review_location uuid;
  can_delete boolean := false;
  photo_path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO row_data FROM public.reviews WHERE id = _review_id AND review_type = 'trail' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('deleted', false, 'reason', 'not_found'); END IF;
  SELECT b.location_id INTO review_location FROM public.bookings b WHERE b.id = row_data.booking_id;
  can_delete := public.has_role(auth.uid(), 'super_admin')
    OR (row_data.booking_id IS NOT NULL AND public.can_moderate_trail_review(row_data.booking_id));
  IF NOT can_delete THEN RAISE EXCEPTION 'You are not allowed to delete this review'; END IF;

  INSERT INTO public.trail_review_delete_audit(review_id, deleted_by, location_id, review_snapshot)
  VALUES (_review_id, auth.uid(), review_location,
    jsonb_build_object('reviewer_name', row_data.reviewer_name, 'rating', row_data.rating,
      'trail_name', row_data.trail_name, 'review_text', left(row_data.review_text, 1000),
      'is_approved', row_data.is_approved, 'photo_url', row_data.photo_url));

  IF row_data.photo_url IS NOT NULL THEN
    photo_path := regexp_replace(row_data.photo_url, '^.*/storage/v1/object/public/trail-reviews/', '');
    IF photo_path <> row_data.photo_url THEN
      DELETE FROM storage.objects WHERE bucket_id = 'trail-reviews' AND name = photo_path;
    END IF;
  END IF;
  DELETE FROM public.reviews WHERE id = _review_id;
  RETURN jsonb_build_object('deleted', true, 'review_id', _review_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_trail_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_trail_review(uuid) TO authenticated;
GRANT SELECT, INSERT ON public.trail_review_delete_audit TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
