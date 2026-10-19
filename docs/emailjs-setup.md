# EmailJS delivery

EmailJS is the primary provider for password-reset and booking-confirmation mail. The current account is configured with:

- Gmail service: `service_nwhz8gy`
- Booking template: `template_quhvfai`
- Password-reset template: configure `EMAILJS_PASSWORD_RESET_TEMPLATE_ID` with a dedicated reset template. `template_dcs8uaj` is the account's OTP template and must not be used for booking confirmations or password recovery.

The dedicated reset template should expect `to_name`, `to_email`, `email`, and `reset_link`. The booking template receives both its existing fields (`visitor_name`, `booking_id`, `hike_date`, `trail_name`, `checkin_time`, `name`, `email`) and the newer confirmation fields.

## Runtime

`send-password-reset-emailjs` generates a single-use Supabase recovery link server-side, then sends it through EmailJS. It never accepts a reset link from the browser. If the function is unavailable, the client falls back to Supabase Auth's recovery mail so password recovery remains usable.

`send-booking-confirmation` keeps the durable outbox, lease, retry, and authorization checks. EmailJS is used when its configuration is present; the existing Resend transport remains available as a deployment fallback and is never used at the same time as EmailJS for one leased job.

The Edge Functions include the current EmailJS identifiers as public integration defaults. To change them without a code change, set these Supabase function secrets:

```text
EMAILJS_SERVICE_ID
EMAILJS_PUBLIC_KEY
EMAILJS_PRIVATE_KEY
EMAILJS_BOOKING_TEMPLATE_ID
EMAILJS_PASSWORD_RESET_TEMPLATE_ID
```

Deploy after applying the functions:

```text
supabase functions deploy send-password-reset-emailjs
supabase functions deploy send-booking-confirmation
```

`EMAILJS_PRIVATE_KEY` is required when EmailJS Account > Security has **Use Private Key** enabled. Set it as a Supabase Edge Function secret for both functions. Never put it, a Supabase service-role key, or a reset token in `VITE_` variables or in a template parameter supplied by the browser.
