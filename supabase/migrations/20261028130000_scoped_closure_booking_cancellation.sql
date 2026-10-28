-- Allow Central or a local trailhead admin to cancel open bookings in a
-- reasoned announcement without widening either role's booking scope.

CREATE OR REPLACE FUNCTION public.cancel_bookings_for_announcement(
  p_booking_dates date[],
  p_reason text,
  p_announcement_id text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  cancelled_at timestamptz := now();
  booking_row public.bookings%ROWTYPE;
  meta jsonb;
  payment_paid boolean;
  affected integer := 0;
  location_scope uuid[] := p_location_ids;
  is_central boolean := public.has_role(actor_id, 'super_admin'::public.app_role);
BEGIN
  IF actor_id IS NULL OR NOT (
    is_central OR public.has_role(actor_id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Only Central or Local Admin may cancel bookings from an announcement' USING ERRCODE = '42501';
  END IF;
  IF p_booking_dates IS NULL OR cardinality(p_booking_dates) = 0 THEN
    RAISE EXCEPTION 'At least one cancellation date is required' USING ERRCODE = '22023';
  END IF;
  IF clean_reason IS NULL OR length(clean_reason) < 5 THEN
    RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_location_ids IS NOT NULL AND cardinality(p_location_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one trailhead or select all trailheads' USING ERRCODE = '22023';
  END IF;

  -- A local admin may only pass its own mapped trailhead. If no scope was
  -- supplied, resolve the admin's mapped locations rather than treating it as
  -- global access. Central may leave the scope NULL to mean all trailheads.
  IF NOT is_central THEN
    IF p_location_ids IS NULL THEN
      SELECT COALESCE(array_agg(ul.location_id), '{}'::uuid[])
      INTO location_scope
      FROM public.user_locations ul
      WHERE ul.user_id = actor_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM unnest(p_location_ids) requested(location_id)
        WHERE NOT public.admin_can_access_location(requested.location_id)
      ) THEN
        RAISE EXCEPTION 'Local Admin may only cancel bookings for the assigned trailhead' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF location_scope IS NULL OR cardinality(location_scope) = 0 THEN
      RAISE EXCEPTION 'No trailhead is assigned to this Local Admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR booking_row IN
    SELECT b.*
    FROM public.bookings b
    WHERE b.booking_date = ANY(p_booking_dates)
      AND b.status IN ('pending', 'confirmed', 'accepted', 'approved', 'adjustment_pending')
      AND (location_scope IS NULL OR b.location_id = ANY(location_scope))
      AND (is_central OR public.admin_can_access_location(b.location_id))
    FOR UPDATE
  LOOP
    meta := public.safe_booking_meta(booking_row.notes);
    payment_paid := lower(COALESCE(meta->>'paymentStatus', '')) IN ('paid', 'partial');
    IF COALESCE(meta->>'amountPaid', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      payment_paid := payment_paid OR (meta->>'amountPaid')::numeric > 0;
    END IF;

    meta := meta || jsonb_build_object(
      'weatherCancellation', jsonb_build_object(
        'announcementId', p_announcement_id,
        'reason', clean_reason,
        'cancelledAt', cancelled_at,
        'cancelledBy', actor_id,
        'cancelledByRole', CASE WHEN is_central THEN 'central_admin' ELSE 'local_admin' END,
        'refundEligible', payment_paid
      ),
      'cancellationReason', clean_reason,
      'cancelledBy', CASE WHEN is_central THEN 'central_closure' ELSE 'local_closure' END
    );

    UPDATE public.bookings
    SET status = 'cancelled', notes = meta::text
    WHERE id = booking_row.id;

    -- The booking lifecycle trigger may have inserted a generic cancellation
    -- alert. Replace it with the exact closure reason and recovery options.
    DELETE FROM public.app_notifications
    WHERE user_id = booking_row.user_id
      AND category = 'booking'
      AND link = '/hiker?bookingId=' || booking_row.id::text
      AND title = 'Booking cancelled'
      AND created_at >= cancelled_at;

    INSERT INTO public.app_notifications(user_id, title, body, category, link)
    VALUES (
      booking_row.user_id,
      'Booking cancelled — action available',
      'Your ' || to_char(booking_row.booking_date, 'Mon DD, YYYY') || ' hike was cancelled: ' || clean_reason || CASE WHEN payment_paid THEN ' You may request a reschedule or refund from your dashboard.' ELSE ' You may request a reschedule from your dashboard.' END,
      'booking',
      '/hiker?bookingId=' || booking_row.id::text
    );
    affected := affected + 1;
  END LOOP;

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_bookings_for_announcement(date[], text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_bookings_for_announcement(date[], text, text, uuid[]) TO authenticated;

-- Keep the original one-date central RPC working for older deployed clients.
CREATE OR REPLACE FUNCTION public.central_cancel_bookings_for_weather(
  p_booking_date date,
  p_reason text,
  p_announcement_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.cancel_bookings_for_announcement(
    ARRAY[p_booking_date], p_reason, p_announcement_id, NULL::uuid[]
  );
$$;

REVOKE ALL ON FUNCTION public.central_cancel_bookings_for_weather(date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.central_cancel_bookings_for_weather(date, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
