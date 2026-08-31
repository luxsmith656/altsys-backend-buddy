export type KaliRole = 'hiker' | 'guide' | 'admin' | 'super_admin' | 'ranger' | 'mdrrmo' | 'guest';
export type KaliInsightKind = 'age-review' | 'minor-review' | 'weather' | 'group-guidance' | 'booking-reminder';
export type KaliSeverity = 'info' | 'medium' | 'high';
export type KaliExpression = 'alert' | 'review' | 'map' | 'happy' | 'thinking';

export interface KaliWeatherInput {
  condition: string;
  rainProbability?: number;
  windKmh?: number;
  fetchedAt: string | number | Date;
}

export interface KaliBookingInput {
  status: string;
  date: string;
}

export interface KaliContextInput {
  role: KaliRole;
  now?: string | number | Date;
  savedAge?: number | string | null;
  currentAge?: number | string | null;
  currentAges?: Array<number | string | null>;
  groupSize?: number;
  weather?: KaliWeatherInput | null;
  booking?: KaliBookingInput | null;
}

export interface KaliInsight {
  id: string;
  kind: KaliInsightKind;
  severity: KaliSeverity;
  expression: KaliExpression;
  title: string;
  message: string;
  meta: Record<string, string | number | boolean>;
}

const STALE_FORECAST_MS = 6 * 60 * 60 * 1000;

const roleLabel: Record<KaliRole, string> = {
  hiker: 'hiker',
  guide: 'guide',
  admin: 'location admin',
  super_admin: 'central admin',
  ranger: 'ranger',
  mdrrmo: 'MDRRMO responder',
  guest: 'visitor',
};

export function getKaliRoleLabel(role: KaliRole): string {
  return roleLabel[role];
}

function asNumber(value: number | string | null | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asDate(value: string | number | Date | undefined): Date {
  if (value instanceof Date) return value;
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateKey(value: string | number | Date | undefined): string {
  const date = asDate(value);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

function dateDistance(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

function bookingDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
}

function ageReviewInsight(input: KaliContextInput): KaliInsight | null {
  const savedAge = asNumber(input.savedAge);
  const currentAge = asNumber(input.currentAge);
  if (savedAge === null || currentAge === null || savedAge === currentAge) return null;

  const role = getKaliRoleLabel(input.role);
  return {
    id: 'age-review',
    kind: 'age-review',
    severity: 'high',
    expression: 'review',
    title: 'Verify age before check-in',
    message: input.role === 'hiker'
      ? `The booking age changed from ${savedAge} to ${currentAge}. Please ask an admin to verify the details before check-in.`
      : `${role} should verify the booking age change from ${savedAge} to ${currentAge} before check-in.`,
    meta: { savedAge, currentAge, crossesMinorBoundary: (savedAge <= 17) !== (currentAge <= 17) },
  };
}

function minorInsight(input: KaliContextInput): KaliInsight | null {
  const ages = input.currentAges ?? [input.currentAge];
  const minorCount = ages.reduce<number>((count, age) => {
    const numericAge = asNumber(age);
    return count + (numericAge !== null && numericAge <= 17 ? 1 : 0);
  }, 0);
  if (minorCount === 0) return null;

  return {
    id: 'minor-review',
    kind: 'minor-review',
    severity: 'high',
    expression: 'review',
    title: `${minorCount} minor${minorCount === 1 ? '' : 's'} need a safety check`,
    message: input.role === 'hiker'
      ? `This booking includes ${minorCount} minor${minorCount === 1 ? '' : 's'}. A responsible adult must stay with them, and an admin should verify the details at check-in.`
      : `Please verify the ${minorCount} minor${minorCount === 1 ? '' : 's'} and confirm responsible-adult coverage before the group starts.`,
    meta: { minorCount, responsibleAdultRequired: true },
  };
}

function weatherInsight(input: KaliContextInput): KaliInsight | null {
  const weather = input.weather;
  if (!weather) return null;

  const condition = weather.condition.toLowerCase();
  const rain = Math.max(0, Math.min(100, Number(weather.rainProbability ?? 0)));
  const wind = Math.max(0, Number(weather.windKmh ?? 0));
  const fetchedAt = asDate(weather.fetchedAt);
  const stale = asDate(input.now).getTime() - fetchedAt.getTime() > STALE_FORECAST_MS;
  const severe = /thunder|typhoon|tropical cyclone|hurricane/.test(condition) || rain >= 80 || wind >= 50;
  const caution = severe || /rain|drizzle|shower|storm/.test(condition) || rain >= 40 || wind >= 30;
  const forecastNote = stale ? ' Forecast is stale; check again before departure.' : '';

  return {
    id: 'weather',
    kind: 'weather',
    severity: severe ? 'high' : caution ? 'medium' : 'info',
    expression: severe ? 'alert' : caution ? 'thinking' : 'happy',
    title: severe ? 'Strong weather warning' : caution ? 'Weather caution' : 'Weather window',
    message: severe
      ? `Strong weather risk is expected (${weather.condition}). We strongly recommend rescheduling for safety.${forecastNote}`
      : caution
        ? `${weather.condition} is possible for this hike. Proceed with care, rain gear, and a flexible turnaround plan.${forecastNote}`
        : `${weather.condition} looks favorable for the selected hike window. Continue checking the forecast because mountain weather can change.${forecastNote}`,
    meta: { rainProbability: rain, windKmh: wind, forecastStatus: stale ? 'stale' : 'fresh' },
  };
}

function groupInsight(input: KaliContextInput): KaliInsight | null {
  const groupSize = Math.max(0, Math.round(Number(input.groupSize ?? 0)));
  if (groupSize <= 5) return null;

  const audience = input.role === 'mdrrmo'
    ? 'For emergency response planning, '
    : input.role === 'guide'
      ? 'Your assignment needs '
      : 'Your group needs ';
  return {
    id: 'group-guidance',
    kind: 'group-guidance',
    severity: 'medium',
    expression: 'map',
    title: 'Two-guide safety plan',
    message: `${audience}2 guides for ${groupSize} hikers. You remain one group; the guides cover the front and back for safer headcounts and trail spacing.`,
    meta: { groupSize, guidesRequired: 2 },
  };
}

function bookingInsight(input: KaliContextInput): KaliInsight | null {
  const booking = input.booking;
  if (!booking || !['confirmed', 'approved'].includes(booking.status.toLowerCase())) return null;
  const today = dateKey(input.now);
  const daysUntil = dateDistance(today, booking.date);
  if (daysUntil < 0 || daysUntil > 7) return null;

  return {
    id: 'booking-reminder',
    kind: 'booking-reminder',
    severity: daysUntil <= 1 ? 'medium' : 'info',
    expression: 'happy',
    title: daysUntil === 0 ? 'Your hike is today' : 'Upcoming confirmed hike',
    message: daysUntil === 0
      ? 'Your confirmed booking is today. Review your check-in details and arrive at your selected jump-off.'
      : `Your confirmed booking is on ${bookingDateLabel(booking.date)}. Keep your QR permit ready and review the latest weather before leaving.`,
    meta: { daysUntil, bookingDate: booking.date },
  };
}

export function buildKaliContext(input: KaliContextInput): KaliInsight[] {
  return [
    ageReviewInsight(input),
    minorInsight(input),
    weatherInsight(input),
    groupInsight(input),
    bookingInsight(input),
  ].filter((insight): insight is KaliInsight => insight !== null);
}
