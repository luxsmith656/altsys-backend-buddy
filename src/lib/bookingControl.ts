export type CapacityMode = 'shared' | 'per_trailhead';
export type ScheduleMode = 'interval' | 'custom';
export type ScheduleKind = 'morning' | 'night' | 'overnight';

export const SCHEDULE_KINDS: ScheduleKind[] = ['morning', 'night', 'overnight'];

export const DEFAULT_WINDOWS: Record<ScheduleKind, { start: string; end: string }> = {
  morning: { start: '02:00 AM', end: '10:00 AM' },
  night: { start: '02:00 PM', end: '04:00 PM' },
  overnight: { start: '02:00 PM', end: '04:00 PM' },
};

export const DEFAULT_SLOTS: Record<ScheduleKind, string[]> = {
  morning: ['02:00 AM', '03:00 AM', '04:00 AM', '05:00 AM', '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM'],
  night: ['02:00 PM', '03:00 PM', '04:00 PM'],
  overnight: ['02:00 PM', '03:00 PM', '04:00 PM'],
};

export interface BookingScheduleDraft {
  mode: ScheduleMode;
  intervalMinutes: number;
  windows: Record<ScheduleKind, { start: string; end: string }>;
  slots: Record<ScheduleKind, string[]>;
}

export interface CapacityControlDraft {
  mode: CapacityMode;
  sharedMaxGroups: number;
  maxPeoplePerGroup: number;
  maxPeoplePerSlot: number | null;
  holdPending: boolean;
  perTrailhead: Array<{ locationId: string; maxGroups: number }>;
  schedule: BookingScheduleDraft;
  scheduleOverrides: Array<{ locationId: string; schedule: BookingScheduleDraft }>;
}

export function parseTimeMinutes(value: string): number | null {
  const match = value.trim().toUpperCase().match(/^(0?[1-9]|1[0-2]):([0-5][0-9])\s*(AM|PM)$/);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
}

export function formatTimeMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  return `${String(hour12).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')} ${suffix}`;
}

export function generateScheduleSlots(
  windows: Record<ScheduleKind, { start: string; end: string }>,
  intervalMinutes: number,
): Record<ScheduleKind, string[]> {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 180) {
    throw new Error('Schedule interval must be between 15 and 180 minutes.');
  }
  return Object.fromEntries(SCHEDULE_KINDS.map((kind) => {
    const start = parseTimeMinutes(windows[kind].start);
    const end = parseTimeMinutes(windows[kind].end);
    if (start === null || end === null || end < start) {
      throw new Error(`Enter a valid ${kind} schedule window.`);
    }
    const slots: string[] = [];
    for (let cursor = start; cursor <= end; cursor += intervalMinutes) slots.push(formatTimeMinutes(cursor));
    return [kind, slots];
  })) as Record<ScheduleKind, string[]>;
}

export function normalizeScheduleDraft(schedule?: Partial<BookingScheduleDraft> | null): BookingScheduleDraft {
  const mode = schedule?.mode === 'custom' ? 'custom' : 'interval';
  const intervalMinutes = Number.isInteger(schedule?.intervalMinutes) ? Number(schedule?.intervalMinutes) : 60;
  const windows = SCHEDULE_KINDS.reduce((result, kind) => {
    result[kind] = { ...DEFAULT_WINDOWS[kind], ...(schedule?.windows?.[kind] ?? {}) };
    return result;
  }, {} as Record<ScheduleKind, { start: string; end: string }>);
  const slots = SCHEDULE_KINDS.reduce((result, kind) => {
    result[kind] = Array.isArray(schedule?.slots?.[kind]) && schedule!.slots![kind]!.length
      ? schedule!.slots![kind]!.map(String)
      : DEFAULT_SLOTS[kind];
    return result;
  }, {} as Record<ScheduleKind, string[]>);
  return { mode, intervalMinutes, windows, slots };
}

export function defaultCapacityControl(locationIds: string[] = []): CapacityControlDraft {
  return {
    mode: 'shared',
    sharedMaxGroups: 3,
    maxPeoplePerGroup: 5,
    maxPeoplePerSlot: null,
    holdPending: false,
    perTrailhead: locationIds.map((locationId) => ({ locationId, maxGroups: 3 })),
    schedule: normalizeScheduleDraft(),
    scheduleOverrides: [],
  };
}

export function draftFromServer(payload: any, locationIds: string[]): CapacityControlDraft {
  const capacity = payload?.capacity ?? {};
  const schedule = normalizeScheduleDraft(payload?.schedule);
  return {
    mode: capacity.mode === 'per_trailhead' ? 'per_trailhead' : 'shared',
    sharedMaxGroups: Number(capacity.sharedMaxGroups) || 3,
    maxPeoplePerGroup: Number(capacity.maxPeoplePerGroup) || 30,
    maxPeoplePerSlot: capacity.maxPeoplePerSlot == null ? null : Number(capacity.maxPeoplePerSlot),
    holdPending: Boolean(capacity.holdPending),
    perTrailhead: locationIds.map((locationId) => ({
      locationId,
      maxGroups: Number(capacity.perTrailhead?.find((row: any) => row.locationId === locationId)?.maxGroups) || 3,
    })),
    schedule,
    scheduleOverrides: (payload?.scheduleOverrides ?? []).map((row: any) => ({
      locationId: String(row.locationId),
      schedule: normalizeScheduleDraft(row.schedule),
    })),
  };
}

export function toCapacityControlPayload(draft: CapacityControlDraft) {
  return {
    capacity: {
      mode: draft.mode,
      sharedMaxGroups: draft.sharedMaxGroups,
      maxPeoplePerGroup: draft.maxPeoplePerGroup,
      maxPeoplePerSlot: draft.maxPeoplePerSlot,
      holdPending: draft.holdPending,
      perTrailhead: draft.perTrailhead,
    },
    schedule: draft.schedule,
    scheduleOverrides: draft.scheduleOverrides,
  };
}
