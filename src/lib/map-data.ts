import type { LatLngTuple } from 'leaflet';

// Mount Kalisungan center coordinates (Calauan, Laguna, Philippines)
export const MT_KALISUNGAN_CENTER: LatLngTuple = [14.1475, 121.3454];
// Summit marker is taken from the endpoint of Lamot 2's active published GPS route.
export const MT_KALISUNGAN_PEAK: LatLngTuple = [14.14669032170505, 121.34512701965895];
export const TRAILHEAD_COORDINATES: Record<string, LatLngTuple> = {
  'lamot-1': [14.147385047365747, 121.32372794241525],
  'lamot-2': [14.1440, 121.3430],
  'sto-tomas': [14.166631, 121.339746],
};
export const DEFAULT_ZOOM = 15;

// Representative samples of the active Lamot 2 recording, used to keep the
// other jump-off previews visually tied to the same summit trail shape.
const LAMOT_2_REFERENCE_PATH: LatLngTuple[] = [
  [14.1486888, 121.3291523], [14.1470504, 121.3298789], [14.1472665, 121.3315418],
  [14.1476030, 121.3325735], [14.1475829, 121.3331803], [14.1480986, 121.3338370],
  [14.1483774, 121.3344008], [14.1482683, 121.3349531], [14.1481253, 121.3355555],
  [14.1479074, 121.3360883], [14.1477896, 121.3365060], [14.1474764, 121.3369808],
  [14.1475823, 121.3376279], [14.1477097, 121.3383561], [14.1478413, 121.3386814],
  [14.1480733, 121.3390284], [14.1481372, 121.3394095], [14.1479998, 121.3399396],
  [14.1480275, 121.3401405], [14.1482238, 121.3404269], [14.1483616, 121.3409679],
  [14.1477756, 121.3413722], [14.1482473, 121.3415574], [14.1494729, 121.3420641],
  [14.1493538, 121.3427719], [14.1489019, 121.3434760], [14.1474890, 121.3441621],
  MT_KALISUNGAN_PEAK,
];

function createReferenceShapedPath(start: LatLngTuple, variant: number, laneOffsetMeters: number): LatLngTuple[] {
  const referenceStart = LAMOT_2_REFERENCE_PATH[0];
  const lastIndex = LAMOT_2_REFERENCE_PATH.length - 1;
  return LAMOT_2_REFERENCE_PATH.map(([lat, lng], index) => {
    const progress = index / lastIndex;
    const taper = 1 - progress;
    const previous = LAMOT_2_REFERENCE_PATH[Math.max(0, index - 1)];
    const next = LAMOT_2_REFERENCE_PATH[Math.min(lastIndex, index + 1)];
    const deltaEast = (next[1] - previous[1]) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const deltaNorth = (next[0] - previous[0]) * 111_320;
    const tangentLength = Math.hypot(deltaEast, deltaNorth) || 1;
    // Keep entry routes visibly separate from the Lamot 2 reference until the
    // final summit approach, while ramping the lane in gently from each start.
    const laneTaper = Math.min(1, taper * 1.25) * Math.min(1, progress * 10);
    const laneMeters = laneOffsetMeters * laneTaper;
    const turnOffset = Math.sin(index * 1.7 + variant) * 0.000045 * taper;
    return [
      lat + (start[0] - referenceStart[0]) * taper - (deltaEast / tangentLength) * laneMeters / 111_320 + turnOffset,
      lng + (start[1] - referenceStart[1]) * taper
        + (deltaNorth / tangentLength) * laneMeters / (111_320 * Math.cos((lat * Math.PI) / 180))
        + Math.cos(index * 1.3 + variant) * 0.000045 * taper,
    ] as LatLngTuple;
  }).map((point, index, path) => {
    if (index === 0) return start;
    if (index === path.length - 1) return MT_KALISUNGAN_PEAK;
    return point;
  });
}

