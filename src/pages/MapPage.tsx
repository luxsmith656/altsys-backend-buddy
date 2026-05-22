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

import 'leaflet/dist/leaflet.css';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const hikerIcon = new L.DivIcon({
  html: `<div style="width:16px;height:16px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px #22c55e80;"></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

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
  const recordWatchRef = useRef<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { role, user } = useAuth();
  const isRanger = role === 'ranger';



  // Kalman Filter State for high-accuracy movement tracking
  const kalmanStateRef = useRef<{
    lat: number;
    lon: number;
    variance: number; // Error covariance
    lastTimestamp: number;
  } | null>(null);

  // Offline-first session tracker (parallel to legacy GPS UI)
  const trackerRef = useRef<HikeTracker | null>(null);
  const [summarySession, setSummarySession] = useState<OfflineSession | null>(null);
  const [tileDownloadProgress, setTileDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  

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

  const startTracking = () => {
    setTracking(true);
    if (user && !trackerRef.current) {
      const tr = new HikeTracker({ userId: user.id });
      trackerRef.current = tr;
      void tr.start().catch((e) => console.warn('HikeTracker start failed', e));
    }
  };



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
      const idx = findNearestTrailIndex(newPos, TRAILS[selectedTrail].path);
      setUserTrailProgress(idx);

      // Check if off-trail (> 100m from nearest trail point)
      const minDist = Math.min(...TRAILS.map((t) => distanceToTrail(newPos[0], newPos[1], t.path)));
      if (!isGpsTestMode && minDist > 0.1) {
        setOffTrail(true);
        toast.warning('You are off the marked trail!', { id: 'off-trail' });
      } else {
        setOffTrail(false);
      }
    }, [selectedTrail, applyKalmanFilter, isGpsTestMode]);

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
      trackerRef.current = null;
      void tr.stop().then((sess) => setSummarySession(sess)).catch((e) => console.warn('HikeTracker stop failed', e));
    }
  };

  useEffect(() => {
    if (tracking) {
      if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
      setRawGpsPoints([]);
      setFilteredPath([]);
      setDistance(0);
      setElapsed(0);
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
      const tpl = baseLayer === 'topo'
        ? 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
        : baseLayer === 'sat'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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

  const currentTrail = TRAILS[selectedTrail];
  const avgPace = elapsed > 0 && distance > 0 ? (elapsed / 60) / distance : 0;
  const realTimePace = currentSpeed && currentSpeed > 0 ? 60 / currentSpeed : 0;
  const displayPace = realTimePace > 0 ? realTimePace : avgPace;

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
    kalmanStateRef.current = null; // Reset Kalman filter
    setIsRecording(true);

    const handleNewRecordPoint = (pos: GeolocationPosition) => {
      // Step 1: GPS Signal Quality Filter
      const accuracy = pos.coords.accuracy;
      const signal: typeof gpsSignal = accuracy <= 10 ? 'Strong' : accuracy <= 30 ? 'Medium' : 'Weak';
      setGpsSignal(signal);

      if (signal === 'Weak') {
        console.warn(`Recording: GPS signal is weak (accuracy: ${accuracy}m), discarding point.`);
        return; // Discard points with weak signal
      }

      const rawSpeed = pos.coords.speed != null && pos.coords.speed > 0.3 ? pos.coords.speed * 3.6 : 0;
      const isStationary = rawSpeed < 1.0; // Stationary if speed < 1km/h
      const isPoorAccuracy = pos.coords.accuracy > 25;
      
      if (isStationary && isPoorAccuracy) return;

      const raw: RecordedPoint = {
        timestamp: Date.now(),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: pos.coords.altitude,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
      };

      const filtered = applyKalmanFilter(raw, rawSpeed);

      setRecordedPoints((prev) => {
        if (prev.length === 0) return [filtered];

        const last = prev[prev.length - 1];
        const dist = haversineDistance(last.lat, last.lon, filtered.lat, filtered.lon) * 1000;

        // Increased threshold to 3.0 meters for recording stability
        // Only record if moving or significant jump
        if (dist > 3.0 && !isStationary) {
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

    recordWatchRef.current = navigator.geolocation.watchPosition(handleNewRecordPoint, handleRecordError, options);

    // High-frequency polling heartbeat for recording (every 1s)
    const pollingInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(handleNewRecordPoint, () => {}, options);
    }, 1000);

    // Store polling interval in a ref
    (recordWatchRef as any).polling = pollingInterval;

  }, [applyKalmanFilter]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setGpsSignal('None');
    if (recordWatchRef.current != null) {
      navigator.geolocation.clearWatch(recordWatchRef.current);
      if ((recordWatchRef as any).polling) clearInterval((recordWatchRef as any).polling);
      recordWatchRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
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
          onStartTracking={startTracking}
          onStopTracking={stopTracking}
          onOfflineCache={handleOfflineCache}
        />
      </div>

      {isRanger && (
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
        </div>
      )}

      {/* Desktop/tablet trail selector */}
      <div className="hidden md:flex glass-card border-b border-border/30 px-4 py-2 items-center gap-2 overflow-x-auto">
        {TRAILS.map((t, i) => (
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
            {baseLayer === 'street' && (
              <OfflineLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} />
            )}
            {baseLayer === 'topo' && (
              <OfflineLayer url="https://a.tile.opentopomap.org/{z}/{x}/{y}.png" maxZoom={17} />
            )}
            {baseLayer === 'sat' && (
              <OfflineLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
            )}

            {TRAILS.map((t, i) => (
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

            {isRecording && recordedPoints.length > 1 && (
              <Polyline
                positions={recordedPoints.map((p) => [p.lat, p.lon] as [number, number])}
                pathOptions={{ color: '#f97316', weight: 4, dashArray: '4 8' }}
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
                <Marker position={displayPos || userPos!} icon={hikerIcon}>
                  <Popup>Your Position</Popup>
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

        {/* Ranger recording / accuracy badge + stats */}
        {isRanger && (isRecording || isGpsTestMode) && (
          <div className="absolute top-24 left-4 z-[1000] glass-card rounded-lg px-3 py-2 text-xs flex flex-col gap-1 max-w-xs">
            <div className="font-semibold">
              {isGpsTestMode ? 'Accuracy Test Active' : 'Recording Trail'}
            </div>
            <div className="flex flex-wrap gap-3 text-muted-foreground">
              <span>Dist: <span className="text-foreground font-medium">{formatDistance(recordDistanceMeters)}</span></span>
              <span>Time: <span className="text-foreground font-medium">{formatDuration(recordDurationSec)}</span></span>
              <span>Speed: <span className="text-foreground font-medium">
                {recordSpeedKmh > 0 ? `${recordSpeedKmh.toFixed(1)} km/h` : '--'}
              </span></span>
            </div>
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
          <MapLayersControl value={baseLayer} onChange={setBaseLayer} />
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
          <MapLayersControl value={baseLayer} onChange={setBaseLayer} />
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
                  {TRAILS.map((t, i) => (
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
                {isRanger && (
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
