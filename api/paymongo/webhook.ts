import { env, getHeader, parseNotes, send, supabaseRequest, type ApiRequest, type ApiResponse } from './_shared';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const paymongoSecret = env('PAYMONGO_SECRET_KEY');
  if (!paymongoSecret) return send(res, { error: 'PayMongo is not configured.' }, 503);
  if (!env('SUPABASE_SERVICE_ROLE_KEY') && !env('SUPABASE_SECRET_KEY')) return send(res, { error: 'Server database configuration is missing.' }, 503);
  const payload = req.body as any;
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
  const query = reference
    ? `bookings?select=id,user_id,notes&id=eq.${encodeURIComponent(reference)}`
    : `bookings?select=id,user_id,notes&notes=like.*${encodeURIComponent(sessionId)}*`;
  const bookingResponse = await supabaseRequest(query);
  const bookings = await bookingResponse.json().catch(() => []);
  const booking = Array.isArray(bookings) ? bookings[0] : null;
  if (!booking) return send(res, { received: true });
  const meta = parseNotes(booking.notes);
  if (meta.paymentStatus === 'paid' && meta.paymongoPaymentId === String(resource?.id || '')) return send(res, { received: true, alreadyProcessed: true });
  const paidPayment = verifiedPayments.find((payment: any) => payment?.id) || resource;
  const paidAttrs = paidPayment?.attributes || attrs;
  const nextMeta = { ...meta, paymentMethod: 'paymongo', paymentStatus: 'paid', amountPaid: Number(paidAttrs.amount || meta.totalFee || 0) / 100, paymongoPaymentId: String(paidPayment?.id || resource?.id || ''), paymongoPaidAt: new Date().toISOString() };
  const updateResponse = await supabaseRequest(`bookings?id=eq.${encodeURIComponent(booking.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notes: JSON.stringify(nextMeta) }) });
  if (!updateResponse.ok) return send(res, { error: 'Booking payment update failed' }, 500);
  await supabaseRequest('app_notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: booking.user_id, title: 'Payment received', body: `Your PayMongo payment for booking ${booking.id.slice(0, 8)} was received.`, category: 'booking', link: `/hiker?booking=${booking.id}` }) });
  return send(res, { received: true });
}