// Trail route data (Official published path on Mt. Kalisungan)
export const TRAILS = [
  {
    name: 'Summit Trail (Official Route)',
    difficulty: 'moderate' as const,
    color: '#16a34a',
    elevation: '622m',
    distance: '3.2 km',
    path: [
      [14.1440, 121.3430],
      [14.1448, 121.3435],
      [14.1455, 121.3440],
      [14.1462, 121.3445],
      [14.1468, 121.3448],
      [14.1473, 121.3452],
      [14.1478, 121.3455],
      [14.1483, 121.3458],
      [14.1488, 121.3460],
      [14.1495, 121.3462],
    ] as LatLngTuple[],
  },
  {
    name: 'Lamot 1 Classic Summit Trail',
    difficulty: 'moderate' as const,
    color: '#2563eb',
    elevation: '629m',
    distance: '2.8 km',
    path: createReferenceShapedPath(TRAILHEAD_COORDINATES['lamot-1'], 0.6, 180),
  },
  {
    name: 'Sto. Tomas Southern Traverse Trail',
    difficulty: 'hard' as const,
    color: '#ea580c',
    elevation: '629m',
    distance: '3.8 km',
    path: createReferenceShapedPath(TRAILHEAD_COORDINATES['sto-tomas'], 2.2, -180),
  },
];

export function getDefaultTrailForLocation(locationKey?: string | null) {
  if (!locationKey) return TRAILS[0];
  const lk = locationKey.toLowerCase();
  if (lk.includes('lamot-1') || lk.includes('lamot 1') || lk.includes('lamot1')) {
    return TRAILS[1];
  }
  if (lk.includes('tomas') || lk.includes('sto-tomas')) {
    return TRAILS[2];
  }
  return TRAILS[0];
}

/**
 * Keep legacy published rows from drawing a disconnected jump-off or a second
 * summit while the coordinate migration is being applied. Once a database
 * route starts and ends near the registered anchors, its own recorded shape is
 * preserved; only stale rows use the matching local route geometry.
 */
export function normalizeOfficialRoutePath(path: LatLngTuple[], locationKey?: string | null, _referencePath?: LatLngTuple[]): LatLngTuple[] {
  const clean = cleanTrailPath(path, 1);
  if (clean.length < 2 || !locationKey) return clean;

  const key = locationKey.toLowerCase().replace(/\s+/g, '-');
  const slug = key.includes('lamot-1') || key.includes('lamot1') ? 'lamot-1'
    : key.includes('lamot-2') || key.includes('lamot2') ? 'lamot-2'
      : key.includes('tomas') ? 'sto-tomas' : null;
  if (!slug) return clean;

  // Lamot 2 is the approved reference route. Never rewrite its stored path.
  if (slug === 'lamot-2') return clean;

  const expectedStart = TRAILHEAD_COORDINATES[slug];
  const legacyStart = haversineDistance(clean[0][0], clean[0][1], expectedStart[0], expectedStart[1]) > 0.15;
  const legacyPeak = haversineDistance(clean[clean.length - 1][0], clean[clean.length - 1][1], MT_KALISUNGAN_PEAK[0], MT_KALISUNGAN_PEAK[1]) > 0.15;
  if (legacyStart || legacyPeak) return cleanTrailPath(getDefaultTrailForLocation(slug).path);

  if (slug !== 'lamot-1' || clean.length < 50) return clean;
  const reference = _referencePath && _referencePath.length >= 2 ? _referencePath : LAMOT_2_REFERENCE_PATH;
  if (!isCopiedReferenceRoute(clean, reference)) return clean;

  // The current Lamot 1 published row duplicates Lamot 2's GPS trace. Keep
  // its original high-resolution bends while moving that copy to a separate lane.
  return keepEntryRouteInSeparateLane(clean, expectedStart);
}

function isCopiedReferenceRoute(path: LatLngTuple[], referencePath: LatLngTuple[]): boolean {
  if (path.length < 50 || referencePath.length < 2) return false;
  const meanLatitude = path.reduce((sum, [lat]) => sum + lat, 0) / path.length;
  const metersPerLongitude = 111_320 * Math.cos((meanLatitude * Math.PI) / 180);
  const reference = referencePath.map(([lat, lng]) => [lng * metersPerLongitude, lat * 111_320] as [number, number]);
  const sampleCount = Math.min(50, path.length);
  let distanceTotal = 0;

  for (let sample = 0; sample < sampleCount; sample++) {
    const point = path[Math.round(sample * (path.length - 1) / (sampleCount - 1))];
    const east = point[1] * metersPerLongitude;
    const north = point[0] * 111_320;
    let nearestDistance = Infinity;
    for (let index = 0; index < reference.length - 1; index++) {
      const [startEast, startNorth] = reference[index];
      const [endEast, endNorth] = reference[index + 1];
      const deltaEast = endEast - startEast;
      const deltaNorth = endNorth - startNorth;
      const ratio = Math.max(0, Math.min(1,
        ((east - startEast) * deltaEast + (north - startNorth) * deltaNorth)
        / (deltaEast * deltaEast + deltaNorth * deltaNorth || 1),
      ));
      nearestDistance = Math.min(nearestDistance, Math.hypot(
        east - startEast - ratio * deltaEast,
        north - startNorth - ratio * deltaNorth,
      ));
    }
    distanceTotal += nearestDistance;
  }

  return distanceTotal / sampleCount < 180;
}

