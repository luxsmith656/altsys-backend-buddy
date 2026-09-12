import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: state.success, warning: state.warning } }));
import EndHikeSettlementDialog from '@/components/admin/EndHikeSettlementDialog';
const booking = { id: 'test-booking', group_size: 1, booking_date: '2026-09-07', notes: JSON.stringify({ fullName: 'Test', hikeType: 'morning' }) };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('requires staff to actively confirm the returning headcount', () => {
  render(<EndHikeSettlementDialog open booking={booking} onClose={vi.fn()} onHikeEnded={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: /All 1 hikers safely returned/ })).not.toBeChecked();
});

it('keeps settlement open and does not mark the booking paid when sessions fail to close', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.from.mockImplementation(() => ({ update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { message: 'Session close denied' } }) }) }) }));
  const ended = vi.fn();
  const closed = vi.fn();
  render(<EndHikeSettlementDialog open booking={booking} onClose={closed} onHikeEnded={ended} />);
  const check = screen.getByRole('checkbox', { name: /All 1 hikers safely returned/ });
  if (!(check as HTMLInputElement).checked) fireEvent.click(check);
  fireEvent.click(screen.getByRole('button', { name: /Collect.*Complete Hike/ }));
  await waitFor(() => expect(state.error).toHaveBeenCalledWith('Failed to end session: Session close denied'));
  expect(state.from).not.toHaveBeenCalledWith('bookings');
  expect(ended).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
});

it('refreshes and closes the collection dialog when payment committed but guide assignment sync failed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const bookingWrites: unknown[] = [];
  state.from.mockImplementation((table: string) => ({
    update: (value: unknown) => {
      if (table === 'bookings') bookingWrites.push(value);
      const result = { error: table === 'booking_assignments' ? { message: 'Assignment denied' } : null };
      return { eq: () => table === 'hiker_sessions' ? { eq: () => Promise.resolve(result) } : Promise.resolve(result) };
    },
    insert: () => Promise.resolve({ error: null }),
  }));
  const ended = vi.fn();
  const closed = vi.fn();
  render(<EndHikeSettlementDialog open booking={booking} onClose={closed} onHikeEnded={ended} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /All 1 hikers safely returned/ }));
  fireEvent.click(screen.getByRole('button', { name: /Collect.*Complete Hike/ }));
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  expect(ended).toHaveBeenCalledTimes(1);
  expect(bookingWrites).toHaveLength(1);
  expect(state.warning).toHaveBeenCalledWith(expect.stringContaining('Payment saved'));
  expect(state.success).not.toHaveBeenCalled();
  expect(state.from).toHaveBeenCalledWith('admin_logs');
});
