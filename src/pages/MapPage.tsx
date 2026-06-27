import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { MT_KALISUNGAN_CENTER, DEFAULT_ZOOM, TRAILS, POI, ZONES, haversineDistance, distanceToTrail } from '@/lib/map-data';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Locate, Pause, Play, AlertTriangle, ChevronLeft, ChevronRight, Layers, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import ElevationProfile from '@/components/map/ElevationProfile';
import MapLegend from '@/components/map/MapLegend';
import TrailStats from '@/components/map/TrailStats';
import TrailNavigation from '@/components/map/TrailNavigation';
import MapCompass from '@/components/map/MapCompass';
import WeatherPanel from '@/components/map/WeatherPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import SOSPanel from '@/components/core/SOSPanel';
import OfflineLayer from '@/components/map/OfflineLayer';
import HikeSummary from '@/components/map/HikeSummary';
import { HikeTracker } from '@/lib/tracking/HikeTracker';
import { downloadArea } from '@/lib/tracking/tileCache';
import type { OfflineSession } from '@/lib/offlineDb';
import type { RouteAdvice } from '@/lib/weather';
import { supabase } from '@/integrations/supabase/client';
import { useLocations } from '@/hooks/useLocations';
import type { LatLngTuple } from 'leaflet';

import 'leaflet/dist/leaflet.css';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function makeUserIcon(heading: number | null, alert: boolean) {
  const color = alert ? '#ef4444' : '#22c55e';
  const rotation = Number.isFinite(heading ?? NaN) ? heading : 0;
  return new L.DivIcon({
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${rotation}deg);">
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:18px solid ${color};filter:drop-shadow(0 1px 4px rgba(0,0,0,.45));"></div>
    </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function bearingDeg(from: [number, number], to: [number, number]) {
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const dLon = (to[1] - from[1]) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDelta(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function trailDistanceKm(path: LatLngTuple[], start: number, end: number) {
  if (path.length < 2 || start === end) return 0;
  const step = start < end ? 1 : -1;
  let d = 0;
  for (let i = start; i !== end; i += step) {
    const next = i + step;
    if (!path[i] || !path[next]) break;
    d += haversineDistance(path[i][0], path[i][1], path[next][0], path[next][1]);
  }
  return d;
}

function isSchemaCacheError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return message.includes('schema cache') || message.includes('could not find') || message.includes('column');
}

const poiIcons: Record<string, L.DivIcon> = {
  checkpoint: new L.DivIcon({ html: `<div style="width:12px;height:12px;background:#f59e0b;border:2px solid #fff;border-radius:50%;"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
  summit: new L.DivIcon({ html: `<div style="width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:3px;transform:rotate(45deg);"></div>`, className: '', iconSize: [14, 14], iconAnchor: [7, 7] }),
  camp: new L.DivIcon({ html: `<div style="width:12px;height:12px;background:#22c55e;border:2px solid #fff;border-radius:2px;"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
  water: new L.DivIcon({ html: `<div style="width:12px;height:12px;background:#3b82f6;border:2px solid #fff;border-radius:50%;"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
  viewpoint: new L.DivIcon({ html: `<div style="width:12px;height:12px;background:#a855f7;border:2px solid #fff;border-radius:50%;"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
  ranger: new L.DivIcon({ html: `<div style="width:12px;height:12px;background:#f97316;border:2px solid #fff;border-radius:2px;"></div>`, className: '', iconSize: [12, 12], iconAnchor: [6, 6] }),
};

function LocateControl({
  map,
  className,
  bottomClassName,
}: {
  map: L.Map | null;
  className?: string;
  bottomClassName?: string;
}) {
  return (
    <Button
      size="icon"
      variant="outline"
      className={className ?? `absolute right-4 z-[1000] glass-card ${bottomClassName ?? 'bottom-[7.5rem]'} md:bottom-4`}
      onClick={() => map?.locate({ setView: true, maxZoom: 17, timeout: 30000, enableHighAccuracy: true, maximumAge: 0 })}
      disabled={!map}
      aria-label="Locate me"
    >
      <Locate className="h-4 w-4" />
    </Button>
  );
}

type BaseLayer = 'street' | 'topo' | 'sat';

function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function MapLayersControl({
  value,
  onChange,
}: {
  value: BaseLayer;
  onChange: (v: BaseLayer) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        size="icon"
        variant="outline"
        className="glass-card"
        onClick={() => setOpen((v) => !v)}
        aria-label="Map layers"
        aria-expanded={open}
      >
        <Layers className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute bottom-12 right-0 w-40 glass-card-strong rounded-lg p-2 border border-border/40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 pb-1">
            Layers
          </div>
          {(
            [
              { id: 'street', label: 'Street' },
              { id: 'topo', label: 'Topographic' },
              { id: 'sat', label: 'Satellite' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                value === opt.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Snap user position to nearest point on selected trail
function findNearestTrailIndex(userPos: [number, number], trailPath: L.LatLngTuple[]): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < trailPath.length; i++) {
    const d = haversineDistance(userPos[0], userPos[1], trailPath[i][0], trailPath[i][1]);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return minIdx;
}

export default function MapPage() {
  const [tracking, setTracking] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Street map only (other layers removed by design)
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [displayPos, setDisplayPos] = useState<[number, number] | null>(null);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [wrongDirection, setWrongDirection] = useState(false);
  const [offTrail, setOffTrail] = useState(false);
  const [gpsSignal, setGpsSignal] = useState<'Strong' | 'Medium' | 'Weak' | 'None'>('None');
  const [selectedTrail, setSelectedTrail] = useState(0);
  const [offlineReady, setOfflineReady] = useState(false);
  const [userTrailProgress, setUserTrailProgress] = useState<number | undefined>(undefined);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isGpsTestMode, setIsGpsTestMode] = useState(false);
  type FilteredPoint = { lat: number; lon: number; };
  const [rawGpsPoints, setRawGpsPoints] = useState<RecordedPoint[]>([]);
  const [filteredPath, setFilteredPath] = useState<FilteredPoint[]>([]);

  const [recordedPoints, setRecordedPoints] = useState<RecordedPoint[]>([]);
  const [recordingPreviewReady, setRecordingPreviewReady] = useState(false);
  const recordWatchRef = useRef<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { role, user } = useAuth();
  const { activeLocationId, locations } = useLocations();
  const isTrailRecorder = role === 'ranger' || role === 'guide' || role === 'admin' || role === 'super_admin';



  // Kalman Filter State for high-accuracy movement tracking
  const kalmanStateRef = useRef<{
    lat: number;
    lon: number;
    variance: number; // Error covariance
    lastTimestamp: number;
  } | null>(null);

  // Offline-first session tracker (parallel to legacy GPS UI)
  const trackerRef = useRef<HikeTracker | null>(null);
  const trackerUnsubRef = useRef<(() => void) | null>(null);
  const [summarySession, setSummarySession] = useState<OfflineSession | null>(null);
  const [trackingPhase, setTrackingPhase] = useState<'ascent' | 'peak' | 'descent' | 'completed'>('ascent');
  const [tileDownloadProgress, setTileDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dbTrails, setDbTrails] = useState<typeof TRAILS>([]);
  

  // Smooth interpolation for the hiker marker
  useEffect(() => {
    if (!userPos) return;
    if (!displayPos) {
      setDisplayPos(userPos);
      return;
    }

    let frameId: number;
    const startPos = displayPos;
    const endPos = userPos;
    const startTime = performance.now();
    const duration = 1000; // Interpolate over 1 second (typical GPS interval)

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Simple linear interpolation
      const lat = startPos[0] + (endPos[0] - startPos[0]) * progress;
      const lng = startPos[1] + (endPos[1] - startPos[1]) * progress;

      setDisplayPos([lat, lng]);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [userPos]);

  type RecordedPoint = {
    timestamp: number;
    lat: number;
    lon: number;
    alt?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    heading?: number | null;
  };

  /**
   * Dynamic Kalman Filter for GPS smoothing.
   * Adjusts filtering based on speed and GPS accuracy for more intelligent path tracking.
   */
  const applyKalmanFilter = useCallback((raw: RecordedPoint, speed: number): RecordedPoint => {
    const minAccuracy = 1.0;
    
    // Dynamically adjust process noise based on speed. Higher speed = more movement expected.
    const speedMps = speed / 3.6;
    const processNoise = 0.0000001 + (speedMps * 0.0000005);

    if (!kalmanStateRef.current) {
      kalmanStateRef.current = {
        lat: raw.lat,
        lon: raw.lon,
        variance: (raw.accuracy || 10) ** 2, // Use variance, not std deviation
        lastTimestamp: raw.timestamp
      };
      return raw;
    }

    const state = kalmanStateRef.current;
    const dt = (raw.timestamp - state.lastTimestamp) / 1000.0;
    if (dt <= 0) return { ...raw, lat: state.lat, lon: state.lon };

    // Dynamically adjust measurement noise based on GPS accuracy.
    const measurementNoise = Math.max(raw.accuracy || 10, minAccuracy) ** 2;

    // Prediction Step
    const predictedVariance = state.variance + processNoise * dt;

    // Update Step (Kalman Gain)
    const kalmanGain = predictedVariance / (predictedVariance + measurementNoise);

    // New State
    const filteredLat = state.lat + kalmanGain * (raw.lat - state.lat);
    const filteredLon = state.lon + kalmanGain * (raw.lon - state.lon);
    const filteredVariance = (1 - kalmanGain) * predictedVariance;

    kalmanStateRef.current = {
      lat: filteredLat,
      lon: filteredLon,
      variance: filteredVariance,
      lastTimestamp: raw.timestamp
    };

    return { ...raw, lat: filteredLat, lon: filteredLon };
  }, []);

  const speedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      let q: any = supabase
        .from('trail_zones' as any)
        .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,status')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (activeLocationId) q = q.eq('location_id', activeLocationId);
      const { data } = await q;
      if (!active) return;
      const loaded = ((data as any[]) ?? [])
        .map((trail, index) => {
          const coords = Array.isArray(trail.coordinates_json) ? trail.coordinates_json : [];
          const path = coords
            .map((p: any) => [Number(p.lat), Number(p.lng)] as [number, number])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
          if (path.length < 2) return null;
          let distanceKm = 0;
          for (let i = 1; i < path.length; i++) {
            distanceKm += haversineDistance(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
          }
          const colors = ['#16a34a', '#2563eb', '#dc2626', '#9333ea', '#ea580c'];
          return {
            name: trail.name || `Official Trail ${index + 1}`,
            difficulty: (trail.difficulty || 'moderate') as 'easy' | 'moderate' | 'hard',
            color: colors[index % colors.length],
            elevation: `${Number(trail.elevation_meters || 0)}m`,
            distance: `${distanceKm.toFixed(1)} km`,
            path,
          };
        })
        .filter(Boolean) as typeof TRAILS;
      setDbTrails(loaded);
    })();
    return () => { active = false; };
  }, [activeLocationId]);

  const availableTrails = dbTrails.length > 0 ? dbTrails : TRAILS;

  useEffect(() => {
    if (selectedTrail >= availableTrails.length) setSelectedTrail(0);
  }, [availableTrails.length, selectedTrail]);

  useEffect(() => {
    if (!mapInstance) return;
    const onFound = (e: L.LocationEvent) => {
      const next: [number, number] = [e.latlng.lat, e.latlng.lng];
      setUserPos(next);
      setDisplayPos(next);
      setGpsSignal(e.accuracy <= 12 ? 'Strong' : e.accuracy <= 50 ? 'Medium' : 'Weak');
      mapInstance.setView(next, Math.max(mapInstance.getZoom(), 17));
    };
    const onError = (e: L.ErrorEvent) => {
      toast.error(e.message || 'Unable to locate you. Check phone location permission.');
    };
    mapInstance.on('locationfound', onFound);
    mapInstance.on('locationerror', onError);
    return () => {
      mapInstance.off('locationfound', onFound);
      mapInstance.off('locationerror', onError);
    };
  }, [mapInstance]);

  const startTracking = useCallback(async () => {
    setTracking(true);
    if (user && !trackerRef.current) {
      let { data: activeSession, error: activeSessionError } = await supabase
        .from('hiker_sessions' as any)
        .select('id,booking_id,trail_zone_id,location_id,start_time,tracking_phase')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeSessionError && isSchemaCacheError(activeSessionError)) {
        const fallback = await supabase
          .from('hiker_sessions' as any)
          .select('id,booking_id,trail_zone_id,start_time')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeSession = fallback.data;
        activeSessionError = fallback.error;
      }
      if (activeSessionError) {
        toast.error(`Unable to check active session: ${activeSessionError.message}`);
        setTracking(false);
        return;
      }

      const participantRole =
        role === 'guide' || role === 'ranger' || role === 'admin' || role === 'super_admin'
          ? role === 'super_admin' ? 'admin' : role
          : 'hiker';
      const sessionLocationId = activeSession?.location_id ?? activeLocationId ?? locations[0]?.id ?? null;

      if (!activeSession) {
        let { data: created, error } = await supabase
          .from('hiker_sessions' as any)
          .insert({
            user_id: user.id,
            location_id: sessionLocationId,
            participant_role: participantRole,
            tracking_phase: 'ascent',
            start_time: new Date().toISOString(),
            status: 'active',
            total_distance_km: 0,
          })
          .select('id,booking_id,trail_zone_id,location_id,start_time,tracking_phase')
          .single();
        if (error && isSchemaCacheError(error)) {
          const fallback = await supabase
            .from('hiker_sessions' as any)
            .insert({
              user_id: user.id,
              start_time: new Date().toISOString(),
              status: 'active',
              total_distance_km: 0,
            })
            .select('id,booking_id,trail_zone_id,start_time')
            .single();
          created = fallback.data;
          error = fallback.error;
        }
        if (error) {
          toast.error(`Unable to start live session: ${error.message}`);
          setTracking(false);
          return;
        }
        activeSession = created;
      }

      const tr = await HikeTracker.createOrResume({
        userId: user.id,
        serverSessionId: activeSession?.id ?? null,
        bookingId: activeSession?.booking_id ?? null,
        trailZoneId: activeSession?.trail_zone_id ?? null,
        locationId: activeSession?.location_id ?? sessionLocationId,
        participantRole,
      });
      trackerRef.current = tr;
      trackerUnsubRef.current?.();
      trackerUnsubRef.current = tr.subscribe((snap) => {
        setTrackingPhase(snap.phase);
        setElapsed(snap.elapsedSec);
        setDistance(snap.distanceM / 1000);
        setFilteredPath(snap.path.map((p) => ({ lat: p.lat, lon: p.lng })));
        if (snap.lastFix) {
          setUserPos([snap.lastFix.lat, snap.lastFix.lng]);
          setGpsSignal(snap.lastFix.accuracy <= 10 ? 'Strong' : snap.lastFix.accuracy <= 30 ? 'Medium' : 'Weak');
        }
      });
      void tr.start().catch((e) => console.warn('HikeTracker start failed', e));
    }
  }, [activeLocationId, locations, role, user]);

  // Weather-aware routing: if 'avoid', recommend an easier trail.
  const lastAdviceRef = useRef<string | null>(null);
  const handleWeatherAdvice = useCallback((advice: RouteAdvice) => {
    const key = `${advice.level}:${advice.headline}`;
    if (lastAdviceRef.current === key) return;
    lastAdviceRef.current = key;
    if (advice.level === 'avoid') {
      toast.error(advice.headline, { description: advice.reasons[0], duration: 8000 });
      // Switch to easiest trail
      const easyIdx = availableTrails.findIndex((t) => t.difficulty === 'easy');
      if (easyIdx >= 0) setSelectedTrail(easyIdx);
    } else if (advice.level === 'caution') {
      toast.warning(advice.headline, { description: advice.reasons[0], duration: 6000 });
    }
  }, [availableTrails]);

  // Auto-start tracking when admin checks in the hiker (?auto=1)
  const [searchParams, setSearchParams] = useSearchParams();
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (searchParams.get('auto') !== '1') return;
    if (!user) return;
    autoStartedRef.current = true;
    toast.success('Check-in confirmed — tracking started.');
    startTracking();
    const next = new URLSearchParams(searchParams);
    next.delete('auto');
    setSearchParams(next, { replace: true });
  }, [searchParams, user, startTracking, setSearchParams]);



  const handleNewPosition = useCallback((pos: GeolocationPosition) => {
      // Step 1: GPS Signal Quality Filter
      const accuracy = pos.coords.accuracy;
      const signal: typeof gpsSignal = accuracy <= 10 ? 'Strong' : accuracy <= 30 ? 'Medium' : 'Weak';
      setGpsSignal(signal);

      if (signal === 'Weak') {
        console.warn(`GPS signal is weak (accuracy: ${accuracy}m), discarding point.`);
        return; // Discard points with weak signal
      }

      // Velocity-gating: If accuracy is poor (> 20m) and speed is zero, skip update
      if (pos.coords.accuracy > 20 && (pos.coords.speed === 0 || pos.coords.speed == null)) {
        return;
      }

      const raw: RecordedPoint = {
        timestamp: Date.now(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        alt: pos.coords.altitude,
      };
      setRawGpsPoints(prev => [...prev, raw]);

      const rawSpeed = pos.coords.speed != null && pos.coords.speed > 0.3 ? pos.coords.speed * 3.6 : 0;
      const heading = pos.coords.heading;
      if (heading != null && Number.isFinite(heading)) setCurrentHeading(heading);
      
      const filtered = applyKalmanFilter(raw, rawSpeed);
      const newPos: [number, number] = [filtered.lat, filtered.lon];
      
      // Update current speed with dead-zone (reported in m/s, convert to km/h)
      setCurrentSpeed(rawSpeed);

      // Clear any pending "set to zero" timeout
      if (speedTimeoutRef.current) clearTimeout(speedTimeoutRef.current);
      if (rawSpeed > 0) {
        // If no speed update for 4 seconds, assume stopped
        speedTimeoutRef.current = setTimeout(() => setCurrentSpeed(0), 4000);
      }

      setUserPos(newPos);
      setFilteredPath((prev) => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const d = haversineDistance(last.lat, last.lon, newPos[0], newPos[1]);
          
          // Step 3: Distance Thresholding
          // If moving > 3m and speed > 1km/h, or a large jump (> 50m)
          if ((d > 0.003 && rawSpeed > 1.0) || d > 0.05) {
            setDistance((old) => old + d);
            return [...prev, { lat: newPos[0], lon: newPos[1] }];
          }
          return prev;
        }
        return [{ lat: newPos[0], lon: newPos[1] }];
      });

      // Track progress along selected trail
      const activePath = availableTrails[selectedTrail]?.path ?? availableTrails[0].path;
      const idx = findNearestTrailIndex(newPos, activePath);
      setUserTrailProgress(idx);

      // Check if off-trail (> 100m from nearest trail point)
      const minDist = distanceToTrail(newPos[0], newPos[1], activePath);
      const targetIdx = trackingPhase === 'descent'
        ? Math.max(0, idx - 1)
        : Math.min(activePath.length - 1, idx + 1);
      const expectedBearing = activePath[targetIdx] ? bearingDeg(newPos, activePath[targetIdx]) : null;
      const facingWrongWay = expectedBearing != null && heading != null && rawSpeed > 1 && angleDelta(heading, expectedBearing) > 110;
      setWrongDirection(!isGpsTestMode && (minDist > 0.1 || facingWrongWay));
      if (!isGpsTestMode && minDist > 0.1) {
        setOffTrail(true);
        toast.warning('You are off the marked trail!', { id: 'off-trail' });
      } else if (!isGpsTestMode && facingWrongWay) {
        toast.warning('Your direction looks away from the route.', { id: 'wrong-direction' });
      } else {
        setOffTrail(false);
      }
    }, [selectedTrail, applyKalmanFilter, isGpsTestMode, availableTrails, trackingPhase]);

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      toast.error('GPS Error: Location permission denied.');
      stopTracking();
    } else if (err.code !== 3) { // Ignore timeout errors, they are frequent
      toast.error(`GPS Error: ${err.message}`);
    } else {
      console.warn('GPS Timeout: Still waiting for signal...');
    }
  }, []);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tracking) return;

    const adjustPollingRate = (speedKmh: number) => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      
      const interval = speedKmh > 5 ? 3000 : 8000; // 3s if fast, 8s if slow
      
      pollingIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(handleNewPosition, handleError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
      }, interval);
    };

    adjustPollingRate(currentSpeed || 0);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [tracking, currentSpeed, handleNewPosition]);

  const stopTracking = () => {
    setTracking(false);
    setGpsSignal('None');
    const tr = trackerRef.current;
    if (tr) {
      trackerUnsubRef.current?.();
      trackerUnsubRef.current = null;
      trackerRef.current = null;
      void tr.stop().then((sess) => setSummarySession(sess)).catch((e) => console.warn('HikeTracker stop failed', e));
    }
  };

  const markPeakReached = () => {
    const tr = trackerRef.current;
    if (!tr) {
      toast.error('Start tracking before marking the peak.');
      return;
    }
    void tr.markPeak().then(() => {
      setTrackingPhase('peak');
      toast.success('Peak marked. Your ascent is saved.');
    });
  };

  const startDescentTracking = () => {
    const tr = trackerRef.current;
    if (!tr) {
      toast.error('Start tracking before descent.');
      return;
    }
    void tr.startDescent().then(() => {
      setTrackingPhase('descent');
      toast.success('Descent tracking started.');
    });
  };

  useEffect(() => {
    if (tracking) {
      if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
      setRawGpsPoints([]);
      setCurrentSpeed(0);
      kalmanStateRef.current = null;
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [tracking]);

  const handleOfflineCache = async () => {
    toast.info('Downloading map tiles for offline use…');
    setTileDownloadProgress({ done: 0, total: 0 });
    try {
      const tpl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const res = await downloadArea({
        centerLat: 14.1475, centerLng: 121.3454,
        zMin: 13, zMax: 16, radiusTiles: 4,
        template: tpl,
        onProgress: (done, total) => setTileDownloadProgress({ done, total }),
      });
      setOfflineReady(true);
      toast.success(`Cached ${res.downloaded} map tiles offline`);
    } catch {
      toast.error('Failed to cache tiles.');
    } finally {
      setTileDownloadProgress(null);
    }
  };

  const currentTrail = availableTrails[selectedTrail] ?? availableTrails[0];
  const currentProgressIndex = userTrailProgress ?? 0;
  const remainingDistanceKm = trackingPhase === 'descent'
    ? trailDistanceKm(currentTrail.path, currentProgressIndex, 0)
    : trailDistanceKm(currentTrail.path, currentProgressIndex, currentTrail.path.length - 1);
  const avgPace = elapsed > 0 && distance > 0 ? (elapsed / 60) / distance : 0;
  const realTimePace = currentSpeed && currentSpeed > 0 ? 60 / currentSpeed : 0;
  const displayPace = realTimePace > 0 ? realTimePace : avgPace;
  const etaMinutes = remainingDistanceKm > 0 && displayPace > 0 ? Math.round(remainingDistanceKm * displayPace) : null;
  const userOrientationIcon = useMemo(() => makeUserIcon(currentHeading, wrongDirection || offTrail), [currentHeading, wrongDirection, offTrail]);

  useEffect(() => {
    // keep the map clean by default on mobile when switching trails
    setMobileControlsOpen(false);
  }, [selectedTrail]);

  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setRecordedPoints([]);
    setRecordingPreviewReady(false);
    kalmanStateRef.current = null; // Reset Kalman filter
    setIsRecording(true);
    toast.info('Locating you. Keep the phone outside or near open sky for best trail accuracy.');

    const handleNewRecordPoint = (pos: GeolocationPosition) => {
      // Step 1: GPS Signal Quality Filter
      const accuracy = pos.coords.accuracy;
      const signal: typeof gpsSignal = accuracy <= 12 ? 'Strong' : accuracy <= 50 ? 'Medium' : 'Weak';
      setGpsSignal(signal);

      const rawSpeed = pos.coords.speed != null && pos.coords.speed > 0.3 ? pos.coords.speed * 3.6 : 0;
      const isPoorAccuracy = accuracy > 75;
      
      const raw: RecordedPoint = {
        timestamp: Date.now(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: pos.coords.altitude,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
      };

      setUserPos([raw.lat, raw.lon]);
      setDisplayPos([raw.lat, raw.lon]);
      if (isPoorAccuracy) {
        setRecordedPoints((prev) => (prev.length === 0 ? [raw] : prev));
        return;
      }

      const filtered = applyKalmanFilter(raw, rawSpeed);
      setUserPos([filtered.lat, filtered.lon]);
      setDisplayPos([filtered.lat, filtered.lon]);
      if (mapInstance) mapInstance.setView([filtered.lat, filtered.lon], Math.max(mapInstance.getZoom(), 17));

      setRecordedPoints((prev) => {
        if (prev.length === 0) return [filtered];

        const last = prev[prev.length - 1];
        const dist = haversineDistance(last.lat, last.lon, filtered.lat, filtered.lon) * 1000;
        const dt = filtered.timestamp - last.timestamp;

        if (dist >= 2.5 || (dist >= 1 && dt >= 10_000) || dt >= 30_000) {
          return [...prev, filtered];
        }

        // Update speed for real-time display even if stationary
        if (filtered.speed != null) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], speed: isStationary ? 0 : filtered.speed };
          return updated;
        }

        return prev;
      });
    };

    const handleRecordError = (err: GeolocationPositionError) => {
      if (err.code !== 3) {
        toast.error(`Recording Error: ${err.message}`);
      } else {
        console.warn('Recording GPS Timeout: Still waiting...');
      }
    };

    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };

    navigator.geolocation.getCurrentPosition(handleNewRecordPoint, handleRecordError, options);
    recordWatchRef.current = navigator.geolocation.watchPosition(handleNewRecordPoint, handleRecordError, options);

    // High-frequency polling heartbeat for recording (every 1s)
    const pollingInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(handleNewRecordPoint, () => {}, options);
    }, 1000);

    // Store polling interval in a ref
    (recordWatchRef as any).polling = pollingInterval;
  }, [applyKalmanFilter, mapInstance]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setGpsSignal('None');
    if (recordWatchRef.current != null) {
      navigator.geolocation.clearWatch(recordWatchRef.current);
      if ((recordWatchRef as any).polling) clearInterval((recordWatchRef as any).polling);
      recordWatchRef.current = null;
    }
    setRecordingPreviewReady(recordedPoints.length > 1);
    if (mapInstance && recordedPoints.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(recordedPoints.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40] });
    }
    if (recordedPoints.length > 1) {
      let previewMeters = 0;
      for (let i = 1; i < recordedPoints.length; i++) {
        previewMeters += haversineDistance(recordedPoints[i - 1].lat, recordedPoints[i - 1].lon, recordedPoints[i].lat, recordedPoints[i].lon) * 1000;
      }
      const previewDurationSec = Math.round((recordedPoints[recordedPoints.length - 1].timestamp - recordedPoints[0].timestamp) / 1000);
      const distanceLabel = previewMeters < 1000 ? `${previewMeters.toFixed(0)} m` : `${(previewMeters / 1000).toFixed(2)} km`;
      const minutes = Math.floor(previewDurationSec / 60);
      const seconds = previewDurationSec % 60;
      toast.success(`Recording stopped. Preview ready: ${distanceLabel} over ${minutes}:${String(seconds).padStart(2, '0')}.`);
    } else {
      toast.warning('No walking trail recorded yet. Move outdoors and try again.');
    }
  }, [mapInstance, recordedPoints]);

  useEffect(() => {
    return () => {
      trackerUnsubRef.current?.();
      trackerUnsubRef.current = null;
      if (recordWatchRef.current != null) {
        navigator.geolocation.clearWatch(recordWatchRef.current);
      }
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      // turning on recording turns off accuracy test for now
      setIsGpsTestMode(false);
      startRecording();
    }
  };

  const toggleGpsTestMode = () => {
    if (isGpsTestMode) {
      setIsGpsTestMode(false);
      stopRecording(); // Stop the recording when exiting test mode
    } else {
      if (isRecording) stopRecording(); // Ensure normal recording is stopped first
      setIsGpsTestMode(true);
      startRecording(); // Use the recording engine for testing
    }
  };

  const saveRecordedRouteDraft = async () => {
    if (!user || recordedPoints.length < 2) {
      toast.error('Record at least two GPS points before saving a route.');
      return;
    }
    const locationId = activeLocationId ?? locations[0]?.id;
    if (!locationId) {
      toast.error('No trail location is available for this route.');
      return;
    }
    const path = recordedPoints.map((p) => ({ lat: p.lat, lng: p.lon }));
    const baseRoute = {
      location_id: locationId,
      name: `${currentTrail.name} recorded ${new Date().toLocaleDateString('en-PH')}`,
      description: `GPS draft recorded by ${role ?? 'staff'} for admin review. Distance ${formatDistance(recordDistanceMeters)}.`,
      difficulty: currentTrail.difficulty,
      elevation_meters: Number.parseInt(currentTrail.elevation, 10) || 0,
      coordinates_json: path,
      status: 'draft',
      max_capacity: 50,
    };
    let { error } = await supabase.from('trail_zones' as any).insert({
      ...baseRoute,
      recorded_by: user.id,
      source: 'gps_recording',
      review_status: 'pending',
      is_official: false,
    });
    if (error && isSchemaCacheError(error)) {
      const fallback = await supabase.from('trail_zones' as any).insert(baseRoute);
      error = fallback.error;
    }
    if (error) {
      toast.error(`Failed to save route draft: ${error.message}`);
      return;
    }
    toast.success('Route draft saved for admin review.');
  };

  const recordDistanceMeters = useMemo(() => {
    if (recordedPoints.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < recordedPoints.length; i++) {
      d += haversineDistance(
        recordedPoints[i - 1].lat,
        recordedPoints[i - 1].lon,
        recordedPoints[i].lat,
        recordedPoints[i].lon
      ) * 1000;
    }
    return d;
  }, [recordedPoints]);

  const recordDurationSec = useMemo(() => {
    if (recordedPoints.length < 2) return 0;
    const start = recordedPoints[0].timestamp;
    const end = recordedPoints[recordedPoints.length - 1].timestamp;
    return Math.round((end - start) / 1000);
  }, [recordedPoints]);

  const recordSpeedKmh = useMemo(() => {
    if (recordedPoints.length === 0) return 0;

    const lastPoint = recordedPoints[recordedPoints.length - 1];

    // Real-time: Use the most recent reported speed if fresh (within 4s)
    if (lastPoint.speed != null && lastPoint.speed >= 0 && (Date.now() - lastPoint.timestamp < 4000)) {
      return lastPoint.speed * 3.6;
    }

    // Fallback: calculate from last few points (windowed for stability)
    if (recordedPoints.length < 2) return 0;
    const pointsToUse = recordedPoints.slice(-3); // smaller window for more "real-time" feel
    const first = pointsToUse[0];
    const last = pointsToUse[pointsToUse.length - 1];
    const d = haversineDistance(first.lat, first.lon, last.lat, last.lon) * 1000;
    const t = (last.timestamp - first.timestamp) / 1000;

    if (t <= 0 || d < 0.5) return 0; // Ignore tiny movements for speed
    return (d / t) * 3.6;
  }, [recordedPoints]);

  const formatDistance = (m: number) => {
    if (m < 1000) return `${m.toFixed(0)} m`;
    return `${(m / 1000).toFixed(2)} km`;
  };

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className={`h-screen pt-16 flex flex-col ${mobileControlsOpen ? 'map-mobile-controls-open' : ''}`}>
      {/* Desktop/tablet top bar */}
      <div className="hidden md:block">
        <TrailStats
          distance={distance}
          elapsed={elapsed}
          currentSpeed={currentSpeed}
          gpsSignal={gpsSignal}
          selectedTrail={selectedTrail}
          offTrail={offTrail}
          tracking={tracking}
          offlineReady={offlineReady}
          trailName={currentTrail.name}
          trailColor={currentTrail.color}
          phase={trackingPhase}
          remainingKm={remainingDistanceKm}
          etaMinutes={etaMinutes}
          wrongDirection={wrongDirection}
          onMarkPeak={markPeakReached}
          onStartDescent={startDescentTracking}
          onStartTracking={startTracking}
          onStopTracking={stopTracking}
          onOfflineCache={handleOfflineCache}
        />
      </div>

      {isTrailRecorder && (
        <div className="hidden md:flex justify-end items-center gap-2 px-4 py-2">
          <Button
            size="sm"
            variant={isRecording ? 'destructive' : 'outline'}
            className="gap-1"
            onClick={toggleRecording}
          >
            {isRecording ? 'Stop Recording' : 'Record Trail'}
          </Button>
          <Button
            size="sm"
            variant={isGpsTestMode ? 'secondary' : 'ghost'}
            className="gap-1"
            onClick={toggleGpsTestMode}
          >
            Test GPS Accuracy
          </Button>
          {recordedPoints.length > 1 && !isRecording && !isGpsTestMode && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={saveRecordedRouteDraft}
            >
              Save Route Draft
            </Button>
          )}
        </div>
      )}

      {/* Desktop/tablet trail selector */}
      <div className="hidden md:flex glass-card border-b border-border/30 px-4 py-2 items-center gap-2 overflow-x-auto">
        {availableTrails.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setSelectedTrail(i)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedTrail === i ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={selectedTrail === i ? { backgroundColor: t.color } : {}}
          >
            {t.name} • {t.distance} • {t.elevation}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <ErrorBoundary title="Map failed to render">
          <MapContainer
            center={MT_KALISUNGAN_CENTER}
            zoom={DEFAULT_ZOOM}
            maxZoom={20}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
            ref={mapRef as any}
            whenReady={() => {}}
          >
            <MapInstanceBridge onReady={setMapInstance} />
            <OfflineLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} attribution="© OpenStreetMap" />


            {availableTrails.map((t, i) => (
              <Polyline
                key={t.name}
                positions={t.path}
                pathOptions={{
                  color: t.color,
                  weight: i === selectedTrail ? 6 : 3,
                  opacity: i === selectedTrail ? 1 : 0.4,
                }}
              />
            ))}

            {recordedPoints.length > 1 && (
              <Polyline
                positions={recordedPoints.map((p) => [p.lat, p.lon] as [number, number])}
                pathOptions={{ color: '#f97316', weight: 5, opacity: 0.95, dashArray: isRecording ? '4 8' : undefined }}
              />
            )}

            <Marker
              position={currentTrail.path[0]}
              icon={new L.DivIcon({
                html: `<div style="width:18px;height:18px;background:${currentTrail.color};border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px ${currentTrail.color}80;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:bold;">S</div>`,
                className: '',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup><strong>Start: {currentTrail.name}</strong></Popup>
            </Marker>
            <Marker
              position={currentTrail.path[currentTrail.path.length - 1]}
              icon={new L.DivIcon({
                html: `<div style="width:18px;height:18px;background:${currentTrail.color};border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px ${currentTrail.color}80;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:bold;">E</div>`,
                className: '',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Popup><strong>End: {currentTrail.name}</strong></Popup>
            </Marker>

            {ZONES.map((z) => (
              <Polygon key={z.name} positions={z.positions} pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: 0.15, weight: 2, dashArray: '5 5' }}>
                <Popup><strong>{z.name}</strong></Popup>
              </Polygon>
            ))}

            {POI.map((p) => (
              <Marker key={p.name} position={p.pos} icon={poiIcons[p.type] || poiIcons.checkpoint}>
                <Popup><strong>{p.name}</strong><br /><span className="capitalize">{p.type}</span></Popup>
              </Marker>
            ))}

            {/* User Location Hiker Marker */}
            {(displayPos || userPos) && (
              <>
                <Marker position={displayPos || userPos!} icon={userOrientationIcon}>
                  <Popup>
                    Your Position<br />
                    {wrongDirection ? 'Direction warning' : trackingPhase}
                  </Popup>
                </Marker>
                <Circle center={displayPos || userPos!} radius={15} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.15 }} />
              </>
            )}

            {filteredPath.length > 1 && (
              <Polyline positions={filteredPath.map(p => [p.lat, p.lon] as [number, number])} pathOptions={{ color: '#22c55e', weight: 5 }} />
            )}

            {/* Raw GPS data for debugging (optional) */}
            {/* {rawGpsPoints.length > 1 && (
              <Polyline positions={rawGpsPoints.map(p => [p.lat, p.lon])} pathOptions={{ color: '#f97316', weight: 2, dashArray: '5, 10' }} />
            )} */}
          </MapContainer>
        </ErrorBoundary>

        {/* Turn-by-turn navigation overlay */}
        <div className="absolute top-4 left-4 z-[1000] w-[calc(100%-7.5rem)] md:w-72">
          <TrailNavigation
            trailPath={currentTrail.path}
            trailName={currentTrail.name}
            trailColor={currentTrail.color}
            userPos={userPos}
            tracking={tracking}
            userTrailProgress={userTrailProgress}
          />
        </div>

        {/* Route recording / accuracy badge + stopped preview */}
        {isTrailRecorder && (isRecording || isGpsTestMode || recordingPreviewReady) && (
          <div className="absolute top-24 left-4 z-[1000] glass-card rounded-lg px-3 py-2 text-xs flex flex-col gap-2 max-w-xs">
            <div className="font-semibold">
              {isGpsTestMode ? 'Accuracy Test Active' : recordingPreviewReady && !isRecording ? 'Recorded Trail Preview' : 'Recording Trail'}
            </div>
            <div className="flex flex-wrap gap-3 text-muted-foreground">
              <span>Dist: <span className="text-foreground font-medium">{formatDistance(recordDistanceMeters)}</span></span>
              <span>Time: <span className="text-foreground font-medium">{formatDuration(recordDurationSec)}</span></span>
              <span>Points: <span className="text-foreground font-medium">{recordedPoints.length}</span></span>
              <span>Speed: <span className="text-foreground font-medium">
                {recordSpeedKmh > 0 ? `${recordSpeedKmh.toFixed(1)} km/h` : '--'}
              </span></span>
            </div>
            {recordingPreviewReady && !isRecording && (
              <Button size="sm" className="h-7 text-xs" onClick={saveRecordedRouteDraft}>
                Save Route Draft
              </Button>
            )}
          </div>
        )}

        {/* Compass */}
        <div className="absolute top-24 right-4 md:top-4 md:right-16 z-[1000] w-24">
          <MapCompass userPos={userPos} />
        </div>

        {/* SOS compact button — bottom-left above mobile controls */}
        <div className="absolute bottom-[7.5rem] md:bottom-[11rem] left-4 z-[1100]">
          <SOSPanel compact />
        </div>

        {/* Desktop right-side stack: layers + elevation + locate */}
        <div className="hidden md:flex absolute right-4 bottom-4 z-[1100] flex-col items-end gap-2">
          <WeatherPanel lat={MT_KALISUNGAN_CENTER[0]} lng={MT_KALISUNGAN_CENTER[1]} onAdvice={handleWeatherAdvice} />
          <ElevationProfile
            trailPath={currentTrail.path}
            trailName={currentTrail.name}
            trailColor={currentTrail.color}
            userProgress={userTrailProgress}
          />
          <LocateControl map={mapInstance} className="glass-card" />
        </div>

        {/* Desktop legend */}
        <MapLegend className="absolute bottom-44 left-4 z-[1000] hidden md:block" />

        {/* Mobile legend toggle (other side) */}
        <div
          className={`md:hidden absolute left-4 z-[1100] flex flex-col items-start gap-2 ${
            mobileControlsOpen ? 'bottom-[14.5rem]' : 'bottom-[6.5rem]'
          }`}
        >
          {!legendOpen ? (
            <Button
              size="icon"
              variant="outline"
              className="glass-card"
              onClick={() => setLegendOpen(true)}
              aria-label="Open legend"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="relative">
              <MapLegend className="w-56" />
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                aria-label="Close legend"
                className="absolute -left-2 -top-2 h-7 w-7 rounded-full glass-card flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile right-side stack: ONLY 3 controls (layers, elevation, locate) */}
        <div
          className={`md:hidden absolute right-4 z-[1100] flex flex-col items-end gap-2 ${
            mobileControlsOpen ? 'bottom-[14.5rem]' : 'bottom-[6.5rem]'
          }`}
        >
          <WeatherPanel lat={MT_KALISUNGAN_CENTER[0]} lng={MT_KALISUNGAN_CENTER[1]} onAdvice={handleWeatherAdvice} />
          <ElevationProfile
            trailPath={currentTrail.path}
            trailName={currentTrail.name}
            trailColor={currentTrail.color}
            userProgress={userTrailProgress}
          />
          <LocateControl map={mapInstance} className="glass-card" />
        </div>

        {/* Mobile bottom controls (collapsible) */}
        <div className="md:hidden absolute bottom-4 left-4 right-4 z-[1000]">
          <div className="glass-card-strong rounded-lg overflow-hidden">
            <div
              onClick={() => setMobileControlsOpen((v) => !v)}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors"
              aria-expanded={mobileControlsOpen}
              aria-label={mobileControlsOpen ? 'Collapse controls' : 'Expand controls'}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setMobileControlsOpen((v) => !v);
              }}
            >
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold truncate" style={{ color: currentTrail.color }}>
                    {currentTrail.name}
                  </div>
                  {offTrail && (
                    <div className="inline-flex items-center gap-1 text-destructive text-xs animate-pulse">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Off</span>
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground flex gap-3">
                  <span>
                    <span className="text-foreground font-semibold">{distance.toFixed(2)}</span> km
                  </span>
                  <span>
                    <span className="text-foreground font-semibold">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
                  </span>
                  <span>
                    <span className="text-foreground font-semibold">{displayPace > 0 ? displayPace.toFixed(1) : '--'}</span> min/km
                  </span>
                  <span>
                    <span className="text-foreground font-semibold">{remainingDistanceKm.toFixed(2)}</span> km left
                  </span>

                </div>
                <div className="text-[10px] text-muted-foreground">
                  <span className="capitalize text-primary font-semibold">{trackingPhase}</span>
                  <span> ETA {etaMinutes == null ? '--' : `${etaMinutes}m`}</span>
                  {wrongDirection && <span className="text-destructive font-semibold"> Wrong direction</span>}
                </div>
                {gpsSignal !== 'None' && (
                  <div className="text-[10px] text-muted-foreground">
                    GPS Signal: <span className={gpsSignal === 'Strong' ? 'text-success' : gpsSignal === 'Medium' ? 'text-warning' : 'text-destructive'}>{gpsSignal}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOfflineCache(); }}
                  aria-label={offlineReady ? 'Map downloaded for offline use' : 'Download map for offline use'}
                  disabled={offlineReady}
                >
                  {offlineReady ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                </Button>
                {tracking ? (
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopTracking(); }}
                    aria-label="Stop tracking"
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); startTracking(); }}
                    aria-label="Start hike"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <div className="text-muted-foreground pl-1">
                  {mobileControlsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </div>
              </div>
            </div>

            {mobileControlsOpen && (
              <div className="border-t border-border/30 px-3 py-2 space-y-2">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {availableTrails.map((t, i) => (
                    <button
                      key={t.name}
                      onClick={() => setSelectedTrail(i)}
                      className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        selectedTrail === i ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      style={selectedTrail === i ? { backgroundColor: t.color } : {}}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{currentTrail.distance} • {currentTrail.elevation}</span>
                  <span className="capitalize">{currentTrail.difficulty}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleOfflineCache} className="gap-1 flex-1" disabled={offlineReady}>
                    {offlineReady ? <CheckCircle2 className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                    {offlineReady ? 'Downloaded' : 'Download Map'}
                  </Button>
                  {tracking ? (
                    <Button size="sm" variant="destructive" onClick={stopTracking} className="gap-1 flex-1">
                      <Pause className="h-3 w-3" /> Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={startTracking} className="gap-1 flex-1">
                      <Play className="h-3 w-3" /> Start
                    </Button>
                  )}
                </div>
                {tracking && (
                  <div className="flex items-center gap-2">
                    {trackingPhase === 'ascent' && (
                      <Button size="sm" variant="outline" onClick={markPeakReached} className="gap-1 flex-1">
                        I'm on Peak
                      </Button>
                    )}
                    {trackingPhase === 'peak' && (
                      <Button size="sm" variant="outline" onClick={startDescentTracking} className="gap-1 flex-1">
                        Start Descent
                      </Button>
                    )}
                  </div>
                )}
                {isTrailRecorder && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isRecording && !isGpsTestMode ? 'destructive' : 'outline'}
                        className="gap-1 flex-1"
                        onClick={toggleRecording}
                        disabled={isGpsTestMode}
                      >
                        {isRecording && !isGpsTestMode ? 'Stop Recording' : 'Record Trail'}
                      </Button>
                    <Button
                        size="sm"
                        variant={isGpsTestMode ? 'secondary' : 'ghost'}
                        className="gap-1 flex-1"
                        onClick={toggleGpsTestMode}
                      >
                        {isGpsTestMode ? 'Stop Test' : 'Test Accuracy'}
                      </Button>
                    </div>
                    {recordedPoints.length > 1 && !isRecording && !isGpsTestMode && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1 w-full"
                        onClick={saveRecordedRouteDraft}
                      >
                        Save Route Draft
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {tileDownloadProgress && tileDownloadProgress.total > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[2000] glass-card-strong rounded-full px-4 py-2 text-xs">
          Caching tiles {tileDownloadProgress.done}/{tileDownloadProgress.total}
        </div>
      )}

      <HikeSummary
        session={summarySession}
        open={!!summarySession}
        onClose={() => setSummarySession(null)}
      />
    </div>
  );
}
