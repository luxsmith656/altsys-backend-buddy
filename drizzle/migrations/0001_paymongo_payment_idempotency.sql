-- Make PayMongo payment confirmation safe under retries and concurrent webhook delivery.
CREATE TABLE IF NOT EXISTS public.paymongo_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_payment_id text NOT NULL UNIQUE,
  provider_event_id text,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paymongo_payment_events_booking_idx
  ON public.paymongo_payment_events(booking_id, created_at DESC);

ALTER TABLE public.paymongo_payment_events ENABLE ROW LEVEL SECURITY;

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
BEGIN
  IF p_booking_id IS NULL OR NULLIF(trim(p_provider_payment_id), '') IS NULL THEN
    RETURN false;
  END IF;

  -- Lock the booking before checking or changing its payment state.
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_meta := public.safe_booking_meta(v_booking.notes);
  -- A booking can have only one successful online payment. If two checkout
  -- sessions race, the first locked transaction wins and the second is a no-op.
  IF lower(COALESCE(v_meta->>'paymentStatus', '')) = 'paid' THEN
    RETURN false;
  END IF;

  -- The unique provider payment id makes retries and simultaneous deliveries safe.
  INSERT INTO public.paymongo_payment_events(
    provider_payment_id, provider_event_id, booking_id, amount_paid, paid_at
  ) VALUES (
    trim(p_provider_payment_id), NULLIF(trim(p_provider_event_id), ''), p_booking_id,
    GREATEST(COALESCE(p_amount_paid, 0), 0), COALESCE(p_paid_at, now())
  )
  ON CONFLICT (provider_payment_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN false;
  END IF;

  v_meta := v_meta || jsonb_build_object(
    'paymentMethod', 'paymongo',
    'paymentStatus', 'paid',
    'amountPaid', GREATEST(COALESCE(p_amount_paid, 0), 0),
    'paymongoPaymentId', trim(p_provider_payment_id),
    'paymongoPaidAt', COALESCE(p_paid_at, now())
  );
  UPDATE public.bookings
  SET notes = v_meta::text
  WHERE id = p_booking_id;

  -- Insert inside this transaction so the notification cannot exist without
  -- the corresponding paid booking state. The unique payment ledger above
  -- ensures this happens once even when webhooks arrive concurrently.
  INSERT INTO public.app_notifications(
    user_id, title, body, category, link, type, reference_id, target_type,
    target_id, route, read, is_read
  ) VALUES (
    v_booking.user_id,
    'Payment received',
    'Your PayMongo payment for booking ' || left(p_booking_id::text, 8) || ' was received.',
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