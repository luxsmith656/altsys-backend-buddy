import { haversineM, simplify } from './geo';

export type GpsTrackPoint = {
  lat: number;
  lng: number;
  ts: number;
  alt?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  inferred?: boolean;
  source?: 'gps' | 'estimated';
  filterReason?: 'accepted' | 'estimated' | 'weak' | 'jump' | 'noise' | 'waiting' | 'manual';
  quality?: 'high' | 'medium' | 'low' | 'estimated';
};

export type MotionFilterResult = {
  point?: GpsTrackPoint;
  displayPoint?: GpsTrackPoint;
  appended: boolean;
  reason?: 'waiting' | 'weak' | 'jump' | 'noise';
};

type AxisState = {
  pos: number;
  vel: number;
  p00: number;
  p01: number;
  p10: number;
  p11: number;
};

type FilterState = {
  originLat: number;
  originLng: number;
  x: AxisState;
  y: AxisState;
  ts: number;
  accuracy: number;
  lastAccepted: GpsTrackPoint;
};

type FilterOptions = {
  minAccuracyForStartM?: number;
  maxAccuracyM?: number;
  minAppendDistanceM?: number;
};

const EARTH_M = 6371000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHeading(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

function latLngToMeters(lat: number, lng: number, originLat: number, originLng: number) {
  const latRad = originLat * Math.PI / 180;
  return {
    x: (lng - originLng) * Math.PI / 180 * EARTH_M * Math.cos(latRad),
    y: (lat - originLat) * Math.PI / 180 * EARTH_M,
  };
}

function metersToLatLng(x: number, y: number, originLat: number, originLng: number) {
  const lat = originLat + (y / EARTH_M) * 180 / Math.PI;
  const lng = originLng + (x / (EARTH_M * Math.cos(originLat * Math.PI / 180))) * 180 / Math.PI;
  return { lat, lng };
}

function predictAxis(axis: AxisState, dt: number, accelNoise: number): AxisState {
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt2 * dt2;
  const q = accelNoise * accelNoise;
  return {
    pos: axis.pos + axis.vel * dt,
    vel: axis.vel,
    p00: axis.p00 + dt * (axis.p10 + axis.p01) + dt2 * axis.p11 + q * dt4 / 4,
    p01: axis.p01 + dt * axis.p11 + q * dt3 / 2,
    p10: axis.p10 + dt * axis.p11 + q * dt3 / 2,
    p11: axis.p11 + q * dt2,
  };
}

function updateAxis(axis: AxisState, measurement: number, measurementVariance: number): AxisState {
  const innovation = measurement - axis.pos;
  const s = axis.p00 + measurementVariance;
  const k0 = axis.p00 / s;
  const k1 = axis.p10 / s;
  const p00 = (1 - k0) * axis.p00;
  const p01 = (1 - k0) * axis.p01;
  const p10 = axis.p10 - k1 * axis.p00;
  const p11 = axis.p11 - k1 * axis.p01;
  return {
    pos: axis.pos + k0 * innovation,
    vel: axis.vel + k1 * innovation,
    p00,
    p01,
    p10,
    p11,
  };
}

function pointFromState(state: FilterState, ts: number, raw: GpsTrackPoint, inferred = false): GpsTrackPoint {
  const ll = metersToLatLng(state.x.pos, state.y.pos, state.originLat, state.originLng);
  const accuracy = Math.max(4, Math.min(raw.accuracy ?? state.accuracy, 65));
  return {
    ...raw,
    lat: ll.lat,
    lng: ll.lng,
    ts,
    accuracy,
    inferred,
    source: inferred ? 'estimated' : 'gps',
    filterReason: inferred ? 'estimated' : 'accepted',
    quality: inferred ? 'estimated' : qualityFromAccuracy(accuracy),
  };
}

function qualityFromAccuracy(accuracy: number | null | undefined): GpsTrackPoint['quality'] {
  const value = accuracy ?? 999;
  if (value <= 12) return 'high';
  if (value <= 35) return 'medium';
  return 'low';
}

export class MotionGpsFilter {
  private state: FilterState | null = null;
  private readonly minAccuracyForStartM: number;
  private readonly maxAccuracyM: number;
  private readonly minAppendDistanceM: number;

  constructor(options: FilterOptions = {}) {
    this.minAccuracyForStartM = options.minAccuracyForStartM ?? 55;
    this.maxAccuracyM = options.maxAccuracyM ?? 90;
    this.minAppendDistanceM = options.minAppendDistanceM ?? 1.8;
  }

  reset() {
    this.state = null;
  }

  seed(points: GpsTrackPoint[]) {
    this.reset();
    for (const point of points) {
      if (Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.ts)) {
        this.filter(point, { moving: true, heading: point.heading ?? null, consecutivePredicted: 0, allowWeakStart: true });
      }
    }
  }

  filter(raw: GpsTrackPoint, opts: {
    heading?: number | null;
    moving?: boolean;
    consecutivePredicted?: number;
    allowWeakStart?: boolean;
  } = {}): MotionFilterResult {
    const accuracy = raw.accuracy ?? 999;
    const heading = normalizeHeading(raw.heading ?? opts.heading);
    const moving = opts.moving ?? (raw.speed != null && raw.speed > 0.35);

    if (!this.state) {
      if (!opts.allowWeakStart && accuracy > this.minAccuracyForStartM) {
        return { appended: false, reason: 'waiting' };
      }
      const variance = Math.max(accuracy, 8) ** 2;
      const first = {
        ...raw,
        heading,
        source: 'gps' as const,
        filterReason: 'accepted' as const,
        quality: qualityFromAccuracy(accuracy),
      };
      this.state = {
        originLat: raw.lat,
        originLng: raw.lng,
        x: { pos: 0, vel: 0, p00: variance, p01: 0, p10: 0, p11: 9 },
        y: { pos: 0, vel: 0, p00: variance, p01: 0, p10: 0, p11: 9 },
        ts: raw.ts,
        accuracy,
        lastAccepted: first,
      };
      return { point: first, displayPoint: first, appended: true };
    }

    const state = this.state;
    const dt = clamp((raw.ts - state.ts) / 1000, 0, 30);
    if (dt < 0.6) return { appended: false, displayPoint: state.lastAccepted, reason: 'noise' };

    const reportedSpeed = raw.speed != null && Number.isFinite(raw.speed) && raw.speed > 0
      ? raw.speed
      : Math.sqrt(state.x.vel ** 2 + state.y.vel ** 2);
    const accelNoise = moving ? 0.85 : 0.25;
    const predictedX = predictAxis(state.x, dt, accelNoise);
    const predictedY = predictAxis(state.y, dt, accelNoise);
    const rawMeters = latLngToMeters(raw.lat, raw.lng, state.originLat, state.originLng);
    const innovationM = Math.hypot(rawMeters.x - predictedX.pos, rawMeters.y - predictedY.pos);
    const lastToRawM = haversineM(state.lastAccepted, raw);
    const maxHumanSpeed = Math.max(3.3, Math.min(5.5, reportedSpeed + 1.5));
    const allowedInnovationM = Math.max(accuracy * 1.2 + state.accuracy * 0.35 + 8, maxHumanSpeed * dt + 10);

    state.x = predictedX;
    state.y = predictedY;
    state.ts = raw.ts;

    if (accuracy > this.maxAccuracyM) {
      const predicted = this.predictPoint(raw, moving, heading, opts.consecutivePredicted ?? 0);
      return predicted
        ? { point: predicted, displayPoint: predicted, appended: true, reason: 'weak' }
        : { appended: false, displayPoint: state.lastAccepted, reason: 'weak' };
    }

    if (dt < 120 && innovationM > allowedInnovationM) {
      const predicted = this.predictPoint(raw, moving, heading, opts.consecutivePredicted ?? 0);
      return predicted
        ? { point: predicted, displayPoint: predicted, appended: true, reason: 'jump' }
        : { appended: false, displayPoint: state.lastAccepted, reason: 'jump' };
    }

    const measurementVariance = Math.max(accuracy, 5) ** 2;
    state.x = updateAxis(state.x, rawMeters.x, measurementVariance);
    state.y = updateAxis(state.y, rawMeters.y, measurementVariance);

    if (moving && heading != null) {
      const targetSpeed = clamp(reportedSpeed || 1.0, 0.45, 1.8);
      const bearingRad = heading * Math.PI / 180;
      const blend = accuracy <= 20 ? 0.24 : 0.12;
      state.x.vel = state.x.vel * (1 - blend) + Math.sin(bearingRad) * targetSpeed * blend;
      state.y.vel = state.y.vel * (1 - blend) + Math.cos(bearingRad) * targetSpeed * blend;
    }

    state.accuracy = accuracy;
    const filtered = pointFromState(state, raw.ts, { ...raw, heading });
    const acceptedMoveM = haversineM(state.lastAccepted, filtered);
    const jitterRadiusM = Math.max(this.minAppendDistanceM, Math.min(6, accuracy * 0.2));

    if (!moving && lastToRawM < jitterRadiusM && dt < 45) {
      state.lastAccepted = { ...state.lastAccepted, ts: raw.ts, accuracy: Math.min(state.lastAccepted.accuracy ?? accuracy, accuracy), heading };
      return { appended: false, displayPoint: state.lastAccepted, reason: 'noise' };
    }

    if (acceptedMoveM < this.minAppendDistanceM && dt < 15) {
      return { appended: false, displayPoint: filtered, reason: 'noise' };
    }

    state.lastAccepted = filtered;
    return { point: filtered, displayPoint: filtered, appended: true };
  }

  private predictPoint(raw: GpsTrackPoint, moving: boolean, heading: number | null, consecutivePredicted: number) {
    if (!this.state || !moving || consecutivePredicted >= 4) return null;
    const speed = Math.sqrt(this.state.x.vel ** 2 + this.state.y.vel ** 2);
    if (speed < 0.2 && heading == null) return null;
    if (speed < 0.2 && heading != null) {
      const walkSpeed = clamp(raw.speed ?? 0.9, 0.45, 1.35);
      const bearingRad = heading * Math.PI / 180;
      this.state.x.vel = Math.sin(bearingRad) * walkSpeed;
      this.state.y.vel = Math.cos(bearingRad) * walkSpeed;
      this.state.x = predictAxis(this.state.x, 1, 0.5);
      this.state.y = predictAxis(this.state.y, 1, 0.5);
    }
    const predicted = pointFromState(this.state, raw.ts, { ...raw, heading }, true);
    const movedM = haversineM(this.state.lastAccepted, predicted);
    if (movedM < this.minAppendDistanceM || movedM > 22) return null;
    this.state.lastAccepted = predicted;
    this.state.accuracy = predicted.accuracy ?? this.state.accuracy;
    return predicted;
  }
}

