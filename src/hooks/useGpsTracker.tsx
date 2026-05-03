/**
 * useGpsTracker — high-accuracy, offline-first GPS streaming hook.
 *
 * Behavior:
 *  - Watches device GPS (high accuracy, no caching).
 *  - Filters jitter via Kalman + accuracy/threshold gating.
 *  - Tracks signal quality (Strong/Medium/Weak/None).
 *  - Adaptive polling: more frequent when moving, slower when idle.
 *  - When `sessionId` is provided, queues every accepted point locally
 *    (IndexedDB / Capacitor SQLite) and auto-syncs to the server when
 *    online. Works fully offline; flushes the moment connectivity returns.
 */

import { useEffect, useRef, useState } from 'react';
import {
  GpsKalman, classifySignal, haversineMeters, shouldRecordPoint,
  type GpsPoint, type SignalQuality,
} from '@/lib/kalmanGps';
import { enqueuePoint, flushQueue, attachAutoFlush, queueSize } from '@/lib/offlineGps';

export interface UseGpsTrackerOptions {
  /** When set, points are persisted to the server tied to this hiker_sessions.id */
  sessionId?: string | null;
  enabled: boolean;
}

export interface UseGpsTrackerResult {
  position: [number, number] | null;       // filtered lat/lon
  rawPath: GpsPoint[];                      // recent raw points (debug)
  filteredPath: GpsPoint[];                 // recorded breadcrumb
  distanceMeters: number;
  speedKmh: number;
  signal: SignalQuality;
  isOnline: boolean;
  pendingQueue: number;
}

export function useGpsTracker({ sessionId, enabled }: UseGpsTrackerOptions): UseGpsTrackerResult {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [filteredPath, setFilteredPath] = useState<GpsPoint[]>([]);
  const [rawPath, setRawPath] = useState<GpsPoint[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [signal, setSignal] = useState<SignalQuality>('None');
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState(0);

  const kalmanRef = useRef(new GpsKalman());
  const watchIdRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRecordedRef = useRef<GpsPoint | null>(null);
  const lastSpeedRef = useRef(0);
  const queueCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* online/offline tracking */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    attachAutoFlush();
    const on = () => { setIsOnline(true); void flushQueue().then(() => refreshQueueSize()); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const refreshQueueSize = async () => {
    try { setPendingQueue(await queueSize()); } catch { /* ignore */ }
  };

  useEffect(() => {
    queueCheckRef.current = setInterval(refreshQueueSize, 5000);
    void refreshQueueSize();
    return () => { if (queueCheckRef.current) clearInterval(queueCheckRef.current); };
  }, []);

  /* main GPS watcher */
  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }
    if (!('geolocation' in navigator)) return;

    kalmanRef.current.reset();
    lastRecordedRef.current = null;

    const onPos = (pos: GeolocationPosition) => {
      const accuracy = pos.coords.accuracy ?? null;
      const sig = classifySignal(accuracy);
      setSignal(sig);

      // Drop very poor signals to prevent ghost jumps
      if (accuracy != null && accuracy > 100) return;

      const raw: GpsPoint = {
        timestamp: pos.timestamp || Date.now(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: pos.coords.altitude,
        speed: pos.coords.speed,
        accuracy,
        heading: pos.coords.heading,
      };

      const reportedSpeed = (pos.coords.speed != null && pos.coords.speed > 0.3)
        ? pos.coords.speed : 0;
      lastSpeedRef.current = reportedSpeed;
      setSpeedKmh(reportedSpeed * 3.6);

      const filtered = kalmanRef.current.filter(raw, reportedSpeed);

      setRawPath((p) => (p.length > 200 ? [...p.slice(-150), raw] : [...p, raw]));
      setPosition([filtered.lat, filtered.lon]);

      if (shouldRecordPoint(lastRecordedRef.current, filtered, reportedSpeed)) {
        if (lastRecordedRef.current) {
          setDistanceMeters((d) => d + haversineMeters(lastRecordedRef.current!, filtered));
        }
        lastRecordedRef.current = filtered;
        setFilteredPath((p) => (p.length > 5000 ? [...p.slice(-4000), filtered] : [...p, filtered]));

        // Persist to offline queue if a session is active
        if (sessionId) {
          void enqueuePoint({
            session_id: sessionId,
            latitude: filtered.lat,
            longitude: filtered.lon,
            altitude: filtered.alt,
            accuracy: filtered.accuracy,
            speed: filtered.speed,
            heading: filtered.heading,
            timestamp: new Date(filtered.timestamp).toISOString(),
          }).then(() => {
            void flushQueue().then(refreshQueueSize);
          });
        }
      }
    };

    const onErr = (err: GeolocationPositionError) => {
      // Code 3 = TIMEOUT (very common in mountains) — keep watching silently.
      if (err.code === err.PERMISSION_DENIED) {
        setSignal('None');
      }
    };

    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);

    // adaptive heartbeat — keep things flowing even if watchPosition stalls
    const tick = () => {
      const speed = lastSpeedRef.current;
      const interval = speed > 1.5 ? 4000 : 10000; // moving vs idle
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(onPos, () => {}, opts);
      }, interval);
    };
    tick();
    const adaptiveTimer = setInterval(tick, 15000);

    return () => {
      clearInterval(adaptiveTimer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  function cleanup() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  return { position, rawPath, filteredPath, distanceMeters, speedKmh, signal, isOnline, pendingQueue };
}
