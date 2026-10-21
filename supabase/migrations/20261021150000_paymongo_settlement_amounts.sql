-- Make PayMongo QRPh settlement payments apply only to the verified balance.
-- The signed webhook remains the only path that marks a booking paid.
CREATE OR REPLACE FUNCTION public.process_paymongo_payment(
  p_booking_id uuid,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_amount_paid numeric,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_meta jsonb;
  v_event_id uuid;
  v_total_fee numeric;
  v_current_paid numeric;
  v_remaining numeric;
BEGIN
  IF p_booking_id IS NULL OR NULLIF(trim(p_provider_payment_id), '') IS NULL
     OR p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_meta := public.safe_booking_meta(v_booking.notes);
  IF COALESCE(v_meta->>'totalFee', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RETURN false;
  END IF;
  v_total_fee := (v_meta->>'totalFee')::numeric;
  IF COALESCE(v_meta->>'amountPaid', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_current_paid := (v_meta->>'amountPaid')::numeric;
  ELSE
    v_current_paid := 0;
  END IF;
  v_current_paid := greatest(v_current_paid, 0);
  v_remaining := greatest(v_total_fee - v_current_paid, 0);

  -- The checkout session is created for the exact outstanding balance. This
  -- equality check plus the row lock prevents two simultaneous settlements
  -- from both being applied to the same booking.
  IF v_remaining <= 0 OR round(p_amount_paid, 2) <> round(v_remaining, 2) THEN
    RETURN false;
  END IF;

  INSERT INTO public.paymongo_payment_events(
    provider_payment_id, provider_event_id, booking_id, amount_paid, paid_at
  ) VALUES (
    trim(p_provider_payment_id), NULLIF(trim(p_provider_event_id), ''), p_booking_id,
    round(p_amount_paid, 2), COALESCE(p_paid_at, now())
  )
  ON CONFLICT (provider_payment_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  v_meta := v_meta || jsonb_build_object(
    'paymentMethod', 'paymongo',
    'paymentStatus', 'paid',
    'amountPaid', round(v_total_fee, 2),
    'paymongoPaymentId', trim(p_provider_payment_id),
    'paymongoPaidAt', COALESCE(p_paid_at, now())
  );
  UPDATE public.bookings
  SET notes = v_meta::text
  WHERE id = p_booking_id;

  UPDATE public.paymongo_checkout_intents
  SET status = 'paid', updated_at = now()
  WHERE booking_id = p_booking_id
    AND purpose = COALESCE(v_meta->>'paymongoPaymentPurpose', 'reservation')
    AND status IN ('creating', 'pending');

  INSERT INTO public.app_notifications(
    user_id, title, body, category, link, type, reference_id, target_type,
    target_id, route, read, is_read
  ) VALUES (
    v_booking.user_id,
    'Payment received',
    'Your PayMongo QRPh payment for booking ' || left(p_booking_id::text, 8) || ' was received.',
    'booking',
    '/hiker?booking=' || p_booking_id::text,
    'booking',
    p_booking_id,
    'booking',
    p_booking_id,
    '/hiker?booking=' || p_booking_id::text,
    false,
    false
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_paymongo_payment(uuid, text, text, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_paymongo_payment(uuid, text, text, numeric, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
