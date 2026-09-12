-- Run only after deploying send-booking-confirmation and configuring Resend.
-- In Vault, create booking_email_worker_secret with the SAME random 32+ character
-- value as the Lovable Edge Function secret BOOKING_EMAIL_WORKER_SECRET.
-- Never use a browser VITE_ variable, service key, or the Resend key for this.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'booking_email_worker_secret' AND length(decrypted_secret) >= 32
      AND decrypted_secret NOT LIKE '%REPLACE%'
  ) THEN RAISE EXCEPTION 'Add booking_email_worker_secret to Vault first, matching BOOKING_EMAIL_WORKER_SECRET in Lovable.';
  END IF;
END;
$$;

SELECT cron.schedule('kalisungan-booking-confirmations', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://evcqnlbumsfgbfddoonv.supabase.co/functions/v1/send-booking-confirmation',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-booking-email-worker',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'booking_email_worker_secret' LIMIT 1)),
    body := '{"runQueue":true}'::jsonb,
    timeout_milliseconds := 90000
  ) WHERE EXISTS (
    SELECT 1 FROM public.booking_confirmation_emails e
    JOIN public.bookings b ON b.id = e.booking_id
    WHERE b.status = 'confirmed' AND e.status IN ('pending', 'processing')
      AND e.next_attempt_at <= now() AND (e.lease_until IS NULL OR e.lease_until < now())
  );
$job$);
