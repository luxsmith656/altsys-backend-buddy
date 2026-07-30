import type { LatLngTuple } from 'leaflet';

// Mount Kalisungan center coordinates (Calauan, Laguna, Philippines)
export const MT_KALISUNGAN_CENTER: LatLngTuple = [14.1475, 121.3454];
export const DEFAULT_ZOOM = 15;

// Trail route data (approximate real paths on Mt. Kalisungan)
export const TRAILS = [
  {
    name: 'Summit Trail',
    difficulty: 'hard' as const,
    color: '#ef4444',
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
    name: 'River Trail',
    difficulty: 'easy' as const,
    color: '#3b82f6',
    elevation: '350m',
    distance: '2.1 km',
    path: [
      [14.1440, 121.3430],
      [14.1438, 121.3438],
      [14.1435, 121.3445],
      [14.1433, 121.3452],
      [14.1430, 121.3458],
      [14.1428, 121.3465],
      [14.1425, 121.3470],
      [14.1423, 121.3475],
    ] as LatLngTuple[],
  },
  {
    name: 'Ridge Trail',
    difficulty: 'moderate' as const,
    color: '#f59e0b',
    elevation: '480m',
    distance: '2.8 km',
    path: [
      [14.1440, 121.3430],
      [14.1445, 121.3425],
      [14.1450, 121.3420],
      [14.1458, 121.3418],
      [14.1465, 121.3415],
      [14.1472, 121.3418],
      [14.1478, 121.3422],
      [14.1485, 121.3425],
      [14.1490, 121.3430],
    ] as LatLngTuple[],
  },
];

// Points of interest
export const POI = [
  { name: 'Trailhead / Registration', pos: [14.1440, 121.3430] as LatLngTuple, type: 'checkpoint' },
  { name: 'Summit (629m)', pos: [14.1495, 121.3462] as LatLngTuple, type: 'summit' },
  { name: 'Campsite A', pos: [14.1465, 121.3445] as LatLngTuple, type: 'camp' },
  { name: 'River Crossing', pos: [14.1430, 121.3458] as LatLngTuple, type: 'water' },
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

  const stations: RouteStation[] = [{
    id: 'jump-off',
    index: 1,
    kind: 'jump_off',
    name: 'Jump-off: Start of Trail (0 km)',
    description: 'Official route start, registration, and safety briefing point.',
    lat: validPath[0][0],
    lng: validPath[0][1],
    distanceKm: 0,
  }];

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
