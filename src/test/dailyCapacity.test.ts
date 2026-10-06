import { describe, expect, it } from 'vitest';
import { validateCapacitySplit } from '@/lib/dailyCapacity';

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
});