/** Move copied entry routes into a stable separate corridor without smoothing their recorded bends. */
function keepEntryRouteInSeparateLane(path: LatLngTuple[], start: LatLngTuple): LatLngTuple[] {
  if (path.length < 3) return path;

  // Lamot 1 currently shares Lamot 2's recorded geometry. A steady southwest
  // lane separates it from the reference route without following its turns or
  // replacing the original high-resolution GPS shape.
  const lane = { east: -141, north: -320 };
  const meanLatitude = path.reduce((sum, [lat]) => sum + lat, 0) / path.length;
  const metersPerLongitude = 111_320 * Math.cos((meanLatitude * Math.PI) / 180);
  const result = path.map((point, index) => {
    const progress = index / (path.length - 1);
    const ramp = Math.min(1, progress / 0.08, (1 - progress) / 0.08);
    const offset = ramp * ramp * (3 - 2 * ramp);
    return [
      point[0] + (lane.north * offset) / 111_320,
      point[1] + (lane.east * offset) / metersPerLongitude,
    ] as LatLngTuple;
  });
  result[0] = start;
  result[result.length - 1] = MT_KALISUNGAN_PEAK;
  return cleanTrailPath(result, 1);
}

// Points of interest
export const POI = [
  { name: 'Trailhead / Registration (Lamot 2)', pos: [14.1440, 121.3430] as LatLngTuple, type: 'checkpoint' },
  { name: 'Trailhead / Registration (Lamot 1)', pos: [14.147385047365747, 121.32372794241525] as LatLngTuple, type: 'checkpoint' },
  { name: 'Trailhead / Registration (Sto. Tomas)', pos: [14.166631, 121.339746] as LatLngTuple, type: 'checkpoint' },
  { name: 'Summit (629m)', pos: MT_KALISUNGAN_PEAK, type: 'summit' },
  { name: 'Campsite A', pos: [14.1465, 121.3445] as LatLngTuple, type: 'camp' },
  { name: 'Rest Station & Water Refill', pos: [14.1430, 121.3458] as LatLngTuple, type: 'water' },
  { name: 'Viewpoint Ridge', pos: [14.1478, 121.3422] as LatLngTuple, type: 'viewpoint' },
  { name: 'Ranger Station', pos: [14.1442, 121.3433] as LatLngTuple, type: 'ranger' },
];

// Zone polygons
export const ZONES = [
  {
    name: 'Camping Zone',
    color: '#22c55e',
    positions: [
      [14.1460, 121.3440],
      [14.1470, 121.3440],
      [14.1470, 121.3450],
      [14.1460, 121.3450],
    ] as LatLngTuple[],
  },
  {
    name: 'Restricted Wildlife Area',
    color: '#ef4444',
    positions: [
      [14.1490, 121.3450],
      [14.1505, 121.3450],
      [14.1505, 121.3470],
      [14.1490, 121.3470],
    ] as LatLngTuple[],
  },
];

