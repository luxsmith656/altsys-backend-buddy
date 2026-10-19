# PayMongo payment setup

The booking page now displays the supplied QR Ph merchant image at
`/payments/qrph-kooketz.jpg` when a hiker chooses online payment. The hiker
enters the transaction reference and may attach a receipt; the payment stays
pending until an admin verifies it.

This QR is a static merchant QR. It does not require a PayMongo API key and it
does not provide automatic payment confirmation by itself.

## Secret handling

Never put the PayMongo secret key in `VITE_*` variables, source files, or Git.
For the automatic Checkout API and webhook, add the keys as deployment secrets
instead:

```text
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_WEBHOOK_SECRET=...
```

`PAYMONGO_SECRET_KEY` belongs only in the Supabase Edge Function or server
environment. The frontend does not need either key for the static QR flow.

For Supabase CLI deployments, set the secret without committing it:

```bash
supabase secrets set PAYMONGO_SECRET_KEY=sk_live_...
supabase secrets set PAYMONGO_PUBLIC_KEY=pk_live_...
supabase secrets set PAYMONGO_WEBHOOK_SECRET=...
```

Deploy both functions, then register one PayMongo webhook pointing to
`https://<project-ref>.supabase.co/functions/v1/paymongo-webhook` for the
Checkout Session/payment-paid event. Use PayMongo's test keys first; switch to
live keys only after a real test payment succeeds. The supplied static QR
remains available as a fallback when checkout secrets are unavailable.
