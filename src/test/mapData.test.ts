import { describe, expect, it } from 'vitest';
import { buildRouteStations } from '@/lib/map-data';

describe('buildRouteStations', () => {
  it('creates jump-off, five progress stations, and peak', () => {
    const path: [number, number][] = [
      [14.1, 121.3],
      [14.154, 121.3],
    ];

    const stations = buildRouteStations(path);

    expect(stations).toHaveLength(7);
    expect(stations[0].kind).toBe('jump_off');
    expect(stations.slice(1, 6).map((station) => station.kind)).toEqual([
      'station',
      'station',
      'station',
      'station',
      'station',
    ]);
    expect(stations[6].kind).toBe('peak');
    expect(stations[0].lat).toBe(path[0][0]);
    expect(stations[6].lat).toBe(path[1][0]);
    expect(stations[1].distanceKm).toBeCloseTo(1, 4);
    expect(stations[5].distanceKm).toBeCloseTo(5, 4);
  });

  it('distributes five stations across routes shorter than five kilometers', () => {
    const stations = buildRouteStations([
      [14.1, 121.3],
      [14.11, 121.3],
    ]);

    expect(stations).toHaveLength(7);
    for (let index = 1; index < stations.length; index++) {
      expect(stations[index].distanceKm).toBeGreaterThan(stations[index - 1].distanceKm);
    }
  });
});
