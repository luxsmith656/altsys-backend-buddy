import { describe, expect, it } from 'vitest';
import { getLocationAgeLabel } from '@/lib/tracking/locationAge';

describe('offline location age labels', () => {
  it('marks recent fixes as live', () => {
    expect(getLocationAgeLabel(2)).toBe('LIVE');
  });

  it('uses the requested 5, 10, 25 and 50 minute buckets', () => {
    expect(getLocationAgeLabel(5)).toBe('Last seen 5 min ago');
    expect(getLocationAgeLabel(10)).toBe('Last seen 10 min ago');
    expect(getLocationAgeLabel(25)).toBe('Last seen 25 min ago');
    expect(getLocationAgeLabel(50)).toBe('Last seen 50+ min ago');
  });
});
