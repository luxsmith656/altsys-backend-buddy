/**
 * Kalman filter + signal-quality helpers for high-accuracy GPS tracking.
 * Designed for mountain / weak-signal environments. Reduces jitter without
 * over-smoothing real movement.
 */

export type GpsPoint = {
  timestamp: number;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;        // m/s as reported by browser
  accuracy: number | null;     // meters
  heading: number | null;
};

export type SignalQuality = 'Strong' | 'Medium' | 'Weak' | 'None';

export function classifySignal(accuracy: number | null | undefined): SignalQuality {
  if (accuracy == null || !isFinite(accuracy)) return 'None';
  if (accuracy <= 10) return 'Strong';
  if (accuracy <= 25) return 'Medium';
  if (accuracy <= 60) return 'Weak';
  return 'Weak';
}

/** Haversine distance in meters. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

/**
 * 2-D Kalman filter for lat/lon. Variance is in (degrees)^2; measurement
 * noise is derived from accuracy in meters then converted to degrees.
 *
 * Adaptive: process noise scales with current speed (higher speed = trust
 * new measurement faster). Measurement noise scales with accuracy.
 */
export class GpsKalman {
  private lat = 0;
  private lon = 0;
  private variance = -1; // <0 = uninitialized
  private lastTs = 0;

  reset() {
    this.variance = -1;
  }

  /**
   * Push a raw GPS point and return the filtered point.
   * @param speedMps current speed estimate in m/s (use 0 if unknown)
   */
  filter(p: GpsPoint, speedMps: number): GpsPoint {
    const accuracy = Math.max(p.accuracy ?? 15, 3); // floor 3m
    if (this.variance < 0) {
      this.lat = p.lat;
      this.lon = p.lon;
      this.variance = accuracy * accuracy;
      this.lastTs = p.timestamp;
      return p;
    }

    const dtSec = Math.max((p.timestamp - this.lastTs) / 1000, 0.001);

    // Process noise grows with time and speed. Tune: ~ (speed*dt)^2 m^2
    const expectedDriftM = Math.max(speedMps, 0.5) * dtSec;
    const processVarMeters = expectedDriftM * expectedDriftM + 1.0; // +1 baseline
    this.variance += processVarMeters;

    const measVar = accuracy * accuracy;
    const k = this.variance / (this.variance + measVar);

    this.lat = this.lat + k * (p.lat - this.lat);
    this.lon = this.lon + k * (p.lon - this.lon);
    this.variance = (1 - k) * this.variance;
    this.lastTs = p.timestamp;

    return { ...p, lat: this.lat, lon: this.lon };
  }
}

/**
 * Decide whether to record a new point on the breadcrumb path.
 * Avoids zigzag while stationary and absorbs tiny jitter.
 */
export function shouldRecordPoint(
  prev: GpsPoint | null,
  next: GpsPoint,
  speedMps: number,
): boolean {
  if (!prev) return true;
  const d = haversineMeters(prev, next);
  const acc = next.accuracy ?? 20;

  // Big jump → always record (real movement or signal regain)
  if (d > 60) return true;

  // Stationary → discard small movements
  if (speedMps < 0.4) return d > Math.max(8, acc * 0.6);

  // Walking/moving → require movement bigger than half the accuracy circle
  return d > Math.max(3, acc * 0.4);
}
