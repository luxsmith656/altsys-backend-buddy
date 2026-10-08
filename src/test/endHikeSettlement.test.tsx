import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: state.rpc } }));
vi.mock('@/lib/firestoreNotifications', () => ({ notifyUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: state.success, warning: state.warning } }));

import EndHikeSettlementDialog from '@/components/admin/EndHikeSettlementDialog';

const booking = {
  id: 'test-booking',
  user_id: 'hiker-1',
  group_size: 1,
  booking_date: '2026-09-07',
  notes: JSON.stringify({ fullName: 'Test', hikeType: 'morning' }),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function setupSuccessfulCompletion() {
  state.rpc.mockResolvedValue({ data: { status: 'completed', already_completed: false }, error: null });
  state.from.mockImplementation((table: string) => ({
    insert: () => Promise.resolve({ error: null }),
    update: () => Promise.resolve({ error: null }),
    table,
  }));
}

it('ends a hike without requiring a second headcount entry', async () => {
  setupSuccessfulCompletion();
  const ended = vi.fn();
  const closed = vi.fn();
  render(<EndHikeSettlementDialog open booking={booking} onClose={closed} onHikeEnded={ended} />);

  expect(screen.queryByText('Returned Headcount Verification')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Collect.*Complete Hike/ }));
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  expect(ended).toHaveBeenCalledTimes(1);
  expect(state.rpc).toHaveBeenCalledWith('complete_hike_session', expect.objectContaining({ p_booking_id: booking.id }));
});

it('keeps settlement open when the atomic completion fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.rpc.mockResolvedValue({ data: null, error: { message: 'Completion denied' } });
  const ended = vi.fn();
  const closed = vi.fn();
  render(<EndHikeSettlementDialog open booking={booking} onClose={closed} onHikeEnded={ended} />);
  fireEvent.click(screen.getByRole('button', { name: /Collect.*Complete Hike/ }));
  await waitFor(() => expect(state.error).toHaveBeenCalledWith('Failed to end session: Completion denied'));
  expect(ended).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
});

it('shows an online payment as settled without asking for cash', async () => {
  setupSuccessfulCompletion();
  const onlineBooking = {
    ...booking,
    payment_method: 'gcash',
    payment_status: 'paid',
    notes: JSON.stringify({ ...JSON.parse(booking.notes), paymentMethod: 'gcash', paymentStatus: 'paid', amountPaid: 850 }),
  };
  render(<EndHikeSettlementDialog open booking={onlineBooking} onClose={vi.fn()} onHikeEnded={vi.fn()} />);
  expect(screen.getByText('Paid Online — Payment Fully Settled')).toBeInTheDocument();
  expect(screen.queryByText(/Cash Given by Hiker/)).not.toBeInTheDocument();
});
