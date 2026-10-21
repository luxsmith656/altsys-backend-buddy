import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.0';
import { encodeMeta, parseMeta } from '../_shared/booking-meta.ts';
import type { BookingMeta } from '../../../src/types/index.ts';

const env = (name: string) => (Deno.env.get(name) ?? '').trim();
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const secret = env('PAYMONGO_SECRET_KEY');
  if (!secret) return response({ error: 'PayMongo checkout is not configured; use the QR payment option.' }, 503);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return response({ error: 'Authentication required' }, 401);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceDb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) return response({ error: 'Authentication required' }, 401);

  let input: { bookingId?: string; email?: string; name?: string; phone?: string; purpose?: 'reservation' | 'settlement' };
  try { input = await request.json(); } catch { return response({ error: 'Invalid request body' }, 400); }
  if (!input.bookingId) return response({ error: 'bookingId is required' }, 400);

  const purpose = input.purpose === 'settlement' ? 'settlement' : 'reservation';

  const { data: booking, error: bookingError } = await db
    .from('bookings')
    .select('id,user_id,location_id,status,booking_date,group_size,notes')
    .eq('id', input.bookingId)
    .maybeSingle();
  if (bookingError || !booking) return response({ error: 'Booking not found' }, 404);

  const { data: roles } = await db.from('user_roles').select('role').eq('user_id', authData.user.id);
  const isSuperAdmin = (roles ?? []).some((row: any) => row.role === 'super_admin');
  const isLocalAdmin = (roles ?? []).some((row: any) => row.role === 'admin');
  if (purpose === 'settlement') {
    if (!isSuperAdmin && !isLocalAdmin) return response({ error: 'Only an authorized admin can start onsite settlement.' }, 403);
    if (!isSuperAdmin) {
      const { data: location } = await db.from('user_locations').select('location_id').eq('user_id', authData.user.id).eq('location_id', booking.location_id).maybeSingle();
      if (!location) return response({ error: 'This booking is outside your assigned trailhead.' }, 403);
    }
    if (booking.status === 'cancelled' || booking.status === 'completed') return response({ error: 'This booking is already closed.' }, 409);
  } else if (booking.user_id !== authData.user.id) {
    return response({ error: 'Booking not found' }, 404);
  }

  const meta = parseMeta(booking.notes);
  const totalFee = Number(meta.totalFee ?? 0);
  const amountPaid = Number(meta.amountPaid ?? 0);
  const amount = purpose === 'settlement' ? Math.max(0, totalFee - amountPaid) : totalFee;
  if (!Number.isFinite(amount) || amount <= 0) return response({ error: 'Booking amount is invalid' }, 422);

  const { data: intent, error: intentError } = await serviceDb.rpc('claim_paymongo_checkout', {
    p_booking_id: booking.id,
    p_purpose: purpose,
    p_amount: amount,
  });
  if (intentError) {
    console.error('Could not claim PayMongo checkout intent:', intentError.message);
    return response({ error: 'Could not reserve a payment session. Please try again.' }, 503);
  }
  const claimed = Array.isArray(intent) ? intent[0] : intent;
  if (claimed?.session_id && claimed?.checkout_url) {
    return response({ checkoutUrl: claimed.checkout_url, sessionId: claimed.session_id, amount, purpose, reused: true });
  }
  if (!claimed?.can_create || !claimed?.claim_token) {
    return response({ error: 'A payment session for this booking is already being prepared. Please use the existing checkout or try again shortly.' }, 409);
  }

  const origin = request.headers.get('Origin') || env('APP_ORIGIN') || 'https://mtkali.vercel.app';
  const payload = {
    data: {
      attributes: {
        billing: {
          name: input.name || meta.fullName || 'Mt. Kalisungan Hiker',
          email: input.email || meta.emailAddress || authData.user.email || undefined,
          phone: input.phone || meta.phoneNumber || undefined,
        },
        cancel_url: `${origin}/hiker?payment=cancelled&booking=${booking.id}`,
        success_url: `${origin}/hiker?payment=success&booking=${booking.id}`,
        description: purpose === 'settlement'
          ? `Mt. Kalisungan onsite settlement ${booking.id}`
          : `Mt. Kalisungan booking ${booking.id}`,
        line_items: [{
          amount: Math.round(amount * 100),
          currency: 'PHP',
          description: `Hike on ${booking.booking_date}`,
          name: 'Mt. Kalisungan hiking reservation',
          quantity: 1,
        }],
        payment_method_types: ['qrph'],
        reference_number: booking.id,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
      },
    },
  };

  const paymongoResponse = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${secret}:`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const paymongoBody = await paymongoResponse.json().catch(() => ({}));
  if (!paymongoResponse.ok) {
    console.error('PayMongo checkout creation failed:', paymongoResponse.status, paymongoBody);
    await serviceDb.rpc('fail_paymongo_checkout', {
      p_booking_id: booking.id,
      p_purpose: purpose,
      p_claim_token: claimed.claim_token,
    });
    return response({ error: 'PayMongo could not create the checkout session.' }, 502);
  }

  const sessionId = paymongoBody?.data?.id;
  const checkoutUrl = paymongoBody?.data?.attributes?.checkout_url;
  if (!sessionId || !checkoutUrl) {
    await serviceDb.rpc('fail_paymongo_checkout', {
      p_booking_id: booking.id,
      p_purpose: purpose,
      p_claim_token: claimed.claim_token,
    });
    return response({ error: 'PayMongo returned an incomplete checkout session.' }, 502);
  }

  const { error: completeIntentError } = await serviceDb.rpc('complete_paymongo_checkout', {
    p_booking_id: booking.id,
    p_purpose: purpose,
    p_claim_token: claimed.claim_token,
    p_session_id: sessionId,
    p_checkout_url: checkoutUrl,
  });
  if (completeIntentError) {
    console.error('PayMongo checkout was created but could not be recorded:', completeIntentError.message);
    return response({ error: 'PayMongo checkout could not be safely recorded. Please retry.' }, 503);
  }

  const nextMeta: BookingMeta = {
    ...meta,
    paymentMethod: 'paymongo',
    paymentStatus: 'partial',
    paymongoCheckoutSessionId: sessionId,
    paymongoCheckoutUrl: checkoutUrl,
    paymongoCheckoutCreatedAt: new Date().toISOString(),
    ...(purpose === 'settlement' ? { paymongoPaymentPurpose: 'settlement', paymongoSettlementAmount: amount } : {}),
  };
  const { error: updateError } = await db.from('bookings').update({ notes: encodeMeta(nextMeta) }).eq('id', booking.id);
  if (updateError) console.warn('Checkout created but booking metadata was not updated:', updateError.message);

  return response({ checkoutUrl, sessionId, amount, purpose });
});
