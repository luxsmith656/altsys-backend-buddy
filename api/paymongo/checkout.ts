import { env, getHeader, parseNotes, send, supabaseAuthUser, supabaseRequest, type ApiRequest, type ApiResponse } from './_shared';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') return send(res, { ok: true });
  if (req.method !== 'POST') return send(res, { error: 'Method not allowed' }, 405);
  const paymongoSecret = env('PAYMONGO_SECRET_KEY');
  const token = getHeader(req, 'authorization')?.replace(/^Bearer\s+/i, '');
  if (!paymongoSecret || !token) return send(res, { error: 'PayMongo checkout is not configured.' }, 503);

  const authUser = await supabaseAuthUser(token);
  if (!authUser) return send(res, { error: 'Authentication required.' }, 401);
  const input = (req.body && typeof req.body === 'object' ? req.body : {}) as { bookingId?: string; email?: string; name?: string; phone?: string };
  if (!input.bookingId) return send(res, { error: 'bookingId is required' }, 400);
  const bookingResponse = await supabaseRequest(`bookings?select=id,user_id,booking_date,notes&id=eq.${encodeURIComponent(input.bookingId)}&user_id=eq.${encodeURIComponent(authUser.id)}`);
  const bookings = await bookingResponse.json().catch(() => []);
  const booking = Array.isArray(bookings) ? bookings[0] : null;
  if (!bookingResponse.ok || !booking) return send(res, { error: 'Booking not found' }, 404);
  const meta = parseNotes(booking.notes);
  const amount = Number(meta.totalFee || 0);
  if (!Number.isFinite(amount) || amount <= 0) return send(res, { error: 'Booking amount is invalid' }, 422);

  const origin = getHeader(req, 'origin') || env('APP_ORIGIN') || 'https://mtkali.vercel.app';
  const paymongo = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${paymongoSecret}:`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { attributes: {
      billing: { name: input.name || meta.fullName || 'Mt. Kalisungan Hiker', email: input.email || meta.emailAddress, phone: input.phone || meta.phoneNumber },
      cancel_url: `${origin}/hiker?payment=cancelled&booking=${booking.id}`,
      success_url: `${origin}/hiker?payment=success&booking=${booking.id}`,
      description: `Mt. Kalisungan booking ${booking.id}`,
      line_items: [{ amount: Math.round(amount * 100), currency: 'PHP', description: `Hike on ${booking.booking_date}`, name: 'Mt. Kalisungan hiking reservation', quantity: 1 }],
      // Dynamic QR Ph encodes this booking's exact amount. Payment is
      // confirmed automatically by the checkout_session.payment.paid webhook.
      payment_method_types: ['qrph'],
      reference_number: booking.id,
      send_email_receipt: false,
      show_description: true,
      show_line_items: true,
    } } }),
  });
  const body = await paymongo.json().catch(() => ({}));
  if (!paymongo.ok) return send(res, { error: 'PayMongo could not create the checkout session.' }, 502);
  const sessionId = body?.data?.id;
  const checkoutUrl = body?.data?.attributes?.checkout_url;
  if (!sessionId || !checkoutUrl) return send(res, { error: 'PayMongo returned an incomplete checkout session.' }, 502);
  await supabaseRequest(`bookings?id=eq.${encodeURIComponent(booking.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ notes: JSON.stringify({ ...meta, paymentMethod: 'paymongo', paymentStatus: 'partial', paymongoCheckoutSessionId: sessionId, paymongoCheckoutCreatedAt: new Date().toISOString() }) }) });
  return send(res, { checkoutUrl, sessionId });
}
