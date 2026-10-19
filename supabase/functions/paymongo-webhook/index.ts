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
 * Configure PayMongo's webhook signing secret as PAYMONGO_WEBHOOK_SECRET when
 * the account exposes one; otherwise protect this endpoint at the edge.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const configuredSecret = env('PAYMONGO_WEBHOOK_SECRET');
  if (configuredSecret && request.headers.get('x-webhook-secret') !== configuredSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = await request.json().catch(() => null);
  const event = payload?.data?.attributes;
  const eventType = String(event?.type || '');
  if (!eventType.includes('paid') && eventType !== 'payment.paid') return json({ received: true });

  const resource = event?.data;
  const attrs = resource?.attributes ?? {};
  const reference = String(attrs.reference_number || attrs.metadata?.booking_id || '').trim();
  const sessionId = String(resource?.id || attrs.checkout_session_id || '').trim();

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
  const nextMeta: BookingMeta = {
    ...meta,
    paymentMethod: 'paymongo',
    paymentStatus: 'paid',
    amountPaid: Number(attrs.amount || meta.totalFee || 0) / 100,
    paymongoPaymentId: String(resource?.id || ''),
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
