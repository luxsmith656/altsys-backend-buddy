# Booking confirmation email

## Preview and branding
- Open `booking-confirmation-preview.html` for the filled-in example. It is clearly marked as a sample, not a real booking.
- `booking-confirmation.html` is the editable source. It uses the supplied security-email template's green header and the existing Mt. Kalisungan logo, but contains no security code.
- Run `npm run email:sync` after changing the HTML or `public/brand/kalisungan-logo.png`. CI's `email:check` rejects a stale server bundle or preview.
- The actual email embeds the logo as a CID attachment, so Vercel asset hashes cannot break it.
- Includes confirmed date/time (Manila), jump-off, guide/contact, pax, booking reference and the reminder to call the guide a day before. No medical notes or companion data.

## Sending flow
1. A newly confirmed booking creates one durable `booking_confirmation_emails` row, in the same database transaction as confirmation.
2. Admin/guide confirmation invokes `send-booking-confirmation` to expedite sending. A scheduled server worker handles missed calls and retries without the browser staying open.
3. The Edge Function validates the caller's JWT and booking ownership, accepted guide assignment or location-scoped admin permissions. A separate cron secret authorizes batch processing. MDRRMO cannot send.
4. Recipient and content are loaded from the confirmed booking, actual accepted assignment, guide and location. The caller cannot supply a recipient, HTML or API key.
5. Resend acceptance and message ID are persisted. A successful provider response is not proof of inbox delivery; inspect Resend delivery/bounce events.
6. Leases plus a stable Resend idempotency key prevent concurrent/repeated sends. Payloads are persisted before submission so retries are identical. Ambiguous sends beyond 23 hours or eight attempts require operator review, not another blind send.
7. A changed date, recipient, guide/contact or group size pauses an attempted message for review. It does not send stale details or silently replace the payload under an existing provider key.

The old EmailJS and SMS client send paths are removed. No automatic cross-provider fallback is configured; a timeout might mean the first provider already accepted the message, and switching providers then could duplicate it.

## Required Lovable setup
These are server secrets, never `VITE_` variables:
- `RESENDAPI`: existing secret name supported; `RESEND_API_KEY` is an alias. Rotate any API key previously pasted into chat; do not paste it into source control.
- `RESEND_FROM_EMAIL`: your verified sender, for example `Mt. Kalisungan <bookings@your-owned-domain.com>`. No fallback sender is used.
- `BOOKING_EMAIL_WORKER_SECRET`: a separate random value of at least 32 characters for the scheduled worker. Store the same value in Supabase Vault as `booking_email_worker_secret`.
- Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its Edge Functions. Do not copy the service key into the frontend.

Resend requires an owned, verified sending domain for arbitrary recipients. The shared resend.dev sender is limited to the Resend account owner's test inbox. A Vercel subdomain is not a domain you can independently verify via DNS. Sources: [Resend sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [verified domains](https://resend.com/docs/dashboard/domains/introduction).

## Install in order
1. Run `supabase/migrations/20260908140000_booking_confirmation_outbox.sql` in Lovable's SQL editor. It does not backfill old bookings or send existing test records.
2. Deploy `supabase/functions/send-booking-confirmation`, its `deno.json` and both imported `_shared/booking-email*.ts` modules. Its `verify_jwt = false` configuration is intentional: the handler verifies end-user tokens itself and rejects invalid/missing worker secrets.
3. Configure the secrets above.
4. Run `supabase/manual/enable_booking_email_worker.sql` to schedule queue checks once a minute. This requires pg_cron, pg_net and Vault in the existing project. Missing Vault configuration stops the script rather than creating a broken job. No network call is made when there is no due confirmed booking.
5. Confirm one explicitly authorized test booking with a real test inbox. Verify queue status, Resend event and receipt. Do not bulk-email historical bookings.

CLI alternative, only for an authenticated Supabase CLI session:
```sh
npx supabase functions deploy send-booking-confirmation --project-ref evcqnlbumsfgbfddoonv --no-verify-jwt
```
Deployment credentials are not required by normal web CI and have not been added to its workflow.

## Monitoring and recovery
Use the privileged SQL editor; ordinary app accounts cannot read full email payloads:
```sql
SELECT booking_id, status, attempts, provider_id, sent_at, next_attempt_at, last_error
FROM public.booking_confirmation_emails ORDER BY created_at DESC LIMIT 50;

SELECT jobname, active FROM cron.job WHERE jobname = 'kalisungan-booking-confirmations';
```
- `pending`: queued or waiting for retry. `processing`: a two-minute lease is active.
- `sent`: Resend accepted the message; inspect provider delivery/bounce status.
- `needs_review`: missing details, rejected sender, exhausted retries or an uncertain old send. Check provider history before any manual reset.
- Never delete a sent job to resend it. Never rotate its idempotency key to hide a failure.
- If changing a booked schedule after the original confirmation was sent, use the app's change notification flow. This initial-confirmation queue intentionally does not send a second confirmation for the same booking.

Resend retains idempotency keys for 24 hours: [provider documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
The worker uses the official [Supabase scheduled Edge Function pattern](https://supabase.com/docs/guides/functions/schedule-functions).

## Current verification limits
The local tests cover queue SQL/RLS, authorization, message validation, retries, duplicate protection and browser rendering. They do not prove actual provider delivery or a deployed worker. On September 8, Lovable's visible secrets list contained RESENDAPI but no RESEND_FROM_EMAIL; Resend opened at its login screen. No sending domain, sender, function deployment or scheduled job was changed in this work.

The custom signup OTP UI is removed. Hosted Auth's Confirm Email setting remains separate and must be disabled deliberately by the project owner for immediate password signup. Password recovery and Google authentication stay available.
