export type KaliRole = 'hiker' | 'guide' | 'admin' | 'super_admin' | 'ranger' | 'mdrrmo' | 'guest';
export type KaliInsightKind = 'age-review' | 'minor-review' | 'weather' | 'group-guidance' | 'booking-reminder' | 'hike-type';
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

export interface KaliParticipantInput {
  name?: string | null;
  age?: number | string | null;
}

export interface KaliContextInput {
  role: KaliRole;
  now?: string | number | Date;
  savedAge?: number | string | null;
  currentAge?: number | string | null;
  currentAges?: Array<number | string | null>;
  savedParticipants?: KaliParticipantInput[];
  currentParticipants?: KaliParticipantInput[];
  groupSize?: number;
  weather?: KaliWeatherInput | null;
  booking?: KaliBookingInput | null;
  selectedDate?: string;
  selectedStartTime?: string;
  recommendedStartTime?: string;
  hikeType?: 'morning' | 'night' | 'overnight' | 'day' | string;
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

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function ageReviewInsight({
  role,
  savedAge: rawSavedAge,
  currentAge: rawCurrentAge,
  participantName,
  id = 'age-review',
}: {
  role: KaliRole;
  savedAge?: number | string | null;
  currentAge?: number | string | null;
  participantName?: string | null;
  id?: string;
}): KaliInsight | null {
  const savedAge = asNumber(rawSavedAge);
  const currentAge = asNumber(rawCurrentAge);
  if (savedAge === null || currentAge === null || savedAge === currentAge) return null;

  const roleLabel = getKaliRoleLabel(role);
  const subject = participantName?.trim() ? `${participantName.trim()}'s` : 'the booking';
  return {
    id,
    kind: 'age-review',
    severity: 'high',
    expression: 'review',
    title: 'Verify age before check-in',
    message: role === 'hiker'
      ? `${subject} age changed from ${savedAge} to ${currentAge}. Please ask an admin to verify the details before check-in.`
      : `${roleLabel} should verify ${subject} age change from ${savedAge} to ${currentAge} before check-in.`,
    meta: { savedAge, currentAge, crossesMinorBoundary: (savedAge <= 17) !== (currentAge <= 17), participantName: participantName ?? '' },
  };
}

function ageReviewInsights(input: KaliContextInput): KaliInsight[] {
  const currentParticipants = input.currentParticipants ?? [];
  const savedParticipants = input.savedParticipants ?? [];
  const mainParticipant = currentParticipants[0];
  const matchingMain = mainParticipant?.name
    ? savedParticipants.find((participant) => normalizeName(participant.name) === normalizeName(mainParticipant.name))
    : undefined;
  const insights: KaliInsight[] = [];
  const mainInsight = ageReviewInsight({
    role: input.role,
    savedAge: matchingMain?.age ?? input.savedAge,
    currentAge: mainParticipant?.age ?? input.currentAge,
    participantName: mainParticipant?.name,
  });
  if (mainInsight) insights.push(mainInsight);

  currentParticipants.slice(1).forEach((participant, index) => {
    if (!participant.name) return;
    const previous = savedParticipants.find((saved) => normalizeName(saved.name) === normalizeName(participant.name));
    const insight = ageReviewInsight({
      role: input.role,
      savedAge: previous?.age,
      currentAge: participant.age,
      participantName: participant.name,
      id: `age-review-${index + 1}`,
    });
    if (insight) insights.push(insight);
  });
  return insights;
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
      ? `This booking includes ${minorCount} minor${minorCount === 1 ? '' : 's'}. A responsible adult must stay with them, and an admin should verify the details at check-in. Tap “View required documents” for the full checklist.`
      : `Please verify the ${minorCount} minor${minorCount === 1 ? '' : 's'} and confirm responsible-adult coverage before the group starts. Tap “View required documents” for the full checklist.`,
    meta: { minorCount, responsibleAdultRequired: true, targetId: 'minor-requirements' },
  };
}

function hikeTypeInsight(input: KaliContextInput): KaliInsight | null {
  if (input.hikeType !== 'night' && input.hikeType !== 'overnight') return null;
  const overnight = input.hikeType === 'overnight';
  return {
    id: 'hike-type-guidance',
    kind: 'hike-type',
    severity: 'info',
    expression: overnight ? 'thinking' : 'map',
    title: overnight ? 'Overnight hike plan' : 'Night hike plan',
    message: overnight
      ? 'Overnight hikes start between 2:00 PM and 4:00 PM and include an overnight stay. Bring your own tent because tents are not provided and there is no lodging at the peak. Pack extra food, lighting, warm layers, and rest gear.'
      : 'Night hikes start between 2:00 PM and 5:00 PM and continue into the evening, but the group still needs to descend the same day. Bring a headlamp, spare batteries, and visibility layers; choose this for prepared reduced-light travel.',
    meta: { hikeType: input.hikeType, scheduleStart: '02:00 PM', scheduleEnd: overnight ? '04:00 PM' : '05:00 PM' },
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
  const currentAge = asNumber(input.currentAge);
  const timeNote = input.recommendedStartTime && input.selectedStartTime && input.selectedStartTime !== input.recommendedStartTime
    ? ` For a beginner-friendly, gentler start${currentAge !== null && currentAge >= 35 ? ' for hikers in their mid-30s and above' : ''}, consider ${input.recommendedStartTime}.`
    : input.recommendedStartTime && currentAge !== null && currentAge >= 35
      ? ` For a more comfortable pace, ${input.recommendedStartTime} is the better start time for hikers in their mid-30s and above.`
      : input.recommendedStartTime
        ? ` ${input.recommendedStartTime} is a good beginner-friendly start time for this hike.`
      : '';
  const dateNote = input.selectedDate ? ` for ${bookingDateLabel(input.selectedDate)}` : '';

  return {
    id: 'weather',
    kind: 'weather',
    severity: severe ? 'high' : caution ? 'medium' : 'info',
    expression: severe ? 'alert' : caution ? 'thinking' : 'happy',
    title: severe ? 'Strong weather warning' : caution ? 'Weather caution' : 'Weather window',
    message: severe
        ? `Strong weather risk is expected${dateNote} (${weather.condition}). We strongly recommend rescheduling for safety.${forecastNote}${timeNote}`
      : caution
        ? `${weather.condition} is possible${dateNote} for this hike. Proceed with care, rain gear, and a flexible turnaround plan.${forecastNote}${timeNote}`
        : `${weather.condition} looks favorable${dateNote} for the selected hike window. Continue checking the forecast because mountain weather can change.${timeNote}`,
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
    ...ageReviewInsights(input),
    minorInsight(input),
    weatherInsight(input),
    groupInsight(input),
    hikeTypeInsight(input),
    bookingInsight(input),
  ].filter((insight): insight is KaliInsight => insight !== null);
}
