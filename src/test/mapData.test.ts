import { describe, expect, it } from 'vitest';
import { buildRouteStations, cleanTrailPath, haversineDistance, LAMOT_2_REFERENCE_PATH, MT_KALISUNGAN_PEAK, normalizeOfficialRoutePath, TRAILHEAD_COORDINATES, TRAILS } from '@/lib/map-data';

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

  it('joins Sto. Tomas at Lamot 2 Station 5 even when the route anchors are current', () => {
    const current: [number, number][] = [
      TRAILHEAD_COORDINATES['sto-tomas'] as [number, number],
      [14.1531, 121.3437],
      [14.1490, 121.3434],
      MT_KALISUNGAN_PEAK as [number, number],
    ];

    const normalized = normalizeOfficialRoutePath(current, 'sto-tomas', LAMOT_2_REFERENCE_PATH);
    expect(normalized[0]).toEqual(TRAILHEAD_COORDINATES['sto-tomas']);
    expect(normalized.slice(-1)).toEqual([MT_KALISUNGAN_PEAK]);
    expect(normalized).not.toEqual(current);
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

  it.each([
    { index: 1, slug: 'lamot-1', stationNumber: 1 as const },
    { index: 2, slug: 'sto-tomas', stationNumber: 5 as const },
  ])('merges $slug at Lamot 2 Station $stationNumber and keeps the exact shared suffix', ({ index, slug, stationNumber }) => {
    const reference = cleanTrailPath(LAMOT_2_REFERENCE_PATH, 0.75);
    const path = TRAILS[index].path;
    const referenceDistances = reference.reduce<number[]>((distances, point, pointIndex) => {
      if (pointIndex === 0) return [0];
      const previous = reference[pointIndex - 1];
      distances.push(distances[pointIndex - 1] + haversineDistance(previous[0], previous[1], point[0], point[1]) * 1000);
      return distances;
    }, []);
    const joinDistance = referenceDistances.at(-1)! * (stationNumber / 6);
    const joinSegment = referenceDistances.findIndex((distance) => distance >= joinDistance);
    const previousDistance = referenceDistances[joinSegment - 1];
    const ratio = (joinDistance - previousDistance) / (referenceDistances[joinSegment] - previousDistance);
    const joinPoint: [number, number] = [
      reference[joinSegment - 1][0] + (reference[joinSegment][0] - reference[joinSegment - 1][0]) * ratio,
      reference[joinSegment - 1][1] + (reference[joinSegment][1] - reference[joinSegment - 1][1]) * ratio,
    ];
    const joinIndex = path.findIndex(([lat, lng]) => lat === joinPoint[0] && lng === joinPoint[1]);
    const expectedSuffix = [joinPoint, ...reference.filter((_, pointIndex) => referenceDistances[pointIndex] > joinDistance)];

    expect(path[0]).toEqual(TRAILHEAD_COORDINATES[slug]);
    expect(joinIndex).toBeGreaterThan(0);
    expect(path.slice(joinIndex)).toEqual(expectedSuffix);
    expect(path.at(-1)).toEqual(MT_KALISUNGAN_PEAK);
    const markers = buildRouteStations(path, { stationNumber, position: joinPoint });
    expect(markers[stationNumber].lat).toBe(joinPoint[0]);
    expect(markers[stationNumber].lng).toBe(joinPoint[1]);
  });

  it('updates the Lamot 1 join when old metadata says it shared from Station 4', () => {
    const path = Array.from({ length: 60 }, (_, index) => [
      TRAILHEAD_COORDINATES['lamot-1'][0] + index * 0.00002,
      TRAILHEAD_COORDINATES['lamot-1'][1] + index * 0.0003,
    ] as [number, number]);
    path[path.length - 1] = [MT_KALISUNGAN_PEAK[0], MT_KALISUNGAN_PEAK[1]];

    const normalized = normalizeOfficialRoutePath(path, 'lamot-1', LAMOT_2_REFERENCE_PATH, true);

    expect(normalized[0]).toEqual(TRAILHEAD_COORDINATES['lamot-1']);
    expect(normalized[normalized.length - 1]).toEqual(MT_KALISUNGAN_PEAK);
    expect(normalized).not.toEqual(path);
    const reference = cleanTrailPath(LAMOT_2_REFERENCE_PATH, 0.75);
    const distances = reference.reduce<number[]>((result, point, index) => {
      if (index === 0) return [0];
      const previous = reference[index - 1];
      result.push(result[index - 1] + haversineDistance(previous[0], previous[1], point[0], point[1]) * 1000);
      return result;
    }, []);
    const station1Distance = distances.at(-1)! / 6;
    const segment = distances.findIndex((distance) => distance >= station1Distance);
    const ratio = (station1Distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);
    const station1 = [
      reference[segment - 1][0] + (reference[segment][0] - reference[segment - 1][0]) * ratio,
      reference[segment - 1][1] + (reference[segment][1] - reference[segment - 1][1]) * ratio,
    ];
    expect(normalized).toContainEqual(station1);
  });
});
