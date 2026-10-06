import { describe, expect, it, vi } from 'vitest';
import { withBookingRequestTimeout } from '@/lib/bookingRequest';

describe('booking request deadline', () => {
  it('returns a successful request without waiting for the timeout', async () => {
    await expect(withBookingRequestTimeout(async () => 'saved', 'Booking', 1000)).resolves.toBe('saved');
  });

  it('aborts a stalled request and reports a recoverable timeout', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const request = withBookingRequestTimeout(
      (signal) => {
        requestSignal = signal;
        return new Promise<string>(() => undefined);
      },
      'Booking submission',
      1000,
    );
    const assertion = expect(request).rejects.toThrow('Booking submission took too long');

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
