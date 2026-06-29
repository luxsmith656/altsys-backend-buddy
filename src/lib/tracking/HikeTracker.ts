/**
 * Offline-first hike tracker.
 * - GPS smoothing (accuracy filter + EMA on altitude)
 * - Adaptive sampling
 * - Live stats: distance, moving/resting time, elevation gain/loss, pace, ETA
 * - Persists to IndexedDB; survives offline; sync handled separately.
 */
import polyline from '@mapbox/polyline';
import {
  appendPoint, saveSession, getActiveSession, getSessionPoints,
  type OfflineSession, type OfflinePoint, enqueue,
} from '@/lib/offlineDb';
import { supabase } from '@/integrations/supabase/client';
import { haversineM, simplify } from './geo';

type Listener = (snap: TrackerSnapshot) => void;

function isSchemaCacheError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return message.includes('schema cache') || message.includes('could not find') || message.includes('column');
}

export interface TrackerSnapshot {
  sessionId: string;
  distanceM: number;
  movingSec: number;
  restingSec: number;
  elapsedSec: number;
  ascentM: number;
  descentM: number;
  currentPaceSecPerKm: number | null;
  phase: 'ascent' | 'peak' | 'descent' | 'completed';
  peakReachedAt: number | null;
  descentStartedAt: number | null;
  lastFix: { lat: number; lng: number; alt: number; ts: number; accuracy: number } | null;
  path: { lat: number; lng: number }[];   // simplified for display
}

