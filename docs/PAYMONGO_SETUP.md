# PayMongo payment setup

Online hiker payments now use a PayMongo Hosted Checkout Session restricted to
dynamic QR Ph. PayMongo generates a QR code for the exact booking amount, the
hiker scans and pays it, and the `checkout_session.payment.paid` webhook marks
the booking paid automatically. No screenshot, transaction reference, bank
transfer, or admin verification is used for online bookings.

The supplied static QR image remains available only for staff walk-in payment
collection. It is not used for automatic online booking confirmation.

## Secret handling

Never put the PayMongo secret key in `VITE_*` variables, source files, or Git.
For the automatic Checkout API and webhook, add the keys as Vercel project
environment variables instead:

```text
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_SECRET_KEY=sk_live_...
```

`PAYMONGO_SECRET_KEY` belongs only in the Vercel server environment. The
frontend does not need either key for the static QR fallback.

In Vercel, open **Project Settings → Environment Variables**, then add those
the two PayMongo variables for **Production** (and Preview if you test there). Do not add
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
```

Vercel deploys `api/paymongo/checkout.ts` and `api/paymongo/webhook.ts`
automatically. Register one PayMongo webhook pointing to
`https://YOUR_VERCEL_DOMAIN/api/paymongo/webhook` and subscribe to
`checkout_session.payment.paid`. Use PayMongo's test keys first; switch to
live keys only after a real test payment succeeds. If the server variables are
missing, online checkout stops with a clear configuration error instead of
creating a booking that appears paid.
