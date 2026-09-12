import { parseMeta } from './booking-meta.ts';
import { calculateFees, getRecordedRevenue, PEAK_EXTENSION_FEE_PER_HOUR, HORSE_EMERGENCY_SERVICE_FEE } from './payments.ts';

export interface ReceiptBooking {
  id?: string;
  status?: string;
  notes?: string | null;
  group_size?: number;
  booking_date?: string;
  total_amount?: number | null;
}
const money = (value: unknown, fallback = 0): number => value != null && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : fallback;

export function canChangeBooking(booking: ReceiptBooking, sessions: { status?: string; end_time?: string | null }[] = []) {
  const meta = parseMeta(booking.notes);
  return ['pending', 'confirmed', 'adjustment_pending'].includes(booking.status ?? '')
    && !meta.hikeCompletedAt && !meta.groupPhase && !meta.onsiteStartConfirmed && !meta.onsiteStartTime
    && !sessions.some(session => session.status === 'active' || session.status === 'completed' || Boolean(session.end_time));
}

export function bookingReceipt(booking: ReceiptBooking) {
  const meta = parseMeta(booking.notes);
  const calculated = calculateFees(booking.group_size ?? meta.actualGroupSize ?? 1, { hikeType: meta.hikeType });
  const history = meta.priceAdjustments ?? [];
  const last = history.at(-1)?.breakdown;
  const baseLines = [
    { label: 'Registration', amount: money(meta.entryFee, calculated.entryFee) },
    { label: 'Environmental fee', amount: money(meta.envFee, calculated.envFee) },
    { label: 'Guide fee', amount: money(meta.guideFee, calculated.guideFee) },
  ];
  // Legacy price edits included peak/horse charges in totalFee. Their breakdown
  // identifies the base, so checkout must not add those charges a second time.
  const legacyBase = last ? money(last.entryFee) + money(last.envFee) + money(last.guideFee) + money(last.customAdjustment)
    : meta.isWalkIn ? baseLines.reduce((sum, line) => sum + line.amount, 0)
    : money(meta.totalFee, money(booking.total_amount, calculated.total));
  const base = money(meta.baseFee, legacyBase);
  const adjustment = money(base - baseLines.reduce((sum, line) => sum + line.amount, 0));
  if (adjustment) baseLines.push({ label: 'Booking adjustment', amount: adjustment });
  const extras = [
    { label: 'Peak extension', amount: money(meta.peakExtensionFee, Math.max(0, meta.peakExtensionHours ?? 0) * PEAK_EXTENSION_FEE_PER_HOUR) },
    { label: 'Emergency horse', amount: money(meta.emergencyHorseFee, Math.max(0, meta.emergencyHorseCount ?? 0) * HORSE_EMERGENCY_SERVICE_FEE) },
    ...(meta.horseHelpRequests ?? []).filter(item => item.status !== 'cancelled').map(item => ({ label: `Horse help - ${item.stationLabel || item.station}`, amount: money(item.fee) })),
    ...(meta.additionalExpenses ?? []).map(item => ({ label: item.label, amount: money(item.amount) })),
  ].filter(item => item.amount > 0);
  const total = Math.max(0, money(base + extras.reduce((sum, item) => sum + item.amount, 0)));
  const paid = getRecordedRevenue(meta);
  const originalTotal = meta.originalQuote ? money(meta.originalQuote.total)
    : history[0]?.previousAmount > 0 ? money(history[0].previousAmount) : null;
  return { base, baseLines, extras, total, paid, balance: Math.max(0, money(total - paid)), originalTotal, history };
}
