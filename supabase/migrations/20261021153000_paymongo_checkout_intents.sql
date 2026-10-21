-- Serialize PayMongo checkout creation per booking and payment purpose.
-- A static merchant QR cannot identify a booking, so automatic matching must
-- always use the booking-specific hosted Checkout Session QR.
CREATE TABLE IF NOT EXISTS public.paymongo_checkout_intents (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('reservation', 'settlement')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text,
  checkout_url text,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'pending', 'paid', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, purpose)
);

CREATE INDEX IF NOT EXISTS paymongo_checkout_intents_status_idx
  ON public.paymongo_checkout_intents(status, updated_at DESC);

ALTER TABLE public.paymongo_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paymongo_checkout_intents FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_paymongo_checkout(
  p_booking_id uuid,
  p_purpose text,
  p_amount numeric
)
RETURNS TABLE (
  claim_token uuid,
  session_id text,
  checkout_url text,
  can_create boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.paymongo_checkout_intents%ROWTYPE;
  v_claim_token uuid := gen_random_uuid();
BEGIN
  IF p_booking_id IS NULL OR p_purpose NOT IN ('reservation', 'settlement')
     OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false;
    RETURN;
  END IF;

  SELECT * INTO v_intent
  FROM public.paymongo_checkout_intents
  WHERE booking_id = p_booking_id AND purpose = p_purpose
  FOR UPDATE;

  IF FOUND THEN
    -- Reuse the same hosted checkout if it is already available. The QR in
    -- that page is tied to this booking's reference_number.
    IF v_intent.session_id IS NOT NULL AND v_intent.checkout_url IS NOT NULL
       AND v_intent.status IN ('creating', 'pending')
       AND round(v_intent.amount, 2) = round(p_amount, 2) THEN
      RETURN QUERY SELECT v_intent.claim_token, v_intent.session_id, v_intent.checkout_url, false;
      RETURN;
    END IF;

    -- Never create a second session for an existing pending session just
    -- because the amount changed. An admin must resolve that booking change
    -- first, otherwise two QR payments could target the same booking.
    IF v_intent.status IN ('pending', 'paid') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false;
      RETURN;
    END IF;

    -- Do not create a second session while another request is still creating
    -- the first one. A stale claim can be recovered after two minutes.
    IF v_intent.status = 'creating'
       AND v_intent.claimed_at > now() - interval '2 minutes' THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false;
      RETURN;
    END IF;

    UPDATE public.paymongo_checkout_intents
    SET amount = round(p_amount, 2), claim_token = v_claim_token,
        session_id = NULL, checkout_url = NULL, status = 'creating',
        claimed_at = now(), updated_at = now()
    WHERE booking_id = p_booking_id AND purpose = p_purpose;
  ELSE
    INSERT INTO public.paymongo_checkout_intents(
      booking_id, purpose, amount, claim_token, status, claimed_at, updated_at
    ) VALUES (
      p_booking_id, p_purpose, round(p_amount, 2), v_claim_token,
      'creating', now(), now()
    );
  END IF;

  RETURN QUERY SELECT v_claim_token, NULL::text, NULL::text, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_paymongo_checkout(
  p_booking_id uuid,
  p_purpose text,
  p_claim_token uuid,
  p_session_id text,
  p_checkout_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.paymongo_checkout_intents
  SET session_id = NULLIF(trim(p_session_id), ''),
      checkout_url = NULLIF(trim(p_checkout_url), ''),
      status = 'pending', updated_at = now()
  WHERE booking_id = p_booking_id AND purpose = p_purpose
    AND claim_token = p_claim_token AND status = 'creating';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_paymongo_checkout(
  p_booking_id uuid,
  p_purpose text,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.paymongo_checkout_intents
  SET status = 'failed', updated_at = now()
  WHERE booking_id = p_booking_id AND purpose = p_purpose
    AND claim_token = p_claim_token AND status = 'creating';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_paymongo_checkout(uuid, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_paymongo_checkout(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_paymongo_checkout(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_paymongo_checkout(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_paymongo_checkout(uuid, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_paymongo_checkout(uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