// Haversine distance in km
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Remove short GPS closure/crossing loops and simplify meter-scale jitter for map display. */
export function cleanTrailPath(path: LatLngTuple[], toleranceMeters = 4): LatLngTuple[] {
  const valid = path.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (valid.length < 3) return valid;

  const deduplicated: LatLngTuple[] = [];
  for (const point of valid) {
    const previous = deduplicated[deduplicated.length - 1];
    if (!previous || haversineDistance(previous[0], previous[1], point[0], point[1]) >= 0.002) {
      deduplicated.push(point);
    }
  }

  const meanLatitude = deduplicated.reduce((sum, [lat]) => sum + lat, 0) / deduplicated.length;
  const toMeters = ([lat, lng]: LatLngTuple): [number, number] => [
    lng * 111_320 * Math.cos((meanLatitude * Math.PI) / 180),
    lat * 111_320,
  ];
  const fromMeters = ([east, north]: [number, number]): LatLngTuple => [
    north / 111_320,
    east / (111_320 * Math.cos((meanLatitude * Math.PI) / 180)),
  ];
  const distanceMeters = (a: LatLngTuple, b: LatLngTuple) => Math.hypot(toMeters(a)[0] - toMeters(b)[0], toMeters(a)[1] - toMeters(b)[1]);
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const withoutGpsLoops: LatLngTuple[] = [];
  deduplicated.forEach((point, pointIndex) => {
    let loopStart = -1;
    let loopJoin: LatLngTuple | null = null;
    if (pointIndex < deduplicated.length - 1 && withoutGpsLoops.length >= 3) {
      const last = toMeters(withoutGpsLoops[withoutGpsLoops.length - 1]);
      const current = toMeters(point);
      const rx = current[0] - last[0];
      const ry = current[1] - last[1];
      for (let index = Math.max(0, withoutGpsLoops.length - 180); index <= withoutGpsLoops.length - 3; index++) {
        const start = toMeters(withoutGpsLoops[index]);
        const end = toMeters(withoutGpsLoops[index + 1]);
        const sx = end[0] - start[0];
        const sy = end[1] - start[1];
        const denominator = cross(rx, ry, sx, sy);
        if (Math.abs(denominator) < 0.001) continue;
        const qx = start[0] - last[0];
        const qy = start[1] - last[1];
        const t = cross(qx, qy, sx, sy) / denominator;
        const u = cross(qx, qy, rx, ry) / denominator;
        if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) continue;
        const intersection = fromMeters([last[0] + t * rx, last[1] + t * ry]);
        const loopLength = withoutGpsLoops.slice(index + 1).reduce((sum, item, sliceIndex, segment) => {
          const prior = sliceIndex === 0 ? intersection : segment[sliceIndex - 1];
          return sum + distanceMeters(prior, item);
        }, distanceMeters(withoutGpsLoops[withoutGpsLoops.length - 1], intersection));
        if (loopLength <= 350) {
          loopStart = index;
          loopJoin = intersection;
        }
      }
    }
    if (loopStart >= 0 && loopJoin) {
      withoutGpsLoops.length = loopStart + 1;
      if (distanceMeters(withoutGpsLoops[withoutGpsLoops.length - 1], loopJoin) >= 0.002) withoutGpsLoops.push(loopJoin);
      if (distanceMeters(loopJoin, point) >= 0.002) withoutGpsLoops.push(point);
      return;
    }

    let nearLoopStart = -1;
    for (let index = Math.max(0, withoutGpsLoops.length - 180); pointIndex < deduplicated.length - 1 && index <= withoutGpsLoops.length - 4; index++) {
      if (distanceMeters(withoutGpsLoops[index], point) > 20) continue;
      const loopLength = withoutGpsLoops.slice(index).reduce((sum, item, sliceIndex, segment) => {
        if (sliceIndex === 0) return sum;
        return sum + distanceMeters(segment[sliceIndex - 1], item);
      }, 0);
      if (loopLength <= 350) nearLoopStart = index;
    }
    if (nearLoopStart >= 0) withoutGpsLoops.length = nearLoopStart + 1;
    else withoutGpsLoops.push(point);
  });

  if (withoutGpsLoops.length < 3) return withoutGpsLoops;

  const projectDistance = (point: [number, number], start: [number, number], end: [number, number]) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
    return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
  };
  const projected = withoutGpsLoops.map(toMeters);
  const keep = new Set<number>([0, projected.length - 1]);
  const simplify = (startIndex: number, endIndex: number) => {
    let maxDistance = toleranceMeters;
    let farthestIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index++) {
      const distance = projectDistance(projected[index], projected[startIndex], projected[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex < 0) return;
    keep.add(farthestIndex);
    simplify(startIndex, farthestIndex);
    simplify(farthestIndex, endIndex);
  };
  simplify(0, projected.length - 1);
  return withoutGpsLoops.filter((_, index) => keep.has(index));
}

