import type { Tables } from '@/integrations/supabase/types';
import { parseMeta } from '@/lib/bookingMeta';
import { calculateFees, getRecordedRevenue } from '@/lib/payments';
import { bookingReceipt } from '@/lib/bookingReceipt';

type OverviewBooking = Pick<Tables<'bookings'>, 'id' | 'booking_date' | 'status' | 'group_size' | 'notes'>;
type OverviewSession = Pick<Tables<'hiker_sessions'>, 'id' | 'booking_id' | 'participant_role' | 'status' | 'start_time' | 'end_time'>;

export function summarizeAdminOverview(bookings: OverviewBooking[], sessions: OverviewSession[], today: string) {
  const todayBookings = bookings.filter((b) => b.booking_date === today);
  const ages = new Map<string, number>();
  const origins = new Map<string, number>();
  let expectedRevenue = 0;
  let todayRevenue = 0;
  for (const booking of todayBookings) {
    if (['cancelled', 'declined'].includes(booking.status)) continue;
    const meta = parseMeta(booking.notes);
    expectedRevenue += bookingReceipt(booking).total;
    todayRevenue += getRecordedRevenue(meta);
    if (!['confirmed', 'active', 'approved', 'completed'].includes(booking.status)) continue;
    for (const person of [{ age: meta.age, city: meta.city }, ...(meta.companionDetails || [])]) {
      const age = Number(person.age);
      const band = !person.age || !Number.isFinite(age) || age < 0 ? 'Unknown' : age < 18 ? 'Under 18' : age < 25 ? '18-24' : age < 35 ? '25-34' : age < 45 ? '35-44' : age < 55 ? '45-54' : '55+';
      ages.set(band, (ages.get(band) || 0) + 1);
      const origin = person.city || 'Unknown';
      origins.set(origin, (origins.get(origin) || 0) + 1);
    }
  }
  const activeGroups = new Map<string, { id: string; name: string; groupSize: number; startTime: string }>();
  for (const session of sessions) {
    if (session.status !== 'active' || session.end_time || session.participant_role === 'guide' || !session.booking_id) continue;
    const booking = bookings.find((b) => b.id === session.booking_id);
    if (!booking || ['completed', 'cancelled', 'declined'].includes(booking.status)) continue;
    activeGroups.set(booking.id, { id: booking.id, name: parseMeta(booking.notes).fullName || 'Hiking group', groupSize: booking.group_size, startTime: session.start_time });
  }
  return {
    totalBookings: todayBookings.filter((b) => !['cancelled', 'declined'].includes(b.status)).length,
    activeHikers: [...activeGroups.values()].reduce((sum, group) => sum + group.groupSize, 0),
    todayRevenue,
    collectionRate: expectedRevenue > 0 ? Math.min(100, Math.round(todayRevenue / expectedRevenue * 100)) : 0,
    ageData: [...ages].map(([name, value]) => ({ name, value })),
    originData: [...origins].map(([name, value]) => ({ name, value })),
    recentLogs: [...activeGroups.values()].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 5),
  };
}
