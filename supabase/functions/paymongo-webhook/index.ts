import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';

const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function isValidPaymongoSignature(rawBody: string, header: string | null, secret: string, liveMode: boolean) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=', 2);
    return [key?.trim(), value?.trim() || ''];
  }));
  const timestamp = parts.t;
  const supplied = liveMode ? parts.li : parts.te;
  if (!timestamp || !supplied || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return expected === supplied.toLowerCase();
}

/**
 * PayMongo calls this endpoint for payment events. Keep it idempotent: a
 * retried webhook must not send duplicate notifications or rewrite paid data.
 * PayMongo's paid event is only accepted after the resource is re-read with
 * the server-only secret key. This keeps payment confirmation automatic while
 * avoiding client-submitted proof or status changes.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const paymongoSecret = env('PAYMONGO_SECRET_KEY');
  const webhookSecret = env('PAYMONGO_WEBHOOK_SECRET');
  if (!paymongoSecret) return json({ error: 'PayMongo is not configured.' }, 503);
  if (!webhookSecret) return json({ error: 'PayMongo webhook is not configured.' }, 503);

  const rawBody = await request.text();
  const payload = JSON.parse(rawBody || '{}');
  const liveMode = payload?.data?.attributes?.livemode !== false;
  if (!await isValidPaymongoSignature(rawBody, request.headers.get('paymongo-signature'), webhookSecret, liveMode)) {
    return json({ error: 'Invalid PayMongo webhook signature.' }, 401);
  }
  const eventId = String(payload?.data?.id || '').trim();
  const event = payload?.data?.attributes;
  const eventType = String(event?.type || '');
  if (!eventType.includes('paid') && eventType !== 'payment.paid') return json({ received: true });

  const resource = event?.data;
  const attrs = resource?.attributes ?? {};
  const reference = String(attrs.reference_number || attrs.metadata?.booking_id || '').trim();
  const sessionId = String(resource?.id || attrs.checkout_session_id || '').trim();

  if (!sessionId) return json({ received: true });
  const resourceType = String(resource?.type || '').toLowerCase();
  const endpoint = resourceType === 'payment' ? 'v1/payments' : 'v2/checkout_sessions';
  const verifiedResponse = await fetch(`https://api.paymongo.com/${endpoint}/${sessionId}`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${btoa(`${paymongoSecret}:`)}` },
  });
  const verifiedBody = await verifiedResponse.json().catch(() => ({}));
  if (!verifiedResponse.ok) return json({ received: true });
  const verifiedAttrs = verifiedBody?.data?.attributes ?? {};
  const verifiedPayments = Array.isArray(verifiedAttrs.payments) ? verifiedAttrs.payments : [];
  const verifiedPaid = eventType === 'checkout_session.payment.paid'
    || verifiedAttrs.status === 'paid'
    || verifiedAttrs.status === 'succeeded'
    || verifiedAttrs.payment_intent?.attributes?.status === 'succeeded'
    || verifiedPayments.some((payment: any) => ['paid', 'succeeded'].includes(String(payment?.attributes?.status || '').toLowerCase()));
  if (!verifiedPaid) return json({ received: true });
  const verifiedReference = String(verifiedAttrs.reference_number || '').trim();
  const bookingReference = reference || verifiedReference;
  const paidPayment = verifiedPayments.find((payment: any) => payment?.id) || resource;
  const paymentId = String(paidPayment?.id || resource?.id || '').trim();
  if (!paymentId) return json({ received: true });

  let query = db.from('bookings').select('id,user_id,notes').limit(1);
  if (bookingReference) query = query.eq('id', bookingReference);
  else if (sessionId) query = query.ilike('notes', `%${sessionId}%`);
  else return json({ received: true });
  const { data: booking, error: bookingError } = await query.maybeSingle();
  if (bookingError || !booking) return json({ received: true });

  const paidAttrs = paidPayment?.attributes || attrs;
  const { data: processed, error: processError } = await db.rpc('process_paymongo_payment', {
    p_booking_id: booking.id,
    p_provider_payment_id: paymentId,
    p_provider_event_id: eventId,
    p_amount_paid: Number(paidAttrs.amount || 0) / 100,
    p_paid_at: new Date().toISOString(),
  });
  if (processError) return json({ error: 'Booking payment update failed' }, 500);
  return json({ received: true, alreadyProcessed: processed !== true });
});
