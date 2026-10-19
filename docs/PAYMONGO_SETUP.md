# PayMongo payment setup

The booking page now displays the supplied QR Ph merchant image at
`/payments/qrph-kooketz.jpg` when a hiker chooses online payment. The hiker
enters the transaction reference and may attach a receipt; the payment stays
pending until an admin verifies it.

This QR is a static merchant QR. It does not require a PayMongo API key and it
does not provide automatic payment confirmation by itself.

## Secret handling

Never put the PayMongo secret key in `VITE_*` variables, source files, or Git.
For the automatic Checkout API and webhook, add the keys as Vercel project
environment variables instead:

```text
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_WEBHOOK_SECRET=...
```

`PAYMONGO_SECRET_KEY` belongs only in the Supabase Edge Function or server
environment. The frontend does not need either key for the static QR flow.

In Vercel, open **Project Settings → Environment Variables**, then add those
three variables for **Production** (and Preview if you test there). Do not add
them with the `VITE_` prefix.

Also add the existing backend values that the Vercel API route needs:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-existing-server-key
```

The service-role key is only read by the Vercel server function for the
existing database and is never sent to the browser.

For local testing, set them in an untracked `.env.local` file:

```bash
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_WEBHOOK_SECRET=...
```

Vercel deploys `api/paymongo/checkout.ts` and `api/paymongo/webhook.ts`
automatically. Register one PayMongo webhook pointing to
`https://YOUR_VERCEL_DOMAIN/api/paymongo/webhook` for the
Checkout Session/payment-paid event. Use PayMongo's test keys first; switch to
live keys only after a real test payment succeeds. The supplied static QR
remains available as a fallback when checkout secrets are unavailable.