export class HikeTracker {
  private watchId: number | null = null;
  private session: OfflineSession;
  private listeners = new Set<Listener>();
  private points: OfflinePoint[] = [];
  private lastFix: { lat: number; lng: number; alt: number; ts: number; accuracy: number } | null = null;
  private lastMoveTs: number | null = null;
  private idleSince: number | null = null;
  private altEMA: number | null = null;
  private startTs: number;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    userId: string;
    bookingId?: string | null;
    trailZoneId?: string | null;
    sessionId?: string;
    serverSessionId?: string | null;
    participantRole?: OfflineSession['participantRole'];
    locationId?: string | null;
    existingSession?: OfflineSession;
    existingPoints?: OfflinePoint[];
  }) {
    const id = opts.sessionId ?? crypto.randomUUID();
    this.startTs = opts.existingSession?.startedAt ?? Date.now();
    this.session = opts.existingSession ?? {
      id, serverSessionId: opts.serverSessionId ?? null,
      userId: opts.userId,
      participantRole: opts.participantRole ?? 'hiker',
      locationId: opts.locationId ?? null,
      bookingId: opts.bookingId ?? null,
      trailZoneId: opts.trailZoneId ?? null,
      startedAt: this.startTs, status: 'active', phase: 'ascent',
      distanceM: 0, movingSec: 0, restingSec: 0, ascentM: 0, descentM: 0,
      ascentSec: 0, descentSec: 0, summitReached: false, encodedPath: '',
    };
    this.session.serverSessionId = this.session.serverSessionId ?? opts.serverSessionId ?? null;
    this.session.participantRole = this.session.participantRole ?? opts.participantRole ?? 'hiker';
    this.session.locationId = this.session.locationId ?? opts.locationId ?? null;
    this.session.phase = this.session.phase ?? 'ascent';
    this.points = opts.existingPoints ?? [];
    const last = this.points[this.points.length - 1];
    if (last) {
      this.lastFix = { lat: last.lat, lng: last.lng, alt: last.alt, ts: last.ts, accuracy: last.accuracy };
      this.altEMA = last.alt;
    }
  }

  get sessionId() { return this.session.id; }

  static async createOrResume(opts: {
    userId: string;
    bookingId?: string | null;
    trailZoneId?: string | null;
    serverSessionId?: string | null;
    participantRole?: OfflineSession['participantRole'];
    locationId?: string | null;
  }) {
    const existing = await getActiveSession(opts.userId, opts.serverSessionId ?? null);
    if (existing) {
      const points = await getSessionPoints(existing.id);
      return new HikeTracker({ ...opts, sessionId: existing.id, existingSession: existing, existingPoints: points });
    }
    return new HikeTracker(opts);
  }

  async start() {
    await saveSession(this.session);
    if (!navigator.geolocation) throw new Error('Geolocation not supported');
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.tickHandle) clearInterval(this.tickHandle);
    navigator.geolocation.getCurrentPosition(
      (p) => this.onFix(p),
      (e) => console.warn('Initial GPS error', e),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onFix(p),
      (e) => console.warn('GPS error', e),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  async pause() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.watchId = null; this.tickHandle = null;
    this.session.status = 'paused';
    await saveSession(this.session);
    await enqueue({ kind: 'session', payload: { ...this.session } });
    this.emit();
  }

  async resume() {
    this.session.status = 'active';
    await saveSession(this.session);
    this.emit();
    await this.start();
  }

  async stop(): Promise<OfflineSession> {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.watchId = null; this.tickHandle = null;
    this.session.status = 'completed';
    this.session.phase = 'completed';
    this.session.endedAt = Date.now();

    // Build simplified encoded path
    const all = await getSessionPoints(this.session.id);
    const coords = all.map((p) => ({ lat: p.lat, lng: p.lng }));
    const simplified = simplify(coords, 5);
    this.session.encodedPath = polyline.encode(simplified.map((c) => [c.lat, c.lng]));

    await saveSession(this.session);

    // Queue for sync
    await enqueue({ kind: 'session', payload: { ...this.session } });
    await enqueue({
      kind: 'points',
      payload: { sessionId: this.session.id, serverSessionId: this.session.serverSessionId ?? null, points: all },
    });
    return this.session;
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }

  async markPeak() {
    this.session.summitReached = true;
    this.session.phase = 'peak';
    this.session.peakReachedAt = Date.now();
    await saveSession(this.session);
    await enqueue({ kind: 'session', payload: { ...this.session } });
    this.emit();
  }

  async startDescent() {
    this.session.phase = 'descent';
    this.session.descentStartedAt = Date.now();
    await saveSession(this.session);
    await enqueue({ kind: 'session', payload: { ...this.session } });
    this.emit();
  }

  private onFix(pos: GeolocationPosition) {
    if (this.session.status !== 'active') return;
    const accuracy = pos.coords.accuracy ?? 999;
    // Reject very noisy fixes unless we haven't had one in a while
    const tooNoisy = accuracy > 50;
    const sinceLast = this.lastFix ? (Date.now() - this.lastFix.ts) / 1000 : 999;
    if (tooNoisy && sinceLast < 30) return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const altRaw = pos.coords.altitude ?? this.altEMA ?? 0;
    // EMA altitude
    this.altEMA = this.altEMA == null ? altRaw : this.altEMA * 0.7 + altRaw * 0.3;
    const alt = this.altEMA;
    const ts = Date.now();
    const speed = pos.coords.speed ?? 0;
    const heading = pos.coords.heading ?? null;

    // Adaptive sample: skip near-duplicates within 3m unless idle for 30s
    if (this.lastFix) {
      const d = haversineM(this.lastFix, { lat, lng });
      const dt = (ts - this.lastFix.ts) / 1000;
      const isMoving = speed > 0.5 || d > 3;
      if (!isMoving && dt < 30) return;

      // Update stats
      if (isMoving) {
        this.session.distanceM += d;
        this.session.movingSec += Math.min(dt, 30);
        this.lastMoveTs = ts;
        this.idleSince = null;
        const dAlt = alt - this.lastFix.alt;
        if (dAlt > 1) { this.session.ascentM += dAlt; this.session.ascentSec += dt; }
        else if (dAlt < -1) { this.session.descentM += -dAlt; this.session.descentSec += dt; }
      } else {
        this.session.restingSec += Math.min(dt, 30);
        if (!this.idleSince) this.idleSince = ts;
      }
    }

    this.lastFix = { lat, lng, alt, ts, accuracy };
    const point: OfflinePoint = {
      sessionId: this.session.id, lat, lng, alt,
      accuracy, speed, heading, ts, segment: this.session.phase === 'descent' ? 'descent' : this.session.phase === 'peak' ? 'peak' : 'ascent',
    };
    this.points.push(point);
    void appendPoint(point);
    void saveSession(this.session);
    void enqueue({ kind: 'session', payload: { ...this.session } });
    void this.pushLivePing(point);
    this.emit();
  }

  private async pushLivePing(point: OfflinePoint) {
    const payload = {
      sessionId: this.session.id,
      serverSessionId: this.session.serverSessionId ?? null,
      lat: point.lat,
      lng: point.lng,
      alt: point.alt,
      accuracy: point.accuracy,
      speed: point.speed,
      heading: point.heading,
      segment: point.segment,
      ts: point.ts,
    };

    if (!navigator.onLine) {
      await enqueue({ kind: 'ping', payload });
      return;
    }

    try {
      let realSessionId = this.session.serverSessionId ?? null;
      if (!realSessionId) {
        const { data, error } = await supabase
          .from('hiker_sessions')
          .select('id')
          .eq('client_session_id', this.session.id)
          .maybeSingle();
        if (error) throw error;
        realSessionId = data?.id ?? null;
      }
      if (!realSessionId) {
        await enqueue({ kind: 'ping', payload });
        return;
      }
      let { error } = await supabase.from('hiker_locations').insert({
        session_id: realSessionId,
        latitude: point.lat,
        longitude: point.lng,
        altitude: point.alt,
        accuracy: point.accuracy,
        speed_m_s: point.speed,
        heading: point.heading,
        segment: point.segment,
        timestamp: new Date(point.ts).toISOString(),
      } as any);
      if (error && isSchemaCacheError(error)) {
        const fallback = await supabase.from('hiker_locations').insert({
          session_id: realSessionId,
          latitude: point.lat,
          longitude: point.lng,
          altitude: point.alt,
          timestamp: new Date(point.ts).toISOString(),
        } as any);
        error = fallback.error;
      }
      if (error) throw error;
    } catch {
      await enqueue({ kind: 'ping', payload });
    }
  }

  private tick() {
    // Tick to bump resting time even if no fix arrives
    if (this.session.status !== 'active') return;
    if (this.lastFix && Date.now() - this.lastFix.ts > 30000) {
      this.session.restingSec += 1;
      void saveSession(this.session);
    }
    this.emit();
  }

  private emit() {
    const elapsed = ((this.session.endedAt ?? Date.now()) - this.session.startedAt) / 1000;
    const pace = this.session.distanceM > 0
      ? (this.session.movingSec / (this.session.distanceM / 1000))
      : null;
    const snap: TrackerSnapshot = {
      sessionId: this.session.id,
      distanceM: this.session.distanceM,
      movingSec: this.session.movingSec,
      restingSec: this.session.restingSec,
      elapsedSec: Math.round(elapsed),
      ascentM: Math.round(this.session.ascentM),
      descentM: Math.round(this.session.descentM),
      currentPaceSecPerKm: pace ? Math.round(pace) : null,
      phase: this.session.phase ?? 'ascent',
      peakReachedAt: this.session.peakReachedAt ?? null,
      descentStartedAt: this.session.descentStartedAt ?? null,
      lastFix: this.lastFix,
      path: simplify(this.points.map((p) => ({ lat: p.lat, lng: p.lng })), 3),
    };
    this.listeners.forEach((l) => l(snap));
  }
}
