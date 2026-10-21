// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { paymongoWebhookHandler, validSignature, type WebhookDeps } from '../../supabase/functions/paymongo-webhook/handler';

const bookingId = '00000000-0000-4000-8000-000000000042';
const webhookSecret = 'whsk_test_secret';
const secret = 'sk_test_secret';

async function sign(raw: string, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},te=${hex},li=${hex}`;
}

const event = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  data: {
    id: 'evt_test_1',
    attributes: {
      livemode: false,
      type: 'checkout_session.payment.paid',
      data: { id: 'cs_test_123', type: 'checkout_session' },
      ...overrides,
    },
  },
});

const paidSession = (amount = 37000) => ({
  data: {
    id: 'cs_test_123',
    attributes: {
      livemode: false,
      reference_number: bookingId,
      payments: [{ id: 'pay_test_1', attributes: { status: 'paid', amount, currency: 'PHP', paid_at: 1780000000 } }],
    },
  },
});

function makeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    secret,
    webhookSecret,
    fetcher: vi.fn(async () => new Response(JSON.stringify(paidSession()), { status: 200 })) as unknown as typeof fetch,
    loadBooking: vi.fn(async () => ({ id: bookingId, notes: JSON.stringify({ totalFee: 370 }) })),
    process: vi.fn(async () => true),
    ...overrides,
  };
}

async function post(handler: ReturnType<typeof paymongoWebhookHandler>, raw: string, header: string | null) {
  return handler(new Request('https://example.test/paymongo-webhook', {
    method: 'POST',
    headers: header ? { 'paymongo-signature': header } : {},
    body: raw,
  }));
}

describe('paymongo webhook signature', () => {
  it('accepts a valid raw-body signature and rejects tampering', async () => {
    const raw = event();
    expect(await validSignature(raw, await sign(raw), webhookSecret, false)).toBe(true);
    expect(await validSignature(raw + ' ', await sign(raw), webhookSecret, false)).toBe(false);
    expect(await validSignature(raw, null, webhookSecret, false)).toBe(false);
    expect(await validSignature(raw, await sign(raw, Math.floor(Date.now() / 1000) - 3600), webhookSecret, false)).toBe(false);
  });
});

describe('paymongo webhook handler', () => {
  it('verifies the payment with the provider and records it once', async () => {
    const deps = makeDeps();
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ received: true, alreadyProcessed: false });
    expect(deps.fetcher).toHaveBeenCalledWith(
      'https://api.paymongo.com/v1/checkout_sessions/cs_test_123',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Basic ${btoa(`${secret}:`)}` }) }),
    );
    expect(deps.process).toHaveBeenCalledWith({
      p_booking_id: bookingId,
      p_provider_payment_id: 'pay_test_1',
      p_provider_event_id: 'evt_test_1',
      p_amount_paid: 370,
      p_paid_at: new Date(1780000000 * 1000).toISOString(),
    });
  });

  it('reports an already-processed repeat delivery without failing', async () => {
    const deps = makeDeps({ process: vi.fn(async () => false) });
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ received: true, alreadyProcessed: true });
  });

  it('rejects an invalid signature before touching the provider', async () => {
    const deps = makeDeps();
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, 't=1,te=deadbeef');
    expect(result.status).toBe(401);
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.process).not.toHaveBeenCalled();
  });

  it('rejects a paid amount that does not match the reservation', async () => {
    const deps = makeDeps({ fetcher: vi.fn(async () => new Response(JSON.stringify(paidSession(100)), { status: 200 })) as unknown as typeof fetch });
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));
    expect(result.status).toBe(422);
    expect((await result.json()).code).toBe('amount_mismatch');
    expect(deps.process).not.toHaveBeenCalled();
  });

  it('checks a settlement payment against the remaining balance', async () => {
    const deps = makeDeps({
      loadBooking: vi.fn(async () => ({ id: bookingId, notes: JSON.stringify({ totalFee: 370, amountPaid: 100 }) })),
      fetcher: vi.fn(async () => new Response(JSON.stringify(paidSession(27000)), { status: 200 })) as unknown as typeof fetch,
    });
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));

    expect(result.status).toBe(200);
    expect(deps.process).toHaveBeenCalledWith(expect.objectContaining({ p_amount_paid: 270 }));
  });

  it('asks PayMongo to retry when the provider cannot be reached', async () => {
    const deps = makeDeps({ fetcher: vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch });
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));
    expect(result.status).toBe(502);
    expect(deps.process).not.toHaveBeenCalled();
  });

  it('rejects malformed events and ignores other event types', async () => {
    const deps = makeDeps();
    const bad = await post(paymongoWebhookHandler(deps), 'not json', null);
    expect(bad.status).toBe(400);
    const other = JSON.stringify({ data: { id: 'evt_2', attributes: { livemode: false, type: 'payment.failed', data: { id: 'cs_test_123', type: 'checkout_session' } } } });
    const ignored = await post(paymongoWebhookHandler(deps), other, await sign(other));
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toEqual({ received: true, ignored: true });
    expect(deps.process).not.toHaveBeenCalled();
  });

  it('refuses to process a payment the provider has not marked paid', async () => {
    const session = paidSession();
    session.data.attributes.payments[0].attributes.status = 'pending';
    const deps = makeDeps({ fetcher: vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })) as unknown as typeof fetch });
    const raw = event();
    const result = await post(paymongoWebhookHandler(deps), raw, await sign(raw));
    expect(result.status).toBe(409);
    expect(deps.process).not.toHaveBeenCalled();
  });
});
