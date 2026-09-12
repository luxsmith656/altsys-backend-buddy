import { describe, expect, it } from 'vitest';
import { summarizeAdminOverview } from '@/lib/adminOverview';

const today = '2026-09-07';
const booking = { id: 'b1', booking_date: today, status: 'confirmed', group_size: 2, notes: JSON.stringify({ fullName: 'Test', age: '25', city: 'Laguna', amountPaid: 300, hikeType: 'night', onsiteStartConfirmed: true, companionDetails: [{ name: 'Companion', age: '16', city: 'Laguna' }] }) };
const session = { id: 's1', booking_id: 'b1', participant_role: 'hiker', status: 'active', start_time: '2026-09-06T23:00:00Z', end_time: null };

describe('database-backed admin overview', () => {
  it('keeps an empty location empty, without fictional visitors or logs', () => {
    const data = summarizeAdminOverview([], [], today);
    expect(data.totalBookings).toBe(0);
    expect(data.activeHikers).toBe(0);
    expect(data.todayRevenue).toBe(0);
    expect(data.recentLogs).toEqual([]);
    expect(data.ageData).toEqual([]);
  });

  it('counts the hiking group once, excludes guides and finished sessions, and reports actual collections', () => {
    const data = summarizeAdminOverview([booking], [session, { ...session, id: 's2' }, { ...session, id: 'guide', participant_role: 'guide' }, { ...session, id: 'ended', status: 'completed' }], today);
    expect(data.activeHikers).toBe(2);
    expect(data.todayRevenue).toBe(300);
    expect(data.collectionRate).toBe(27); // 300 collected of a 1,100 night hike, not an 800 guide quote.
    expect(data.ageData).toEqual([{ name: '25-34', value: 1 }, { name: 'Under 18', value: 1 }]);
    expect(data.originData).toEqual([{ name: 'Laguna', value: 2 }]);
    expect(data.recentLogs).toHaveLength(1);
  });

  it('does not count completed bookings as active just because their check-in flag remains true', () => {
    const data = summarizeAdminOverview([{ ...booking, status: 'completed' }], [{ ...session, status: 'completed' }], today);
    expect(data.activeHikers).toBe(0);
    expect(data.recentLogs).toHaveLength(0);
  });

  it('counts ongoing overnight groups but not their bookings or revenue as today\'s reservations', () => {
    const data = summarizeAdminOverview([{ ...booking, booking_date: '2026-09-06' }], [session], today);
    expect(data.activeHikers).toBe(2);
    expect(data.totalBookings).toBe(0);
    expect(data.todayRevenue).toBe(0);
  });
});
