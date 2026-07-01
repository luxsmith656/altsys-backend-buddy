import { describe, expect, it } from 'vitest';
import {
  buildRecordingQuality,
  compareCleanedTracks,
  MotionGpsFilter,
  postProcessTrack,
  reviewRecordingQuality,
  type GpsTrackPoint,
} from '@/lib/tracking/gpsFilter';
import { haversineM } from '@/lib/tracking/geo';

function offsetPoint(lat: number, lng: number, northM: number, eastM: number) {
  const earthM = 6371000;
  return {
    lat: lat + (northM / earthM) * 180 / Math.PI,
    lng: lng + (eastM / (earthM * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI,
  };
}

describe('MotionGpsFilter', () => {
  it('smooths walking jitter and rejects large GPS spikes', () => {
    const filter = new MotionGpsFilter({ minAccuracyForStartM: 50, maxAccuracyM: 85, minAppendDistanceM: 1.5 });
    const origin = { lat: 14.1766, lng: 121.2193 };
    const accepted: GpsTrackPoint[] = [];

    for (let i = 0; i <= 18; i++) {
      const jitterEast = i % 2 === 0 ? 3.5 : -3.5;
      const base = offsetPoint(origin.lat, origin.lng, i * 3, jitterEast);
      const raw = i === 9 ? offsetPoint(origin.lat, origin.lng, i * 3, 140) : base;
      const result = filter.filter({
        lat: raw.lat,
        lng: raw.lng,
        ts: 1_000_000 + i * 3000,
        accuracy: i === 9 ? 28 : 10,
        speed: 1,
        heading: 0,
      }, { moving: true, heading: 0, consecutivePredicted: 0 });
      if (result.appended && result.point) accepted.push(result.point);
    }

    const cleaned = postProcessTrack(accepted, 1.2);
    const maxSegment = cleaned.slice(1).reduce((max, point, index) => {
      return Math.max(max, haversineM(cleaned[index], point));
    }, 0);
    const totalDistance = cleaned.slice(1).reduce((sum, point, index) => {
      return sum + haversineM(cleaned[index], point);
    }, 0);

    expect(cleaned.length).toBeGreaterThan(5);
    expect(maxSegment).toBeLessThan(18);
    expect(totalDistance).toBeGreaterThan(35);
    expect(totalDistance).toBeLessThan(80);
  });

  it('summarizes raw and cleaned recording quality separately', () => {
    const raw: GpsTrackPoint[] = [
      { lat: 14.1766, lng: 121.2193, ts: 1_000, accuracy: 8, source: 'gps' },
      { lat: 14.17661, lng: 121.21931, ts: 2_000, accuracy: 60, source: 'gps' },
      { lat: 14.17662, lng: 121.21932, ts: 3_000, accuracy: 10, source: 'gps' },
    ];
    const clean: GpsTrackPoint[] = [
      { ...raw[0], quality: 'high' },
      { ...raw[2], quality: 'high' },
      { lat: 14.17663, lng: 121.21933, ts: 4_000, accuracy: 35, inferred: true, source: 'estimated' },
    ];

    const summary = buildRecordingQuality(raw, clean);

    expect(summary.rawPointCount).toBe(3);
    expect(summary.cleanedPointCount).toBe(3);
    expect(summary.estimatedPointCount).toBe(1);
    expect(summary.rejectedPointCount).toBe(1);
    expect(summary.averageAccuracyM).toBe(26);
    expect(summary.filterVersion).toBe('motion-kalman-v2');
  });

  it('flags poor recordings for review instead of approval', () => {
    const review = reviewRecordingQuality({
      rawPointCount: 20,
      cleanedPointCount: 8,
      rejectedPointCount: 10,
      estimatedPointCount: 4,
      lowQualityPointCount: 4,
      averageAccuracyM: 48,
      distanceM: 20,
    });

    expect(review.level).toBe('poor');
    expect(review.score).toBeLessThan(60);
    expect(review.reasons.join(' ')).toContain('Average GPS accuracy');
  });

  it('compares repeated recordings for route consistency', () => {
    const first = Array.from({ length: 12 }, (_, i) => {
      const p = offsetPoint(14.1766, 121.2193, i * 5, 0);
      return { ...p, ts: 1_000 + i * 1000, accuracy: 8 };
    });
    const aligned = Array.from({ length: 12 }, (_, i) => {
      const p = offsetPoint(14.1766, 121.2193, i * 5, 2);
      return { ...p, ts: 2_000 + i * 1000, accuracy: 8 };
    });
    const different = Array.from({ length: 12 }, (_, i) => {
      const p = offsetPoint(14.1766, 121.2193, i * 5, 80);
      return { ...p, ts: 3_000 + i * 1000, accuracy: 8 };
    });

    expect(compareCleanedTracks(aligned, first).consistency).toBe('aligned');
    expect(compareCleanedTracks(different, first).consistency).toBe('different');
  });
});
