import { z } from 'zod';

const eventSchema = z.object({ data: z.object({ id: z.string().min(1), attributes: z.object({
  livemode: z.boolean(), type: z.string(),
  data: z.object({ id: z.string().regex(/^cs_[A-Za-z0-9_]+$/), type: z.literal('checkout_session') }).passthrough(),
}).passthrough() }).passthrough() });
const uuid = z.string().uuid();
type Booking = { id: string; notes: string };
export type WebhookDeps = {
  secret: string; webhookSecret: string; fetcher: typeof fetch;
  loadBooking: (id: string) => Promise<Booking | null>;
  process: (input: { p_booking_id: string; p_provider_payment_id: string; p_provider_event_id: string; p_amount_paid: number; p_paid_at: string }) => Promise<boolean>;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (code: string, error: string, status: number) => json({ received: false, code, error }, status);

export async function validSignature(raw: string, header: string | null, secret: string, live: boolean) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(part => part.trim().split('=', 2)));
  const supplied = live ? parts.li : parts.te;
  if (!/^\d+$/.test(parts.t ?? '') || !/^[a-fA-F0-9]{64}$/.test(supplied ?? '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${raw}`)));
  let difference = 0;
  for (let i = 0; i < signature.length; i++) difference |= signature[i] ^ parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
  return difference === 0;
}

export function paymongoWebhookHandler(deps: WebhookDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST.', 405);
    if (!deps.secret || !deps.webhookSecret) return fail('not_configured', 'Payment service is not configured.', 503);
    try {
      const raw = await req.text();
      if (raw.length > 262144) return fail('too_large', 'Event exceeds size limit.', 413);
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return fail('invalid_json', 'Invalid JSON.', 400); }
      const mode = z.object({ data: z.object({ attributes: z.object({ livemode: z.boolean(), type: z.string() }) }) }).safeParse(body);
      if (!mode.success) return fail('invalid_event', 'Invalid payment event.', 400);
      if (!await validSignature(raw, req.headers.get('paymongo-signature'), deps.webhookSecret, mode.data.data.attributes.livemode)) return fail('invalid_signature', 'Invalid payment signature.', 401);
      if (mode.data.data.attributes.type !== 'checkout_session.payment.paid') return json({ received: true, ignored: true });
      const parsed = eventSchema.safeParse(body);
      if (!parsed.success) return fail('invalid_event', 'Invalid checkout event.', 400);
      const event = parsed.data.data;
      const sessionId = event.attributes.data.id;
      const response = await deps.fetcher(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${btoa(`${deps.secret}:`)}` }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return fail('provider_unavailable', 'Payment verification could not complete; retry delivery.', 502);
      const sessionSchema = z.object({ data: z.object({ id: z.literal(sessionId), attributes: z.object({
        livemode: z.literal(event.attributes.livemode), reference_number: uuid,
        payments: z.array(z.object({ id: z.string().regex(/^pay_[A-Za-z0-9_]+$/), attributes: z.object({
          status: z.string(), amount: z.number().int().positive(), currency: z.literal('PHP'), paid_at: z.number().optional(),
        }).passthrough() }).passthrough()),
      }).passthrough() }).passthrough() });
      const verified = sessionSchema.safeParse(await response.json());
      if (!verified.success) return fail('invalid_provider_payment', 'Payment verification data is invalid.', 422);
      const attrs = verified.data.data.attributes;
      const paid = attrs.payments.find(payment => payment.attributes.status === 'paid');
      if (!paid) return fail('payment_not_paid', 'Payment is not yet verified as paid; retry delivery.', 409);
      const booking = await deps.loadBooking(attrs.reference_number);
      if (!booking) return fail('booking_not_found', 'Matching booking was not found.', 404);
      const meta = z.object({ totalFee: z.coerce.number().positive() }).safeParse(JSON.parse(booking.notes));
      if (!meta.success || Math.round(meta.data.totalFee * 100) !== paid.attributes.amount) return fail('amount_mismatch', 'Paid amount does not match the reservation.', 422);
      const processed = await deps.process({ p_booking_id: booking.id, p_provider_payment_id: paid.id,
        p_provider_event_id: event.id, p_amount_paid: paid.attributes.amount / 100,
        p_paid_at: paid.attributes.paid_at ? new Date(paid.attributes.paid_at * 1000).toISOString() : new Date().toISOString() });
      return json({ received: true, alreadyProcessed: !processed });
    } catch {
      return fail('processing_failed', 'Payment processing could not complete; retry delivery.', 500);
    }
  };
}