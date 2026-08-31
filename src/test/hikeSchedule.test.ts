import { describe, expect, it } from 'vitest';
import {
  GUIDE_FEE_BY_HIKE_TYPE,
  HIKE_TIME_OPTIONS,
  getGuideFeePerGuide,
  isValidHikeTime,
} from '@/lib/hikeSchedule';

describe('hike schedule rules', () => {
  it('offers the three supported hike windows and marks the recommended times', () => {
    expect(HIKE_TIME_OPTIONS.morning.some((option) => option.time === '06:00 AM' && option.recommended)).toBe(true);
    expect(HIKE_TIME_OPTIONS.morning.some((option) => option.time === '10:00 AM' && option.notSuggested)).toBe(true);
    expect(HIKE_TIME_OPTIONS.night.at(-1)?.time).toBe('05:00 PM');
    expect(HIKE_TIME_OPTIONS.overnight.at(-1)?.time).toBe('04:00 PM');
  });

  it('rejects times outside the selected hike window', () => {
    expect(isValidHikeTime('morning', '08:00 AM')).toBe(true);
    expect(isValidHikeTime('morning', '10:00 AM')).toBe(true);
    expect(isValidHikeTime('morning', '02:00 PM')).toBe(false);
    expect(isValidHikeTime('night', '05:00 PM')).toBe(true);
    expect(isValidHikeTime('overnight', '05:00 PM')).toBe(false);
  });

  it('uses the schedule-specific guide fare while keeping legacy records compatible', () => {
    expect(getGuideFeePerGuide('morning')).toBe(800);
    expect(getGuideFeePerGuide('night')).toBe(1000);
    expect(getGuideFeePerGuide('overnight')).toBe(1600);
    expect(getGuideFeePerGuide('day')).toBe(GUIDE_FEE_BY_HIKE_TYPE.morning);
  });
});
