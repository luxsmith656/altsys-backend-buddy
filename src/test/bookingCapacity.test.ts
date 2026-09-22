import { describe, expect, it } from 'vitest';
import { getBookingSlotStatuses, isOneHourStartTime, MAX_SIMULTANEOUS_SUMMIT_GROUPS } from '@/lib/bookingCapacity';

const option = (time: string) => ({ time, label: time });
const booking = (time: string, hikeType = 'morning') => ({
  id: time,
  booking_date: '2026-09-30',
  status: 'confirmed',
  notes: JSON.stringify({ hikeTime: time, hikeType }),
});

describe('booking start and summit capacity', () => {
  it('requires exact whole-hour starts', () => {
    expect(isOneHourStartTime('02:00 AM')).toBe(true);
    expect(isOneHourStartTime('04:30 AM')).toBe(false);
  });

  it('blocks an occupied start and leaves the next hourly start available', () => {
    const result = getBookingSlotStatuses('2026-09-30', [option('02:00 AM'), option('03:00 AM')], 'morning', [booking('02:00 AM')]);
    expect(result[0]).toMatchObject({ available: false, reason: 'already_booked' });
    expect(result[1].available).toBe(true);
  });

  it('blocks the sixth group in one summit window even on another route', () => {
    const bookings = Array.from({ length: MAX_SIMULTANEOUS_SUMMIT_GROUPS }, (_, i) => booking(`${String(i + 2).padStart(2, '0')}:00 AM`));
    const result = getBookingSlotStatuses('2026-09-30', [option('07:00 AM')], 'morning', bookings);
    expect(result[0]).toMatchObject({ available: false, reason: 'summit_capacity' });
  });

  it('ignores cancelled bookings', () => {
    const result = getBookingSlotStatuses('2026-09-30', [option('02:00 AM')], 'morning', [{ ...booking('02:00 AM'), status: 'cancelled' }]);
    expect(result[0].available).toBe(true);
  });
});
