// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBookingEmail, dispatchBookingEmail, type BookingEmailStore, type EmailJob } from '../../supabase/functions/_shared/booking-email';
import { bookingConfirmationHandler } from '../../supabase/functions/send-booking-confirmation/handler';

const id = '00000000-0000-4000-8000-000000000001';
const meta = { fullName: 'Juan Dela Cruz', emailAddress: ' HIKER@example.com ', hikeTime: '06:00 AM', hikeType: 'morning', assignedGuideId: 'guide-1', guideStatus: 'accepted' };
const makeDetails = () => ({ booking: { id, status: 'confirmed', booking_date: '2026-09-10', group_size: 4, location_id: 'lamot2', notes: JSON.stringify(meta) }, guide: { full_name: 'Maria Santos', phone: '+63 917 123 4567' }, location: { name: 'Lamot 2' } });
const from = 'Mt. Kalisungan <bookings@example.com>';

describe('booking confirmation content', () => {
  it('uses actual recipient, schedule, guide/contact, jump-off and embedded logo, without OTP', () => {
    const result = makeBookingEmail({ ...makeDetails(), from });
    expect(result.to).toEqual(['hiker@example.com']);
    for (const value of ['September 10, 2026', '06:00 AM PHT (UTC+8)', 'Maria Santos', '+63 917 123 4567', 'Lamot 2', '4 hikers', 'Call your guide the day before', 'cid:kalisungan-logo']) expect(result.html).toContain(value);
    expect(result.attachments[0].content_id).toBe('kalisungan-logo');
    expect(Buffer.from(result.attachments[0].content, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(result.html).not.toMatch(/otp_code|Security Check|\{\{/);
  });
  it.each(['pending', 'adjustment_pending', 'cancelled', 'completed'])('rejects %s bookings', status => {
    const details = makeDetails(); details.booking.status = status;
    expect(() => makeBookingEmail({ ...details, from })).toThrow();
  });
  it.each([{ emailAddress: '' }, { emailAddress: 'invalid' }, { fullName: '' }, { guideStatus: 'pending' }, { assignedGuideId: '' }, { hikeTime: '25:00' }, { hikeTime: '' }, { hikeType: 'unknown' }])('rejects invalid metadata %j', change => {
    const details = makeDetails(); details.booking.notes = JSON.stringify({ ...meta, ...change });
    expect(() => makeBookingEmail({ ...details, from })).toThrow();
  });
  it.each(['guide', 'contact', 'location', 'date', 'pax'])('does not invent missing %s', field => {
    const details = makeDetails();
    if (field === 'guide') details.guide.full_name = '';
    if (field === 'contact') details.guide.phone = '';
    if (field === 'location') details.location.name = '';
    if (field === 'date') details.booking.booking_date = '2026-02-30';
    if (field === 'pax') details.booking.group_size = 0;
    expect(() => makeBookingEmail({ ...details, from })).toThrow();
  });
  it('uses adjusted schedule only after acknowledgement without timezone date shifts', () => {
    const details = makeDetails();
    details.booking.notes = JSON.stringify({ ...meta, adjustedDate: '2026-09-10', adjustedTime: '14:00' });
    expect(makeBookingEmail({ ...details, from }).text).toContain('06:00 AM');
    details.booking.notes = JSON.stringify({ ...meta, adjustedDate: '2026-09-10', adjustedTime: '14:00', bookingChangeAcknowledgedAt: '2026-09-09T10:00:00Z' });
    expect(makeBookingEmail({ ...details, from }).text).toContain('02:00 PM PHT');
    expect(makeBookingEmail({ ...details, from }).text).toContain('September 10, 2026');
  });
  it('escapes injected markup and omits medical and companion details', () => {
    const details = makeDetails(); details.booking.notes = JSON.stringify({ ...meta, fullName: '<img src=x onerror=alert(1)>', medicalNotes: 'PRIVATE-MEDICAL', companions: ['PRIVATE-PERSON'] });
    const result = makeBookingEmail({ ...details, from });
    expect(result.html).toContain('&lt;img'); expect(result.html).not.toContain('<img src=x');
    expect(result.html + result.text).not.toMatch(/PRIVATE-MEDICAL|PRIVATE-PERSON/);
  });
});

describe('Resend dispatcher and endpoint', () => {
  let job: EmailJob; let store: BookingEmailStore; let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    job = { booking_id: id, status: 'pending', attempts: 0, payload: null, provider_id: null, first_attempt_at: null };
    store = {
      claim: vi.fn(async () => { if (job.status !== 'pending') return null; job.status = 'processing'; job.attempts++; return { ...job }; }),
      getJob: vi.fn(async () => ({ ...job })), loadDetails: vi.fn(async () => makeDetails()),
      update: vi.fn(async (_job, patch) => { Object.assign(job, patch); }),
    };
    fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 }));
  });
  const deps = () => ({ store, apiKey: 'test-server-only', from, fetcher });
  it('sends one server payload, records provider acceptance, and suppresses duplicate requests', async () => {
    expect(await dispatchBookingEmail(id, deps())).toEqual({ success: true, status: 'sent' });
    expect(job.provider_id).toBe('resend-1');
    const [url, req] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails'); expect(req?.method).toBe('POST');
    expect(req?.headers).toMatchObject({ Authorization: 'Bearer test-server-only', 'Idempotency-Key': `booking-confirmation/${id}` });
    expect(JSON.parse(String(req?.body))).toEqual(job.payload);
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: true, status: 'already_sent' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('prevents two leased callers sending concurrently', async () => {
    const results = await Promise.all([dispatchBookingEmail(id, deps()), dispatchBookingEmail(id, deps())]);
    expect(results.some(result => result.success)).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires sender and key before claiming work', async () => {
    expect(await dispatchBookingEmail(id, { ...deps(), from: '' })).toMatchObject({ success: false, code: 'not_configured' });
    expect(store.claim).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([429, 500, 503])('queues retry on HTTP %s without success', async status => {
    fetcher.mockResolvedValue(new Response('{}', { status }));
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'queued' });
    expect(job.status).toBe('pending'); expect(job.provider_id).toBeNull();
  });
  it('retries timeout with identical payload and key', async () => {
    fetcher.mockRejectedValueOnce(new Error('timeout'));
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'queued' });
    const payload = JSON.stringify(job.payload);
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: true });
    for (const call of fetcher.mock.calls) expect(call[1]).toMatchObject({ body: payload, headers: { 'Idempotency-Key': `booking-confirmation/${id}` } });
  });
  it.each([401, 403, 422])('holds rejected HTTP %s for review', async status => {
    fetcher.mockResolvedValue(new Response('{}', { status }));
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'delivery_failed' });
    expect(job.status).toBe('needs_review');
  });
  it.each(['date', 'guide', 'recipient', 'pax'])('holds a pending confirmation when its %s changes', async field => {
    fetcher.mockRejectedValueOnce(new Error('timeout'));
    await dispatchBookingEmail(id, deps());
    const details = makeDetails();
    if (field === 'date') details.booking.booking_date = '2026-09-12';
    if (field === 'guide') details.guide.full_name = 'Replacement Guide';
    if (field === 'recipient') details.booking.notes = JSON.stringify({ ...meta, emailAddress: 'changed@example.com' });
    if (field === 'pax') details.booking.group_size = 5;
    vi.mocked(store.loadDetails).mockResolvedValue(details);
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'details_changed' });
    expect(job.status).toBe('needs_review');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed provider success', async () => {
    fetcher.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false }); expect(job.status).not.toBe('sent');
  });
  it('does not send if required accepted assignment cannot be verified', async () => {
    vi.mocked(store.loadDetails).mockRejectedValue(new Error('No accepted assignment'));
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'missing_details' }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not claim success if persisting provider acceptance fails', async () => {
    vi.mocked(store.update).mockImplementation(async (_job, patch) => { if (patch.status === 'sent') throw new Error('db down'); Object.assign(job, patch); });
    expect(await dispatchBookingEmail(id, deps())).toMatchObject({ success: false, code: 'storage_failed' }); expect(job.status).toBe('processing');
  });
  it('rejects missing/expired auth, wrong role and tampered bodies before sending', async () => {
    const handler = bookingConfirmationHandler({ ...deps(), workerSecret: '', userForToken: async token => token === 'valid' ? 'user' : null, authorize: async () => false, dueIds: async () => [] });
    for (const [token, body, status] of [[null, { bookingId: id }, 401], ['expired', { bookingId: id }, 401], ['valid', { bookingId: id }, 403], ['valid', { bookingId: id, to: 'attacker@example.com' }, 400]] as const) {
      const result = await handler(new Request('https://example.test', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
      expect(result.status).toBe(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts an authorized user and rejects an unknown worker secret', async () => {
    const handler = bookingConfirmationHandler({ ...deps(), workerSecret: 'x'.repeat(32), userForToken: async () => 'user', authorize: async () => true, dueIds: async () => [id] });
    const denied = await handler(new Request('https://example.test', { method: 'POST', headers: { 'x-booking-email-worker': 'wrong' }, body: '{"runQueue":true}' }));
    expect(denied.status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
    const result = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ bookingId: id }) }));
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ success: true, status: 'sent' });
  });
});
