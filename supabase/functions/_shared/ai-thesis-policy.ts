/** Shared, deterministic assistant policy. No database access or prompt-specific cases belong here. */
export const FINANCE_REFUSAL = 'I can’t provide that: financial analytics are restricted to administrative personnel.';
export const READ_ONLY_REFUSAL = 'I’m an informational assistant and cannot delete, edit, update, cancel, or modify database records. Please use the appropriate Booking Operations or management screen.';
export const GUIDE_PII_REFUSAL = 'I can share the operational details for hikers assigned to your booking, but not unrelated people or home addresses.';

const WEATHER_RE = /\b(weather|forecast|rain|rainfall|storm|thunder|wind|temperature|humid|climate|ulan|bagyo|maulan|hangin|init|lamig)\b/i;
const RESERVATION_RE = /\b(book|booking|reserve|reservation|hike|trek|schedule|slot|date|group|pax|hikers|guide|bukas|mag[- ]?book|reserba|iskedyul)\b/i;
const MUTATION_RE = /\b(delete|remove|erase|drop|edit|update|change|modify|alter|cancel|void|reject|approve|accept|insert|write|sql|database|record)\b/i;
const PII_RE = /\b(address|home|residential|where do they live|where does .* live|tirahan)\b/i;

export function validAssistantQuery(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length >= 3 && input.trim().length <= 4000;
}

export function classifyAssistantIntent(input: unknown): 'weather' | 'reservation' | 'other' {
  if (!validAssistantQuery(input)) return 'other';
  if (WEATHER_RE.test(input)) return 'weather';
  if (RESERVATION_RE.test(input)) return 'reservation';
  return 'other';
}

export function isMutationRequest(input: unknown): boolean { return typeof input === 'string' && MUTATION_RE.test(input); }
export function isGuidePiiRequest(input: unknown): boolean { return typeof input === 'string' && PII_RE.test(input); }
export function isOwnPaymentQuestion(input: unknown): boolean {
  return typeof input === 'string' && /\b(my|mine|own|i paid|my booking|my receipt)\b/i.test(input);
}

export function missingReservationFields(input: { date?: unknown; startTime?: unknown; groupSize?: unknown; hikeType?: unknown }): string[] {
  const missing: string[] = [];
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) missing.push('date');
  if (typeof input.startTime !== 'string' || !/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(input.startTime.trim())) missing.push('start time');
  const size = Number(input.groupSize);
  if (!Number.isInteger(size) || size < 1) missing.push('group size');
  if (!['morning', 'night', 'overnight', 'day'].includes(String(input.hikeType ?? ''))) missing.push('hike type');
  return missing;
}

/** Booking dates are interpreted in Manila time and must be at least tomorrow. */
export function isDateAtLeastTomorrow(date: unknown, todayManila: string): boolean {
  return typeof date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && /^\d{4}-\d{2}-\d{2}$/.test(todayManila)
    && date > todayManila;
}

export function projectGuideBooking(booking: Record<string, unknown>, profile?: Record<string, unknown> | null) {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(booking.notes ?? '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed;
  } catch { /* malformed legacy notes are omitted */ }
  return {
    booking_id: booking.id,
    user_id: booking.user_id,
    location_id: booking.location_id,
    booking_date: booking.booking_date,
    start_time: meta.hikeTime ?? meta.startTime ?? null,
    group_size: booking.group_size,
    status: booking.status,
    created_at: booking.created_at,
    lead_hiker_name: profile?.full_name ?? meta.fullName ?? 'Not recorded',
    lead_hiker_phone: profile?.phone ?? booking.contact_phone ?? meta.phoneNumber ?? null,
    lead_hiker_email: profile?.email ?? booking.contact_email ?? null,
    emergency_contact: meta.emergencyContactName ?? booking.emergency_contact_name ?? null,
    emergency_phone: meta.emergencyContactPhone ?? booking.emergency_contact_phone ?? null,
    safety_notes: meta.medicalNotes ?? meta.safetyNotes ?? null,
  };
}

export function parseWeatherResponse(input: unknown) {
  if (!input || typeof input !== 'object') return { valid: false, condition: 'unavailable', temperatureC: null, rainProbability: null };
  const row = input as Record<string, unknown>;
  const condition = typeof row.condition === 'string' && row.condition.trim() ? row.condition.trim() : 'unavailable';
  const temperatureC = Number.isFinite(Number(row.temperatureC)) ? Number(row.temperatureC) : null;
  const rainProbability = Number.isFinite(Number(row.rainProbability)) ? Number(row.rainProbability) : null;
  return { valid: condition !== 'unavailable' || temperatureC !== null || rainProbability !== null, condition, temperatureC, rainProbability };
}

export function unavailableFallback(subject: string) {
  return `I can’t verify current ${subject} because the live source is unavailable. I won’t guess; please check the relevant screen when the service is available.`;
}

