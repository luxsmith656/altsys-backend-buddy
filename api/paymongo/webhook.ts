import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, getHeader, readRawBody, send, supabaseRequest, type ApiRequest, type ApiResponse } from './_shared';

export const config = { api: { bodyParser: false } };

function isValidPaymongoSignature(rawBody: string, header: string | undefined, secret: string, liveMode: boolean) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=', 2);
    return [key?.trim(), value?.trim() || ''];
  }));
  const timestamp = parts.t;
  const supplied = liveMode ? parts.li : parts.te;
  if (!timestamp || !supplied || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 600) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const suppliedBytes = Buffer.from(supplied, 'hex');
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const paymongoSecret = env('PAYMONGO_SECRET_KEY');
  const webhookSecret = env('PAYMONGO_WEBHOOK_SECRET');
  if (!paymongoSecret) return send(res, { error: 'PayMongo is not configured.' }, 503);
  if (!webhookSecret) return send(res, { error: 'PayMongo webhook is not configured.' }, 503);
  if (!env('SUPABASE_SERVICE_ROLE_KEY') && !env('SUPABASE_SECRET_KEY')) return send(res, { error: 'Server database configuration is missing.' }, 503);
  const rawBody = await readRawBody(req);
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return send(res, { error: 'Invalid webhook payload.' }, 400); }
  const liveMode = payload?.data?.attributes?.livemode !== false;
  if (!isValidPaymongoSignature(rawBody, getHeader(req, 'paymongo-signature'), webhookSecret, liveMode)) {
    return send(res, { error: 'Invalid PayMongo webhook signature.' }, 401);
  }
  const eventId = String(payload?.data?.id || '').trim();
  const event = payload?.data?.attributes;
  const eventType = String(event?.type || '');
  if (!eventType.includes('paid') && eventType !== 'payment.paid') return send(res, { received: true });
  const resource = event?.data;
  const attrs = resource?.attributes || {};
  const reference = String(attrs.reference_number || attrs.metadata?.booking_id || '').trim();
  const sessionId = String(resource?.id || attrs.checkout_session_id || '').trim();
  if (!sessionId) return send(res, { received: true });

  // Do not trust a webhook payload by itself. Re-read the resource from
  // PayMongo using the server-only key before changing the booking.
  const resourceType = String(resource?.type || '').toLowerCase();
  const endpoint = resourceType === 'payment' ? 'v1/payments' : 'v2/checkout_sessions';
  const verifiedResponse = await fetch(`https://api.paymongo.com/${endpoint}/${sessionId}`, {
    headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${paymongoSecret}:`).toString('base64')}` },
  });
  const verifiedBody = await verifiedResponse.json().catch(() => ({}));
  if (!verifiedResponse.ok) return send(res, { received: true });
  const verifiedAttrs = verifiedBody?.data?.attributes || {};
  const verifiedPayments = Array.isArray(verifiedAttrs.payments) ? verifiedAttrs.payments : [];
  const verifiedPaid = eventType === 'checkout_session.payment.paid'
    || verifiedAttrs.status === 'paid'
    || verifiedAttrs.status === 'succeeded'
    || verifiedAttrs.payment_intent?.attributes?.status === 'succeeded'
    || verifiedPayments.some((payment: any) => ['paid', 'succeeded'].includes(String(payment?.attributes?.status || '').toLowerCase()));
  if (!verifiedPaid) return send(res, { received: true });
  const verifiedReference = String(verifiedAttrs.reference_number || '').trim();
  const bookingReference = reference || verifiedReference;
  const paidPayment = verifiedPayments.find((payment: any) => payment?.id) || resource;
  const paymentId = String(paidPayment?.id || resource?.id || '').trim();
  const paidAttrs = paidPayment?.attributes || attrs;
  if (!paymentId) return send(res, { received: true });
  const query = bookingReference
    ? `bookings?select=id,user_id,notes&id=eq.${encodeURIComponent(bookingReference)}`
    : `bookings?select=id,user_id,notes&notes=like.*${encodeURIComponent(sessionId)}*`;
  const bookingResponse = await supabaseRequest(query);
  const bookings = await bookingResponse.json().catch(() => []);
  const booking = Array.isArray(bookings) ? bookings[0] : null;
  if (!booking) return send(res, { received: true });
  const amountPaid = Number(paidAttrs.amount || 0) / 100;
  const processResponse = await supabaseRequest('rpc/process_paymongo_payment', {
    method: 'POST',
    body: JSON.stringify({
      p_booking_id: booking.id,
      p_provider_payment_id: paymentId,
      p_provider_event_id: eventId,
      p_amount_paid: amountPaid,
      p_paid_at: new Date().toISOString(),
    }),
  });
  if (!processResponse.ok) return send(res, { error: 'Booking payment update failed' }, 500);
  const processed = await processResponse.json().catch(() => false);
  return send(res, { received: true, alreadyProcessed: processed !== true && !(Array.isArray(processed) && processed[0] === true) });
}
