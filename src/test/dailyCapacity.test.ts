import { describe, expect, it } from 'vitest';
import { validateCapacityAgainstReservations, validateCapacitySplit } from '@/lib/dailyCapacity';

describe('daily trailhead carrying capacity validation', () => {
  it('accepts the configured day/night split when it stays within the total', () => {
    expect(validateCapacitySplit(100, 65, 35)).toBeNull();
  });

  it('rejects a split larger than the total', () => {
    expect(validateCapacitySplit(100, 70, 35)).toContain('cannot add up to more');
  });

  it('rejects fractional, negative, and zero total values', () => {
    expect(validateCapacitySplit(0, 0, 0)).toContain('at least 1');
    expect(validateCapacitySplit(100, -1, 10)).toContain('whole numbers');
    expect(validateCapacitySplit(100, 40.5, 10)).toContain('whole numbers');
  });

  it('prevents lowering daily, day, or night limits below booked hikers', () => {
    expect(validateCapacityAgainstReservations(20, 12, 8, 18, 11, 7)).toBeNull();
    expect(validateCapacityAgainstReservations(17, 10, 7, 18, 11, 7)).toContain('already booked');
    expect(validateCapacityAgainstReservations(20, 10, 8, 18, 11, 7)).toContain('day hikers');
    expect(validateCapacityAgainstReservations(20, 12, 6, 18, 11, 7)).toContain('night hikers');
  });
});
