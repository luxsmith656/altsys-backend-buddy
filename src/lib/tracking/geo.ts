// Geo helpers for the offline tracker

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

/** Naismith + Tobler-flavored ETA estimator. */
export function estimateEtaSec(
  distRemainM: number,
  elevRemainM: number,
  observedPaceSecPerKm: number | null,
): number {
  // Base: 12 min / km flat, +10 min per 100 m ascent (Naismith)
  const flatPaceSecPerKm = observedPaceSecPerKm && observedPaceSecPerKm > 0 ? observedPaceSecPerKm : 12 * 60;
  const baseSec = (distRemainM / 1000) * flatPaceSecPerKm;
  const climbSec = Math.max(0, elevRemainM) * 6; // 6s per meter ascent ≈ 600s/100m
  return Math.round(baseSec + climbSec);
}
