import { describe, expect, it } from 'vitest';
import { MotionGpsFilter } from '@/lib/tracking/gpsFilter';
import { getLocationAgeLabel } from '@/lib/tracking/locationAge';
import { splitTrackAtGaps } from '@/lib/tracking/geo';

describe('GPS system-test cases', () => {
  it('accepts valid hiker and guide fixes', () => {
    for (const role of ['hiker', 'guide']) {
      const filter = new MotionGpsFilter();
      expect(filter.filter({ lat: 14.1766, lng: 121.2193, accuracy: 8, ts: 1000 }).appended, role).toBe(true);
    }
  });
  it('keeps a reconnect gap as a separate measured segment', () => {
    expect(splitTrackAtGaps([{ lat: 14.1, lng: 121.2, ts: 1000 }, { lat: 14.101, lng: 121.201, ts: 301001 }])).toHaveLength(2);
  });
  it('does not turn a poor fix into movement while offline', () => {
    const filter = new MotionGpsFilter();
    filter.filter({ lat: 14.1, lng: 121.2, accuracy: 8, ts: 1000 });
    expect(filter.filter({ lat: 14.2, lng: 121.3, accuracy: 300, ts: 2000 }).appended).toBe(false);
  });
  it('labels recent and stale locations for admin monitoring', () => {
    expect(getLocationAgeLabel(2)).toBe('LIVE');
    expect(getLocationAgeLabel(60)).toBe('Last seen 50+ min ago');
  });
});
