// Geo helpers for the offline tracker

/** Display-only guidance within the fix uncertainty; recorded GPS stays unchanged. */
export function guideFixToTrail(fix: { lat: number; lng: number }, accuracy: number, path: [number, number, number?][]) {
  if (!Number.isFinite(accuracy) || accuracy < 6 || accuracy > 40) return fix;
  const scale = Math.cos(fix.lat * Math.PI / 180);
  let nearest = fix;
  let distance = Math.min(12, accuracy / 2);
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (((fix.lng - a[1]) * scale * dx) + (fix.lat - a[0]) * dy) / length));
    const candidate = { lat: a[0] + t * dy, lng: a[1] + t * (b[1] - a[1]) };
    const d = haversineM(fix, candidate);
    if (d < distance) { distance = d; nearest = candidate; }
  }
  return nearest;
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Keep reconnect gaps honest on the map. A line across a long period without a
 * GPS fix is not a measured path, so render the next fix as a new segment.
 */
export function splitTrackAtGaps<T extends { lat: number; lng: number; ts?: number | string }>(
  points: T[],
  maxGapMs = 3 * 60 * 1000,
  maxJumpM = 250,
): T[][] {
  if (points.length === 0) return [];
  const segments: T[][] = [[points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousTs = typeof previous.ts === 'string' ? Date.parse(previous.ts) : Number(previous.ts);
    const currentTs = typeof current.ts === 'string' ? Date.parse(current.ts) : Number(current.ts);
    const timeGap = Number.isFinite(previousTs) && Number.isFinite(currentTs) ? currentTs - previousTs : 0;
    const distance = haversineM(previous, current);
    if (timeGap >= maxGapMs || (distance >= maxJumpM && timeGap >= 60 * 1000)) {
      segments.push([current]);
    } else {
      segments[segments.length - 1].push(current);
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

/** Douglas–Peucker line simplification on lat/lng with epsilon in meters. */
export function simplify(points: { lat: number; lng: number }[], epsilonM = 5): { lat: number; lng: number }[] {
  if (points.length < 3) return points.slice();
  const sqEps = epsilonM * epsilonM;
  function perpSqM(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const ab = haversineM(a, b);
    if (ab === 0) return haversineM(p, a) ** 2;
    const ap = haversineM(a, p);
    const bp = haversineM(b, p);
    // Heron's formula for triangle area → perpendicular distance
    const s = (ab + ap + bp) / 2;
    const area2 = Math.max(0, s * (s - ab) * (s - ap) * (s - bp));
    const area = Math.sqrt(area2);
    const h = (2 * area) / ab;
    return h * h;
  }
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpSqM(points[k], points[i], points[j]);
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (idx !== -1 && maxD > sqEps) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
