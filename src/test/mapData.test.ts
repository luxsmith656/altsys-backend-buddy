import { describe, expect, it } from 'vitest';
import { buildRouteStations, MT_KALISUNGAN_PEAK, normalizeOfficialRoutePath, TRAILHEAD_COORDINATES, TRAILS } from '@/lib/map-data';

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

  it('uses the registered jump-offs and one shared peak for legacy route rows', () => {
    const legacy = normalizeOfficialRoutePath([
      [14.1475, 121.3390],
      [14.1482, 121.3445],
      [14.1501, 121.3474],
    ], 'lamot-1');

    expect(legacy[0]).toEqual(TRAILHEAD_COORDINATES['lamot-1']);
    expect(legacy[legacy.length - 1]).toEqual(MT_KALISUNGAN_PEAK);
  });

  it('preserves a published route shape when its anchors are already current', () => {
    const current: [number, number][] = [
      TRAILHEAD_COORDINATES['sto-tomas'] as [number, number],
      [14.1601, 121.3455],
      MT_KALISUNGAN_PEAK as [number, number],
    ];

    expect(normalizeOfficialRoutePath(current, 'sto-tomas')).toEqual(current);
  });

  it('leaves the Lamot 2 reference geometry untouched', () => {
    const reference: [number, number][] = [
      [14.1440, 121.3430],
      [14.1455, 121.3440],
      [14.1495, 121.3462],
    ];

    expect(normalizeOfficialRoutePath(reference, 'lamot-2')).toEqual(reference);
  });

  it('ends Lamot 1 and Sto. Tomas at the Lamot 2 peak while retaining jagged geometry', () => {
    for (const trail of TRAILS.slice(1)) {
      expect(trail.path.at(-1)).toEqual(MT_KALISUNGAN_PEAK);
      expect(new Set(trail.path.map(([lat]) => lat)).size).toBeGreaterThan(5);
    }
  });
});
