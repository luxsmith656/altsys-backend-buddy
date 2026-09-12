import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmReservation } from '@/lib/notification-service';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
beforeEach(() => vi.clearAllMocks());
describe('server-only booking email client', () => {
  it('passes only the booking ID, not a client recipient, content or key', async () => {
    state.invoke.mockResolvedValue({ data: { success: true, status: 'sent' }, error: null });
    expect(await confirmReservation({ id: 'booking' })).toEqual({ success: true, status: 'sent' });
    expect(state.invoke).toHaveBeenCalledExactlyOnceWith('send-booking-confirmation', { body: { bookingId: 'booking' } });
  });
  it.each([null, {}, { success: true }, { success: true, status: 'queued' }])('rejects invalid server result %j', async data => {
    state.invoke.mockResolvedValue({ data, error: null });
    expect(await confirmReservation({ id: 'booking' })).toMatchObject({ success: false, code: 'invalid_response' });
  });
  it('keeps queued work distinct from sent mail', async () => {
    state.invoke.mockResolvedValue({ data: { success: false, code: 'queued', error: 'Retry queued' }, error: null });
    expect(await confirmReservation({ id: 'booking' })).toMatchObject({ success: false, code: 'queued' });
  });
  it('surfaces non-2xx server errors', async () => {
    state.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ success: false, code: 'not_configured', error: 'Sender missing' }), { status: 503 }) } });
    expect(await confirmReservation({ id: 'booking' })).toMatchObject({ success: false, error: 'Sender missing' });
  });
  it('reports network failure and allows retry', async () => {
    state.invoke.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { success: true, status: 'already_sent' }, error: null });
    expect(await confirmReservation({ id: 'booking' })).toMatchObject({ success: false });
    expect(await confirmReservation({ id: 'booking' })).toMatchObject({ success: true, status: 'already_sent' });
  });
  it('coalesces concurrent clicks but consults durable server status after reload', async () => {
    let finish!: (value: unknown) => void;
    state.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = confirmReservation({ id: 'booking' }); const second = confirmReservation({ id: 'booking' });
    expect(state.invoke).toHaveBeenCalledTimes(1);
    finish({ data: { success: true, status: 'sent' }, error: null });
    await expect(first).resolves.toMatchObject({ success: true }); await second;
    state.invoke.mockResolvedValue({ data: { success: true, status: 'already_sent' }, error: null });
    await confirmReservation({ id: 'booking' });
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
});
