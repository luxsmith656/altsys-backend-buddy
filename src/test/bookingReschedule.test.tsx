import { act, cleanup, render, screen } from '@testing-library/react';
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

it('keeps rescheduling out of the booking conversation', async () => {
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => {
    if (table === 'booking_messages') return { order: async () => ({ data: [] }) };
    if (table === 'bookings') return { single: async () => ({ data: { status: 'completed', notes: '{}' } }) };
    return Promise.resolve({ data: [{ status: 'completed' }] });
  } }), update: mocks.update }));
  await act(async () => { render(<BookingChat bookingId="booking" bookingDate="2027-01-01" open onOpenChange={vi.fn()} />); });
  expect(screen.queryByLabelText('Requested hike date')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
});
