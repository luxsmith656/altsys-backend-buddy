import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn(), user: { id: 'admin', email: 'admin@example.test' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
import EditPaymentDialog from '@/components/booking/EditPaymentDialog';
import BookingReceipt from '@/components/booking/BookingReceipt';
import { bookingReceipt } from '@/lib/bookingReceipt';
afterEach(async () => { await act(async () => cleanup()); vi.clearAllMocks(); });

it('saves named expenses and preserves the original quote and night fee on reload', async () => {
  const writes: { notes: string }[] = [];
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Admin' } }) }) }),
    update: (value: { notes: string }) => { if (table === 'bookings') writes.push(value); return { eq: async () => ({ error: null }) }; },
    insert: async () => ({ error: null }),
  }));
  const booking = { id: 'booking', group_size: 1, notes: JSON.stringify({ hikeType: 'night', totalFee: 1050, baseFee: 1050, originalQuote: { total: 1050, capturedAt: '2026-09-09' } }) };
  const closed = vi.fn();
  await act(async () => { render(<EditPaymentDialog booking={booking} open onClose={closed} />); });
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  fireEvent.change(screen.getByLabelText('Expense 1 name'), { target: { value: 'Water' } });
  fireEvent.change(screen.getByLabelText('Expense 1 amount'), { target: { value: '60' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  fireEvent.change(screen.getByLabelText('Expense 2 name'), { target: { value: 'Porter' } });
  fireEvent.change(screen.getByLabelText('Expense 2 amount'), { target: { value: '300' } });
  fireEvent.change(screen.getByPlaceholderText(/Hiker requested emergency horse/i), { target: { value: 'Requested water and porter' } });
  fireEvent.click(screen.getByRole('button', { name: /Save/i }));
  await waitFor(() => expect(closed).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  const saved = { ...booking, notes: writes[0].notes };
  expect(bookingReceipt(saved).total).toBe(1410);
  expect(bookingReceipt(saved).originalTotal).toBe(1050);
  expect(JSON.parse(saved.notes).guideFee).toBe(1000);
  cleanup();
  render(<BookingReceipt booking={saved} />);
  expect(screen.getByRole('region', { name: 'Booking receipt' })).toHaveTextContent('Water');
  expect(screen.getByRole('region', { name: 'Booking receipt' })).toHaveTextContent('Porter');
  cleanup();
  await act(async () => { render(<EditPaymentDialog booking={saved} open onClose={closed} />); });
  expect(screen.getByLabelText('Expense 1 amount')).toHaveValue(60);
  fireEvent.click(screen.getByRole('button', { name: 'Remove expense 1' }));
  expect(screen.getByLabelText('Expense 1 name')).toHaveValue('Porter');
});
