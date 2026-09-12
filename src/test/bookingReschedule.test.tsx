import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn(), update: vi.fn(), status: 'completed' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: mocks.from, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn(),
} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'hiker' }, role: 'hiker' }) }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import BookingChat from '@/components/booking/BookingChat';
const originalScrollTo = HTMLElement.prototype.scrollTo;
// jsdom does not implement browser scrolling; this test exercises write guards.
beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); HTMLElement.prototype.scrollTo = originalScrollTo; vi.clearAllMocks(); });

it('does not reopen a completed booking from an already-open reschedule dialog', async () => {
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => {
    if (table === 'booking_messages') return { order: async () => ({ data: [] }) };
    if (table === 'bookings') return { single: async () => ({ data: { status: 'completed', notes: '{}' } }) };
    return Promise.resolve({ data: [{ status: 'completed' }] });
  } }), update: mocks.update }));
  await act(async () => { render(<BookingChat bookingId="booking" bookingDate="2027-01-01" open onOpenChange={vi.fn()} canRequestReschedule />); });
  fireEvent.change(screen.getByLabelText('Requested hike date'), { target: { value: '2027-01-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('This hike has started or ended and cannot be rescheduled.'));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
});
