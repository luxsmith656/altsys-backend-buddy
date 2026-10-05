import { parseMeta } from '@/lib/bookingMeta';

export interface AnalyticsBooking {
  id: string;
  location_id: string | null;
  status: string;
  group_size: number;
  notes: string | null;
}

function measuredMinutes(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed / 60_000 : null;
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    average: n ? values.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
  };
}

export function summarizeHikeAnalytics(bookings: AnalyticsBooking[]) {
  let local = 0;
  let foreign = 0;
  let unknown = 0;
  const sizes: number[] = [];
  const ascent: number[] = [];
  const summit: number[] = [];
  const descent: number[] = [];
  for (const booking of bookings) {
    if (!['confirmed', 'approved', 'active', 'completed'].includes(booking.status)) continue;
    const meta = parseMeta(booking.notes);
    const size = Math.max(0, Math.floor(Number(meta.checkinHeadcount ?? booking.group_size) || 0));
    if (!size) continue;
    sizes.push(size);
    const people = [{ nationality: meta.nationality }, ...(Array.isArray(meta.companionDetails) ? meta.companionDetails : [])].slice(0, size);
    for (const person of people) {
      const nationality = String(person.nationality || '').trim().toLowerCase();
      if (!nationality || ['unknown', 'n/a', 'other', 'unspecified'].includes(nationality)) unknown++;
      else if (['filipino', 'filipina', 'philippines', 'philippine', 'ph', 'phl', 'local'].includes(nationality)) local++;
      else foreign++;
    }
    unknown += Math.max(0, size - people.length);
    const phases = [
      [ascent, measuredMinutes(meta.onsiteStartTime, meta.peakReachedAt)],
      [summit, measuredMinutes(meta.peakReachedAt, meta.descentStartedAt)],
      [descent, measuredMinutes(meta.descentStartedAt, meta.hikeCompletedAt)],
    ] as const;
    for (const [samples, minutes] of phases) if (minutes !== null) samples.push(minutes);
  }
  return { local, foreign, unknown, groupSize: distribution(sizes), ascent: distribution(ascent), summit: distribution(summit), descent: distribution(descent) };
}
