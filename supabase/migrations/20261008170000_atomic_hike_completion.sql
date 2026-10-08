-- Close a hike once, from either the assigned guide or an authorized local/central admin.
-- The operation is idempotent so duplicate clicks and realtime retries are harmless.
CREATE OR REPLACE FUNCTION public.complete_hike_session(
  p_booking_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_is_authorized boolean := false;
  v_already_completed boolean := false;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking was not found';
  END IF;

  v_already_completed := v_booking.status = 'completed';

  v_is_authorized :=
    (
      (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
      AND public.admin_can_access_location(v_booking.location_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.booking_assignments ba
      JOIN public.guides g ON g.id = ba.guide_id
      WHERE ba.booking_id = p_booking_id
        AND g.user_id = auth.uid()
        AND ba.status IN ('pending', 'accepted', 'completed')
    );

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'You are not authorized to complete this hike';
  END IF;

  UPDATE public.bookings
  SET status = 'completed', notes = p_notes
  WHERE id = p_booking_id;

  UPDATE public.hiker_sessions
  SET status = 'completed',
      tracking_phase = 'completed',
      end_time = COALESCE(end_time, now())
  WHERE booking_id = p_booking_id
    AND status <> 'completed';

  UPDATE public.booking_assignments
  SET status = 'completed',
      decided_at = COALESCE(decided_at, now())
  WHERE booking_id = p_booking_id
    AND status IN ('pending', 'accepted');

  UPDATE public.guides g
  SET status = 'available', updated_at = now()
  WHERE g.id IN (
    SELECT ba.guide_id
    FROM public.booking_assignments ba
    WHERE ba.booking_id = p_booking_id
  )
    AND g.status <> 'off_duty';

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'status', 'completed',
    'already_completed', v_already_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_hike_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_hike_session(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
