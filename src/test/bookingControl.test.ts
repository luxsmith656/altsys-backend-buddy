import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOWS,
  defaultCapacityControl,
  draftFromServer,
  formatTimeMinutes,
  generateScheduleSlots,
  parseTimeMinutes,
  toCapacityControlPayload,
} from '@/lib/bookingControl';

describe('booking capacity and schedule control', () => {
  it('generates one-hour published slots from the configured windows', () => {
    const slots = generateScheduleSlots(DEFAULT_WINDOWS, 60);
    expect(slots.morning).toEqual(['02:00 AM', '03:00 AM', '04:00 AM', '05:00 AM', '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM']);
    expect(slots.night).toEqual(['02:00 PM', '03:00 PM', '04:00 PM']);
  });

  it('rejects invalid windows and intervals before publishing', () => {
    expect(() => generateScheduleSlots({ ...DEFAULT_WINDOWS, morning: { start: '10:00 AM', end: '02:00 AM' } }, 60)).toThrow(/morning/);
    expect(() => generateScheduleSlots(DEFAULT_WINDOWS, 10)).toThrow(/15 and 180/);
    expect(parseTimeMinutes('06:30 PM')).toBe(1110);
    expect(formatTimeMinutes(1110)).toBe('06:30 PM');
  });

  it('round-trips server settings and keeps trailhead overrides explicit', () => {
    const draft = defaultCapacityControl(['lamot-1', 'lamot-2']);
    const payload = toCapacityControlPayload({ ...draft, mode: 'per_trailhead', maxPeoplePerSlot: 45 });
    const restored = draftFromServer({ capacity: payload.capacity, schedule: payload.schedule }, ['lamot-1', 'lamot-2']);
    expect(restored.mode).toBe('per_trailhead');
    expect(restored.maxPeoplePerSlot).toBe(45);
    expect(restored.perTrailhead).toHaveLength(2);
    expect(restored.schedule.slots.morning).toContain('06:00 AM');
  });
});