export function normalizeTrackPoint(point: GpsTrackPoint): GpsTrackPoint {
  const accuracy = Number.isFinite(point.accuracy ?? NaN) ? point.accuracy ?? null : null;
  return {
    lat: point.lat,
    lng: point.lng,
    ts: point.ts,
    alt: point.alt ?? null,
    accuracy,
    speed: Number.isFinite(point.speed ?? NaN) ? point.speed ?? null : null,
    heading: Number.isFinite(point.heading ?? NaN) ? point.heading ?? null : null,
    inferred: Boolean(point.inferred),
    source: point.source ?? (point.inferred ? 'estimated' : 'gps'),
    filterReason: point.filterReason ?? (point.inferred ? 'estimated' : 'accepted'),
    quality: point.quality ?? (point.inferred ? 'estimated' : qualityFromAccuracy(accuracy)),
  };
}

export function buildRecordingQuality(rawPoints: GpsTrackPoint[], cleanedPoints: GpsTrackPoint[]) {
  const clean = cleanedPoints.map(normalizeTrackPoint);
  const raw = rawPoints.map(normalizeTrackPoint);
  const accuracies = raw
    .map((p) => p.accuracy)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const distanceM = clean.slice(1).reduce((sum, point, index) => sum + haversineM(clean[index], point), 0);
  const startedAt = raw[0]?.ts ?? clean[0]?.ts ?? null;
  const endedAt = raw[raw.length - 1]?.ts ?? clean[clean.length - 1]?.ts ?? null;
  return {
    rawPointCount: raw.length,
    cleanedPointCount: clean.length,
    rejectedPointCount: Math.max(0, raw.length - clean.filter((p) => !p.inferred).length),
    estimatedPointCount: clean.filter((p) => p.inferred || p.source === 'estimated').length,
    highQualityPointCount: clean.filter((p) => p.quality === 'high').length,
    mediumQualityPointCount: clean.filter((p) => p.quality === 'medium').length,
    lowQualityPointCount: clean.filter((p) => p.quality === 'low').length,
    averageAccuracyM: accuracies.length ? Math.round((accuracies.reduce((sum, v) => sum + v, 0) / accuracies.length) * 10) / 10 : null,
    bestAccuracyM: accuracies.length ? Math.min(...accuracies) : null,
    worstAccuracyM: accuracies.length ? Math.max(...accuracies) : null,
    distanceM: Math.round(distanceM * 10) / 10,
    durationSec: startedAt && endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : 0,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    filterVersion: 'motion-kalman-v2',
  };
}

