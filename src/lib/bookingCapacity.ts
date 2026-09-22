import type { HikeType, HikeTimeOption } from '@/lib/hikeSchedule';

/** Maximum number of groups that may be in the summit window together. */
export const MAX_SIMULTANEOUS_SUMMIT_GROUPS = 5;
const SUMMIT_WINDOW_HOURS = 6;

/** Booking states that still reserve a start and summit slot. */
export const CAPACITY_HOLD_STATUSES = ['pending', 'confirmed', 'accepted', 'active', 'adjustment_pending'];

export interface ScheduledBooking {
  id?: string;
  booking_date: string;
  status?: string | null;
  notes?: string | null;
}

export interface BookingSlotStatus {
  time: string;
  available: boolean;
  reason?: 'already_booked' | 'summit_capacity';
  summitSlot: string;
}

export function parseStoredHikeTime(notes?: string | null): string | null {
  if (!notes) return null;
  try {
    const value = JSON.parse(notes) as { hikeTime?: unknown };
    return typeof value.hikeTime === 'string' ? value.hikeTime.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export function parseStoredHikeType(notes?: string | null): HikeType {
  if (!notes) return 'morning';
  try {
    const value = JSON.parse(notes) as { hikeType?: unknown };
    if (value.hikeType === 'night' || value.hikeType === 'overnight' || value.hikeType === 'day') return value.hikeType;
  } catch {
    // Legacy/plain-text notes do not have schedule metadata.
  }
  return 'morning';
}

export function timeToMinutes(value: string): number | null {
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute !== 0) return null;
  return ((hour % 12) + (match[3] === 'PM' ? 12 : 0)) * 60;
}

/** The summit window is deliberately conservative for capacity protection. */
export function summitSlotForBooking(time: string, hikeType: HikeType): string | null {
  const minutes = timeToMinutes(time);
  if (minutes === null) return null;
  const travelHours = hikeType === 'overnight' ? 5 : hikeType === 'night' ? 3 : 4;
  const summitMinutes = minutes + travelHours * 60;
  const dayOffset = Math.floor(summitMinutes / (24 * 60));
  const withinDay = summitMinutes % (24 * 60);
  return `${dayOffset}:${Math.floor(withinDay / (SUMMIT_WINDOW_HOURS * 60))}`;
}

export function isCapacityHoldingBooking(booking: ScheduledBooking): boolean {
  return CAPACITY_HOLD_STATUSES.includes(String(booking.status ?? 'pending'));
}

export function getBookingSlotStatuses(
  date: string,
  options: HikeTimeOption[],
  hikeType: HikeType,
  bookings: ScheduledBooking[],
): BookingSlotStatus[] {
  const sameDay = bookings.filter((booking) => booking.booking_date === date && isCapacityHoldingBooking(booking));
  const scheduled = sameDay.map((booking) => ({
    time: parseStoredHikeTime(booking.notes),
    summitSlot: summitSlotForBooking(parseStoredHikeTime(booking.notes) ?? '', parseStoredHikeType(booking.notes)),
  }));

  return options.map((option) => {
    const summitSlot = summitSlotForBooking(option.time, hikeType) ?? '';
    const sameStart = scheduled.some((entry) => entry.time === option.time.toUpperCase());
    const sameSummit = scheduled.filter((entry) => entry.summitSlot === summitSlot).length;
    return {
      time: option.time,
      summitSlot,
      available: !sameStart && sameSummit < MAX_SIMULTANEOUS_SUMMIT_GROUPS,
      reason: sameStart ? 'already_booked' : sameSummit >= MAX_SIMULTANEOUS_SUMMIT_GROUPS ? 'summit_capacity' : undefined,
    };
  });
}

export function isOneHourStartTime(time: string): boolean {
  return timeToMinutes(time) !== null;
}
