BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_confirmation_emails (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'needs_review', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb,
  provider_id text,
  last_error text,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_confirmation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_confirmation_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_confirmation_emails TO service_role;
CREATE INDEX IF NOT EXISTS booking_confirmation_due ON public.booking_confirmation_emails (next_attempt_at) WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.queue_booking_confirmation_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.booking_confirmation_emails (booking_id) VALUES (NEW.id) ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_booking_confirmation_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS booking_confirmation_email_queue ON public.bookings;
CREATE TRIGGER booking_confirmation_email_queue AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.queue_booking_confirmation_email();

CREATE OR REPLACE FUNCTION public.claim_booking_confirmation_email(_booking_id uuid)
RETURNS SETOF public.booking_confirmation_emails
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Resend retains idempotency keys for 24 hours. Never blindly repeat an
  -- uncertain old send after that guarantee expires.
  UPDATE public.booking_confirmation_emails SET status = 'needs_review', last_error = 'Retry window expired; check Resend before retrying.'
  WHERE booking_id = _booking_id AND status IN ('pending', 'processing')
    AND (first_attempt_at < now() - interval '23 hours' OR attempts >= 8)
    AND (lease_until IS NULL OR lease_until < now());

  RETURN QUERY
  UPDATE public.booking_confirmation_emails q
  SET status = 'processing', attempts = attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, now()), lease_until = now() + interval '2 minutes'
  WHERE q.booking_id = _booking_id
    AND q.status IN ('pending', 'processing') AND q.next_attempt_at <= now()
    AND (q.lease_until IS NULL OR q.lease_until < now())
    AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = q.booking_id AND b.status = 'confirmed')
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_booking_confirmation_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_confirmation_email(uuid) TO service_role;

-- Deliberately no backfill: applying this migration must not email old bookings.
NOTIFY pgrst, 'reload schema';
COMMIT;
