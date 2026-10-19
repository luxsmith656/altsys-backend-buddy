import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';
import { encodeMeta, parseMeta } from '../_shared/booking-meta.ts';
import type { BookingMeta } from '../../../src/types/index.ts';

const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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
  if (!paymongoSecret) return json({ error: 'PayMongo is not configured.' }, 503);

  const payload = await request.json().catch(() => null);
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

  let query = db.from('bookings').select('id,user_id,notes').limit(1);
  if (reference) query = query.eq('id', reference);
  else if (sessionId) query = query.ilike('notes', `%${sessionId}%`);
  else return json({ received: true });
  const { data: booking, error: bookingError } = await query.maybeSingle();
  if (bookingError || !booking) return json({ received: true });

  const meta = parseMeta(booking.notes);
  if (meta.paymentStatus === 'paid' && meta.paymongoPaymentId === String(resource?.id || '')) {
    return json({ received: true, alreadyProcessed: true });
  }
  const paidPayment = verifiedPayments.find((payment: any) => payment?.id) || resource;
  const paidAttrs = paidPayment?.attributes || attrs;
  const nextMeta: BookingMeta = {
    ...meta,
    paymentMethod: 'paymongo',
    paymentStatus: 'paid',
    amountPaid: Number(paidAttrs.amount || meta.totalFee || 0) / 100,
    paymongoPaymentId: String(paidPayment?.id || resource?.id || ''),
    paymongoPaidAt: new Date().toISOString(),
  };
  const { error: updateError } = await db.from('bookings').update({ notes: encodeMeta(nextMeta) }).eq('id', booking.id);
  if (updateError) return json({ error: 'Booking payment update failed' }, 500);

  await db.from('app_notifications').insert({
    user_id: booking.user_id,
    title: 'Payment received',
    body: `Your PayMongo payment for booking ${booking.id.slice(0, 8)} was received.`,
    category: 'booking',
    link: `/hiker?booking=${booking.id}`,
  });
  return json({ received: true });
});