export interface RouteStation {
  id: string;
  index: number;
  kind: 'jump_off' | 'station' | 'peak';
  name: string;
  description: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

function pointAtDistance(path: LatLngTuple[], targetMeters: number): LatLngTuple {
  if (path.length === 0) return MT_KALISUNGAN_CENTER;
  if (targetMeters <= 0) return path[0];

  let coveredMeters = 0;
  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1];
    const current = path[index];
    const segmentMeters = haversineDistance(previous[0], previous[1], current[0], current[1]) * 1000;
    if (coveredMeters + segmentMeters >= targetMeters && segmentMeters > 0) {
      const ratio = (targetMeters - coveredMeters) / segmentMeters;
      return [
        previous[0] + (current[0] - previous[0]) * ratio,
        previous[1] + (current[1] - previous[1]) * ratio,
      ];
    }
    coveredMeters += segmentMeters;
  }
  return path[path.length - 1];
}

export function buildRouteStations(path: LatLngTuple[]): RouteStation[] {
  const validPath = path.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (validPath.length < 2) return [];

  const totalMeters = validPath.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = validPath[index - 1];
    return total + haversineDistance(previous[0], previous[1], point[0], point[1]) * 1000;
  }, 0);
  if (totalMeters <= 0) return [];

  const hasFiveFullKilometers = totalMeters >= 5000;
  const stationTargets = Array.from({ length: 5 }, (_, index) => {
    const stationNumber = index + 1;
    return hasFiveFullKilometers ? stationNumber * 1000 : totalMeters * (stationNumber / 6);
  });

  const stations: RouteStation[] = [
    {
      id: 'jump-off',
      index: 1,
      kind: 'jump_off',
      name: 'Jump-off: Start of Trail (0 km)',
      description: 'Official route start, registration, and safety briefing point.',
      lat: validPath[0][0],
      lng: validPath[0][1],
      distanceKm: 0,
    },
  ];

  stationTargets.forEach((targetMeters, index) => {
    const position = pointAtDistance(validPath, targetMeters);
    const distanceKm = targetMeters / 1000;
    stations.push({
      id: `station-${index + 1}`,
      index: index + 2,
      kind: 'station',
      name: `Station ${index + 1} (${distanceKm.toFixed(hasFiveFullKilometers ? 0 : 2)} km)`,
      description: `Official progress station ${index + 1} along the published trail.`,
      lat: position[0],
      lng: position[1],
      distanceKm,
    });
  });

  const end = validPath[validPath.length - 1];
  stations.push({
    id: 'peak',
    index: 7,
    kind: 'peak',
    name: `Peak / End of Path (${(totalMeters / 1000).toFixed(2)} km)`,
    description: 'Official summit or trail endpoint.',
    lat: end[0],
    lng: end[1],
    distanceKm: totalMeters / 1000,
  });

  return stations;
}

export function routeStationsFromMetadata(metadata: unknown, path: LatLngTuple[]): RouteStation[] {
  const stored = metadata && typeof metadata === 'object'
    ? (metadata as { stations?: unknown }).stations
    : null;
  if (Array.isArray(stored)) {
    const parsed = stored
      .map((station, index) => {
        if (!station || typeof station !== 'object') return null;
        const item = station as Partial<RouteStation>;
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(item.id ?? `station-${index}`),
          index: Number(item.index ?? index + 1),
          kind: item.kind === 'jump_off' || item.kind === 'peak' ? item.kind : 'station',
          name: String(item.name ?? `Station ${index}`),
          description: String(item.description ?? ''),
          lat,
          lng,
          distanceKm: Number(item.distanceKm ?? 0),
        } satisfies RouteStation;
      })
      .filter((station): station is RouteStation => station !== null);
    if (parsed.length >= 2) return parsed;
  }
  return buildRouteStations(path);
}

// Distance from point to nearest point on polyline
export function distanceToTrail(lat: number, lng: number, trail: LatLngTuple[]): number {
  let minDist = Infinity;
  for (const [tLat, tLng] of trail) {
    const d = haversineDistance(lat, lng, tLat, tLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}