function angleAt(a: GpsTrackPoint, b: GpsTrackPoint, c: GpsTrackPoint) {
  const ab = latLngToMeters(a.lat, a.lng, b.lat, b.lng);
  const cb = latLngToMeters(c.lat, c.lng, b.lat, b.lng);
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (mag === 0) return 180;
  return Math.acos(clamp(dot / mag, -1, 1)) * 180 / Math.PI;
}

export function postProcessTrack(points: GpsTrackPoint[], epsilonM = 1.5) {
  if (points.length < 3) return points.slice();
  const cleaned: GpsTrackPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = cleaned[cleaned.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const ab = haversineM(a, b);
    const bc = haversineM(b, c);
    const ac = haversineM(a, c);
    const angle = angleAt(a, b, c);
    const spike = ab > 6 && bc > 6 && ac < Math.max(8, (ab + bc) * 0.35) && angle < 40;
    const tooClose = ab < 0.9 && (b.ts - a.ts) < 20_000;
    if (!spike && !tooClose) cleaned.push(b);
  }
  cleaned.push(points[points.length - 1]);
  const simplified = simplify(cleaned.map((p) => ({ lat: p.lat, lng: p.lng })), epsilonM);
  const keys = new Set(simplified.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`));
  return cleaned.filter((p, index) => index === 0 || index === cleaned.length - 1 || keys.has(`${p.lat.toFixed(7)},${p.lng.toFixed(7)}`));
}
