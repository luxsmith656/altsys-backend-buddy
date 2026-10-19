import { databaseClient, env, getHeader, parseNotes, send, type ApiRequest, type ApiResponse } from './_shared';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const configuredSecret = env('PAYMONGO_WEBHOOK_SECRET');
  if (configuredSecret && getHeader(req, 'x-webhook-secret') !== configuredSecret) return send(res, { error: 'Unauthorized' }, 401);
  const db = databaseClient();
  if (!db) return send(res, { error: 'Server database configuration is missing.' }, 503);
  const payload = req.body as any;
  const event = payload?.data?.attributes;
  const eventType = String(event?.type || '');
  if (!eventType.includes('paid') && eventType !== 'payment.paid') return send(res, { received: true });
  const resource = event?.data;
  const attrs = resource?.attributes || {};
  const reference = String(attrs.reference_number || attrs.metadata?.booking_id || '').trim();
  const sessionId = String(resource?.id || attrs.checkout_session_id || '').trim();
  let query = db.from('bookings').select('id,user_id,notes').limit(1);
  if (reference) query = query.eq('id', reference);
  else if (sessionId) query = query.ilike('notes', `%${sessionId}%`);
  else return send(res, { received: true });
  const { data: booking } = await query.maybeSingle();
  if (!booking) return send(res, { received: true });
  const meta = parseNotes(booking.notes);
  if (meta.paymentStatus === 'paid' && meta.paymongoPaymentId === String(resource?.id || '')) return send(res, { received: true, alreadyProcessed: true });
  const nextMeta = { ...meta, paymentMethod: 'paymongo', paymentStatus: 'paid', amountPaid: Number(attrs.amount || meta.totalFee || 0) / 100, paymongoPaymentId: String(resource?.id || ''), paymongoPaidAt: new Date().toISOString() };
  const { error } = await db.from('bookings').update({ notes: JSON.stringify(nextMeta) }).eq('id', booking.id);
  if (error) return send(res, { error: 'Booking payment update failed' }, 500);
  await db.from('app_notifications').insert({ user_id: booking.user_id, title: 'Payment received', body: `Your PayMongo payment for booking ${booking.id.slice(0, 8)} was received.`, category: 'booking', link: `/hiker?booking=${booking.id}` });
  return send(res, { received: true });
}
