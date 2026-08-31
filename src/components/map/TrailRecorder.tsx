import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Polyline, useMapEvents, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  GitCompare, 
  Eye,
  Locate, 
  Pencil,
  Play, 
  RefreshCw,
  Square, 
  MousePointer, 
  Navigation, 
  Trash2, 
  Save, 
  Undo2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { buildRouteStations, MT_KALISUNGAN_CENTER, DEFAULT_ZOOM } from '@/lib/map-data';
import {
  buildRecordingQuality,
  compareCleanedTracks,
  MotionGpsFilter,
  normalizeTrackPoint,
  postProcessTrack,
  reviewRecordingQuality,
  type GpsTrackPoint,
  type TrackComparison,
} from '@/lib/tracking/gpsFilter';
import {
  clearNativeTrailPoints,
  getNativeTrailPoints,
  startNativeTrailRecording,
  stopNativeTrailRecording,
} from '@/lib/tracking/nativeBackgroundRecorder';
import { useAuth } from '@/hooks/useAuth';
import type { LatLngTuple } from 'leaflet';
import {
  canUsePlatformGeolocation,
  clearPlatformWatch,
  getCurrentPlatformPosition,
  watchPlatformPosition,
  type PlatformWatchId,
} from '@/lib/tracking/platformGeolocation';

const pointIcon = new L.DivIcon({
  html: `<div style="width:14px;height:14px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(15,23,42,.45);cursor:grab"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const routeStartIcon = new L.DivIcon({
  html: `<div style="width:26px;height:26px;display:grid;place-items:center;background:#059669;color:#fff;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(15,23,42,.35);font:700 11px system-ui">S</div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const routeEndIcon = new L.DivIcon({
  html: `<div style="width:26px;height:26px;display:grid;place-items:center;background:#2563eb;color:#fff;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(15,23,42,.35);font:700 11px system-ui">E</div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Component for click-to-draw on map
function ClickDrawHandler({ active, onAddPoint }: { active: boolean; onAddPoint: (latlng: LatLngTuple) => void }) {
  useMapEvents({
    click(e) {
      if (active) {
        onAddPoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

function distanceMeters(a: LatLngTuple, b: LatLngTuple) {
  return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
}

function toLatLng(point: GpsTrackPoint): LatLngTuple {
  return [point.lat, point.lng];
}

function pathToTrack(points: LatLngTuple[]): GpsTrackPoint[] {
  return points.map(([lat, lng], index) => ({
    lat,
    lng,
    ts: Date.now() + index,
    accuracy: 8,
  }));
}

function serializeTrackPoint(point: GpsTrackPoint, fallbackReason: GpsTrackPoint['filterReason'] = 'accepted') {
  const normalized = normalizeTrackPoint({
    ...point,
    filterReason: point.filterReason ?? fallbackReason,
  });
  return {
    lat: normalized.lat,
    lng: normalized.lng,
    timestamp: new Date(normalized.ts).toISOString(),
    timestamp_ms: normalized.ts,
    altitude_m: normalized.alt,
    accuracy_m: normalized.accuracy,
    speed_m_s: normalized.speed,
    heading_deg: normalized.heading,
    estimated: normalized.inferred || normalized.source === 'estimated',
    source: normalized.source,
    filter_reason: normalized.filterReason,
    quality: normalized.quality,
  };
}

function trackPointFromJson(c: any, index: number): GpsTrackPoint {
  const parsedTs = typeof c.timestamp === 'string' ? Date.parse(c.timestamp) : NaN;
  const ts = Number.isFinite(Number(c.ts))
    ? Number(c.ts)
    : Number.isFinite(Number(c.timestamp_ms))
    ? Number(c.timestamp_ms)
    : Number.isFinite(parsedTs)
      ? parsedTs
      : Date.now() + index;
  return {
    lat: Number(c.lat),
    lng: Number(c.lng),
    ts,
    alt: c.alt ?? c.altitude_m ?? null,
    accuracy: c.accuracy ?? c.accuracy_m ?? null,
    speed: c.speed ?? c.speed_m_s ?? null,
    heading: c.heading ?? c.heading_deg ?? null,
    inferred: Boolean(c.estimated),
    source: c.source === 'estimated' ? 'estimated' : 'gps',
    filterReason: c.filter_reason ?? 'accepted',
    quality: c.quality,
  };
}

function pointsFromJson(value: any): GpsTrackPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c: any) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
    .map(trackPointFromJson);
}

function formatMeters(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(2)} km`;
}

interface TrailRecorderProps {
  existingTrails?: {
    id: string;
    location_id?: string | null;
    name: string;
    coordinates_json: any;
    status?: string;
    is_official?: boolean;
    difficulty?: string;
    elevation_meters?: number;
    review_status?: string;
    source?: string;
    raw_recording_json?: any;
    cleaned_recording_json?: any;
    recording_metadata?: any;
    recording_count?: number;
  }[];
  locationId?: string | null;
  onSaved?: () => void;
}

type TrailRecordingRow = {
  id: string;
  trail_zone_id?: string | null;
  location_id?: string | null;
  recorded_by?: string | null;
  created_at: string;
  status?: string | null;
  source?: string | null;
  notes?: string | null;
  quality_summary?: any;
  raw_points_json?: any;
  cleaned_points_json?: any;
  review_decision?: string | null;
  comparison_summary?: any;
};

export default function TrailRecorder({ existingTrails, locationId, onSaved }: TrailRecorderProps) {
  const { user } = useAuth();
  const map = useMap(); // Consume the parent leaflet map context directly!

  const visibleExistingTrails = existingTrails?.filter((trail) => trail.status !== 'deleted' && trail.review_status !== 'deleted') ?? [];
  const [mode, setMode] = useState<'idle' | 'drawing' | 'recording'>('idle');
  const [path, setPath] = useState<LatLngTuple[]>([]);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState('moderate');
  const [elevation, setElevation] = useState('');
  const [status, setStatus] = useState<'draft' | 'active'>('active');
  const [saving, setSaving] = useState(false);
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null);
  const watchRef = useRef<PlatformWatchId | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsFilterRef = useRef<MotionGpsFilter | null>(null);
  const nativeRecordingStartedRef = useRef(false);
  const predictedCountRef = useRef(0);
  const rawGpsPointsRef = useRef<GpsTrackPoint[]>([]);
  const cleanedGpsPointsRef = useRef<GpsTrackPoint[]>([]);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingNow, setRecordingNow] = useState(Date.now());
  const pathRef = useRef<LatLngTuple[]>([]);
  const [followRecordingMap, setFollowRecordingMap] = useState(false);
  const suppressRecorderUnlockRef = useRef(false);
  const offlineDraftKey = 'altsys-admin-trail-recorder-draft';
  const [trailRecordings, setTrailRecordings] = useState<TrailRecordingRow[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [selectedTrailLocationId, setSelectedTrailLocationId] = useState<string | null>(locationId ?? null);
  const [selectedTrailRecordingCount, setSelectedTrailRecordingCount] = useState(0);
  const [recordingsModalOpen, setRecordingsModalOpen] = useState(false);
  const [recordingSort, setRecordingSort] = useState<'newest' | 'quality' | 'distance'>('newest');
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);
  const [availableRecordings, setAvailableRecordings] = useState<TrailRecordingRow[]>([]);
  const [availableRecordingsLoading, setAvailableRecordingsLoading] = useState(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const selectedTrailForDelete = visibleExistingTrails.find((trail) => trail.id === editingTrailId);
  const selectedAvailableRecording = availableRecordings.find((recording) => recording.id === selectedRecordingId);
  const [isEditingPoints, setIsEditingPoints] = useState(false);
  const [originalPath, setOriginalPath] = useState<LatLngTuple[]>([]);

  // Floating panel collapse state
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    if (!editingTrailId) {
      setSelectedTrailLocationId(locationId ?? null);
    }
  }, [editingTrailId, locationId]);

  // Handle map center view updates
  useEffect(() => {
    if (path.length === 0) return;
    const last = path[path.length - 1];
    if (mode === 'recording' && followRecordingMap) {
      map.setView(last, Math.max(map.getZoom(), 17));
    }
  }, [mode, followRecordingMap, map, path]);

  // Bind drag events to unlock camera following during recording
  useEffect(() => {
    if (mode !== 'recording' || !followRecordingMap) return;
    const onManualMove = () => {
      if (!suppressRecorderUnlockRef.current) {
        setFollowRecordingMap(false);
      }
    };
    map.on('dragstart', onManualMove);
    map.on('zoomstart', onManualMove);
    return () => {
      map.off('dragstart', onManualMove);
      map.off('zoomstart', onManualMove);
    };
  }, [mode, followRecordingMap, map]);

  const currentCleanTrack = cleanedGpsPointsRef.current.length > 0 ? cleanedGpsPointsRef.current : pathToTrack(path);
  const currentRawTrack = rawGpsPointsRef.current.length > 0 ? rawGpsPointsRef.current : currentCleanTrack;
  const currentQuality = path.length > 1 ? buildRecordingQuality(currentRawTrack, currentCleanTrack) : null;
  const currentReview = currentQuality ? reviewRecordingQuality(currentQuality) : null;
  
  const currentComparisons = currentCleanTrack.length > 1
    ? trailRecordings
        .map((recording) => ({
          recording,
          comparison: compareCleanedTracks(currentCleanTrack, pointsFromJson(recording.cleaned_points_json)),
        }))
        .filter((item) => item.comparison.consistency !== 'unknown')
    : [];

  const bestComparison = currentComparisons.reduce<{ recording: TrailRecordingRow; comparison: TrackComparison } | null>((best, item) => {
    if (!best) return item;
    const bestAvg = best.comparison.averageDeviationM ?? Infinity;
    const itemAvg = item.comparison.averageDeviationM ?? Infinity;
    return itemAvg < bestAvg ? item : best;
  }, null);

  const sortedTrailRecordings = useMemo(() => {
    const rows = [...trailRecordings];
    if (recordingSort === 'quality') {
      return rows.sort((a, b) => {
        const scoreA = reviewRecordingQuality(a.quality_summary ?? {}).score ?? 0;
        const scoreB = reviewRecordingQuality(b.quality_summary ?? {}).score ?? 0;
        return scoreB - scoreA;
      });
    }
    if (recordingSort === 'distance') {
      return rows.sort((a, b) => Number((b.quality_summary ?? {}).distanceM ?? 0) - Number((a.quality_summary ?? {}).distanceM ?? 0));
    }
    return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [recordingSort, trailRecordings]);

  // GPS recording
  const startRecording = useCallback(() => {
    if (!canUsePlatformGeolocation()) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    if (watchRef.current !== null) void clearPlatformWatch(watchRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    gpsFilterRef.current = new MotionGpsFilter({
      minAccuracyForStartM: 50,
      maxAccuracyM: 85,
      minAppendDistanceM: 1.6,
    });
    predictedCountRef.current = 0;
    rawGpsPointsRef.current = [];
    cleanedGpsPointsRef.current = [];
    void clearNativeTrailPoints(offlineDraftKey).catch(() => {});
    void startNativeTrailRecording(offlineDraftKey, 'route')
      .then((started) => { nativeRecordingStartedRef.current = started; })
      .catch((e) => console.warn('Native route editor recorder unavailable', e));
    setMode('recording');
    setPath([]);
    pathRef.current = [];
    setFollowRecordingMap(false);
    setRecordingStartedAt(Date.now());
    toast.info('GPS recording started. Walk the trail path.');

    const acceptPosition = (pos: GeolocationPosition) => {
      const accuracy = pos.coords.accuracy ?? 999;
      const filter = gpsFilterRef.current ?? new MotionGpsFilter({
        minAccuracyForStartM: 50,
        maxAccuracyM: 85,
        minAppendDistanceM: 1.6,
      });
      gpsFilterRef.current = filter;
      const rawPoint: GpsTrackPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        alt: pos.coords.altitude,
        accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        ts: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
        source: 'gps',
        filterReason: 'accepted',
      };
      rawGpsPointsRef.current = [...rawGpsPointsRef.current, rawPoint];
      localStorage.setItem(offlineDraftKey, JSON.stringify({
        path: pathRef.current,
        rawPoints: rawGpsPointsRef.current,
        cleanedPoints: cleanedGpsPointsRef.current,
      }));
      const filtered = filter.filter(rawPoint, {
        heading: pos.coords.heading,
        moving: (pos.coords.speed ?? 0) > 0.35 || pathRef.current.length > 1,
        consecutivePredicted: predictedCountRef.current,
      });
      if (filtered.reason === 'waiting') {
        toast.warning(`Waiting for cleaner GPS (${Math.round(accuracy)}m). Keep the phone near open sky.`, { id: 'trail-recorder-accuracy' });
        return;
      }
      if (!filtered.appended || !filtered.point) {
        if (filtered.reason === 'weak') {
          toast.warning(`Weak GPS ignored (${Math.round(accuracy)}m). Recording is active offline.`, { id: 'trail-recorder-accuracy' });
        }
        return;
      }
      predictedCountRef.current = filtered.point.inferred ? predictedCountRef.current + 1 : 0;
      cleanedGpsPointsRef.current = [...cleanedGpsPointsRef.current, filtered.point];
      const point = toLatLng(filtered.point);
      setPath((prev) => {
        if (prev.length === 0) {
          toast.success('First GPS point saved.');
          const next = [point];
          pathRef.current = next;
          localStorage.setItem(offlineDraftKey, JSON.stringify({
            path: next,
            rawPoints: rawGpsPointsRef.current,
            cleanedPoints: cleanedGpsPointsRef.current,
          }));
          return next;
        }
        const last = prev[prev.length - 1];
        if (distanceMeters(last, point) < 1.5) return prev;
        const next = [...prev, point];
        pathRef.current = next;
        localStorage.setItem(offlineDraftKey, JSON.stringify({
          path: next,
          rawPoints: rawGpsPointsRef.current,
          cleanedPoints: cleanedGpsPointsRef.current,
        }));
        return next;
      });
    };

    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
    void getCurrentPlatformPosition(
      acceptPosition,
      (err) => toast.error(`GPS Error: ${err.message}`),
      options
    );
    void watchPlatformPosition(
      acceptPosition,
      (err) => toast.error(`GPS Error: ${err.message}`),
      options,
    ).then((watchId) => { watchRef.current = watchId; }).catch((err) => toast.error(`GPS Error: ${err.message}`));
    pollRef.current = setInterval(() => {
      void getCurrentPlatformPosition(acceptPosition, () => {}, options);
    }, 3500);
  }, []);

  const stopRecording = useCallback(async () => {
    if (nativeRecordingStartedRef.current) {
      await stopNativeTrailRecording().catch((e) => console.warn('Native route editor recorder stop failed', e));
      nativeRecordingStartedRef.current = false;
    }
    const nativePoints = await getNativeTrailPoints(offlineDraftKey).catch(() => []);
    if (nativePoints.length > 0) {
      const existingKeys = new Set(rawGpsPointsRef.current.map((p) => Math.round(p.ts / 1000)));
      const imported = nativePoints
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.ts))
        .filter((p) => {
          const key = Math.round(p.ts / 1000);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        })
        .map((p) => ({
          lat: p.lat,
          lng: p.lng,
          alt: p.alt ?? null,
          accuracy: p.accuracy ?? 999,
          speed: p.speed ?? null,
          heading: p.heading ?? null,
          ts: p.ts,
          source: 'gps' as const,
          filterReason: 'accepted' as const,
        }));
      if (imported.length > 0) {
        rawGpsPointsRef.current = [...rawGpsPointsRef.current, ...imported].sort((a, b) => a.ts - b.ts);
        const processed = postProcessTrack(rawGpsPointsRef.current, 1.4);
        cleanedGpsPointsRef.current = processed;
        const cleaned = processed.map(toLatLng);
        pathRef.current = cleaned;
        setPath(cleaned);
      }
    }
    if (watchRef.current !== null) {
      void clearPlatformWatch(watchRef.current);
      watchRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (pathRef.current.length > 2) {
      const sourcePoints = cleanedGpsPointsRef.current.length > 0 ? cleanedGpsPointsRef.current : pathToTrack(pathRef.current);
      const processed = postProcessTrack(sourcePoints, 1.4);
      cleanedGpsPointsRef.current = processed;
      const cleaned = processed.map(toLatLng);
      pathRef.current = cleaned;
      setPath(cleaned);
      localStorage.setItem(offlineDraftKey, JSON.stringify({
        path: cleaned,
        rawPoints: rawGpsPointsRef.current,
        cleanedPoints: cleanedGpsPointsRef.current,
      }));
    }
    setMode('idle');
    setRecordingStartedAt(null);
    setName((current) => current.trim() || `Recorded Trail ${new Date().toLocaleString()}`);
    toast.success(`Recorded ${pathRef.current.length} points. Review it, then tap Save Recording to add it to the list.`);
  }, [offlineDraftKey, path.length]);

  const startDrawing = () => {
    setMode('drawing');
    setPath([]);
    toast.info('Click directly on the map page to draw trail points');
  };

  const stopDrawing = () => {
    setMode('idle');
  };

  const addPoint = (latlng: LatLngTuple) => {
    setPath((prev) => [...prev, latlng]);
  };

  const undoLastPoint = () => {
    setPath((prev) => prev.slice(0, -1));
  };

  const clearPath = () => {
    setPath([]);
    pathRef.current = [];
    setEditingTrailId(null);
    setSelectedTrailLocationId(locationId ?? null);
    setSelectedTrailRecordingCount(0);
    setTrailRecordings([]);
    setSelectedRecordingId(null);
    setFollowRecordingMap(false);
    setIsEditingPoints(false);
    setOriginalPath([]);
    gpsFilterRef.current?.reset();
    gpsFilterRef.current = null;
    predictedCountRef.current = 0;
    rawGpsPointsRef.current = [];
    cleanedGpsPointsRef.current = [];
    localStorage.removeItem(offlineDraftKey);
    void clearNativeTrailPoints(offlineDraftKey).catch(() => {});
  };

  const loadAvailableRecordings = useCallback(async () => {
    if (!user?.id) {
      setAvailableRecordings([]);
      return;
    }

    setAvailableRecordingsLoading(true);
    const columns = 'id,trail_zone_id,location_id,recorded_by,created_at,status,source,notes,quality_summary,raw_points_json,cleaned_points_json,review_decision,comparison_summary';
    try {
      let primaryQuery = supabase
        .from('trail_recordings' as any)
        .select(columns)
        .order('created_at', { ascending: false })
        .limit(100);
      if (locationId) {
        primaryQuery = primaryQuery.eq('location_id', locationId) as typeof primaryQuery;
      }

      const primaryResult = await primaryQuery;
      if (primaryResult.error) throw primaryResult.error;
      const rows = ((primaryResult.data as unknown as TrailRecordingRow[] | null) ?? []);

      if (locationId) {
        const orphanResult = await supabase
          .from('trail_recordings' as any)
          .select(columns)
          .is('location_id', null)
          .eq('recorded_by', user.id)
          .order('created_at', { ascending: false })
          .limit(100);
        if (!orphanResult.error) {
          rows.push(...((orphanResult.data as unknown as TrailRecordingRow[] | null) ?? []));
        }
      }

      const uniqueRows = Array.from(new Map(rows.map((recording) => [recording.id, recording])).values())
        .filter((recording) => pointsFromJson(recording.cleaned_points_json).length >= 2)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAvailableRecordings(uniqueRows);
    } catch (err: any) {
      setAvailableRecordings([]);
      toast.error(`Could not load recorded GPS trails: ${err.message}`);
    } finally {
      setAvailableRecordingsLoading(false);
    }
  }, [locationId, user?.id]);

  useEffect(() => {
    void loadAvailableRecordings();
  }, [loadAvailableRecordings]);

  const loadTrailRecordings = useCallback(async (trailId: string) => {
    setRecordingsLoading(true);
    try {
      const { data, error } = await supabase
        .from('trail_recordings' as any)
        .select('id,trail_zone_id,location_id,recorded_by,created_at,status,source,notes,quality_summary,raw_points_json,cleaned_points_json,review_decision,comparison_summary')
        .eq('trail_zone_id', trailId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setTrailRecordings(((data as unknown as TrailRecordingRow[] | null) ?? []));
    } catch {
      setTrailRecordings([]);
      toast.warning('Could not load previous trail recordings for comparison.');
    } finally {
      setRecordingsLoading(false);
    }
  }, []);

  const loadExistingTrail = (trailId: string) => {
    const trail = visibleExistingTrails.find((t) => t.id === trailId);
    if (trail) {
      setEditingTrailId(trailId);
      setSelectedTrailLocationId(trail.location_id ?? null);
      setSelectedTrailRecordingCount(trail.recording_count ?? 0);
      setName(trail.name);
      setDifficulty(trail.difficulty || 'moderate');
      setElevation(trail.elevation_meters ? String(trail.elevation_meters) : '');
      setStatus(trail.status === 'draft' ? 'draft' : 'active');
      const coords = Array.isArray(trail.coordinates_json) ? trail.coordinates_json : [];
      const parsed = coords.map((c: any) => [c.lat, c.lng] as LatLngTuple);
      setPath(parsed);
      pathRef.current = parsed;
      cleanedGpsPointsRef.current = coords
          .filter((c: any) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
          .map(trackPointFromJson);
      rawGpsPointsRef.current = Array.isArray(trail.raw_recording_json)
        ? pointsFromJson(trail.raw_recording_json)
        : [];
      setOriginalPath(parsed);
      setFollowRecordingMap(false);
      setIsEditingPoints(false);
      void loadTrailRecordings(trailId);
      
      // Pan main map bounds to show entire selected trail
      if (parsed.length > 1) {
        map.fitBounds(L.latLngBounds(parsed), { padding: [40, 40] });
      } else if (parsed.length === 1) {
        map.setView(parsed[0], 17);
      }
      toast.info(`Loaded trail "${trail.name}" for editing`);
    }
  };

  const focusPathOnMap = useCallback(() => {
    if (pathRef.current.length > 1) {
      map.fitBounds(L.latLngBounds(pathRef.current), {
        paddingTopLeft: [32, 96],
        paddingBottomRight: [32, 32],
        maxZoom: 18,
      });
      return;
    }
    if (pathRef.current.length === 1) {
      map.setView(pathRef.current[0], 18);
      return;
    }
    toast.info('Select or draw a route to preview it on the map.');
  }, [map]);

  const movePathPoint = useCallback((index: number, position: LatLngTuple) => {
    setPath((current) => {
      if (!current[index]) return current;
      const next = current.map((point, pointIndex) => pointIndex === index ? position : point);
      pathRef.current = next;
      cleanedGpsPointsRef.current = pathToTrack(next);
      return next;
    });
  }, []);

  const [deletingTrailId, setDeletingTrailId] = useState<string | null>(null);
  const deleteTrailPermanently = async (trailId: string, trailName: string) => {
    if (!window.confirm(`Permanently delete "${trailName}"? This cannot be undone.`)) return;
    setDeletingTrailId(trailId);
    try {
      await supabase.from('trail_recordings').delete().eq('trail_zone_id', trailId);
      const { error } = await supabase.from('trail_zones').delete().eq('id', trailId);
      if (error) {
        const archive = await supabase
          .from('trail_zones' as any)
          .update({
            status: 'deleted',
            review_status: 'deleted',
            is_official: false,
            coordinates_json: [],
            raw_recording_json: [],
            cleaned_recording_json: [],
            recording_metadata: { deleted_at: new Date().toISOString(), delete_error: error.message },
            recording_count: 0,
          })
          .eq('id', trailId);
        if (archive.error) throw error;
      }
      toast.success(`Removed "${trailName}"`);
      if (editingTrailId === trailId) {
        setEditingTrailId(null);
        setPath([]);
        setName('');
        setElevation('');
        pathRef.current = [];
        rawGpsPointsRef.current = [];
        cleanedGpsPointsRef.current = [];
        setTrailRecordings([]);
      }
      onSaved?.();
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingTrailId(null);
    }
  };

  const loadRecordingForReview = (recording: TrailRecordingRow) => {
    const cleanTrack = pointsFromJson(recording.cleaned_points_json);
    const cleanPath = cleanTrack.map(toLatLng);
    if (cleanPath.length < 2) {
      toast.error('This recording has no cleaned path to review.');
      return;
    }
    const trail = visibleExistingTrails.find((t) => t.id === recording.trail_zone_id);
    setSelectedRecordingId(recording.id);
    if (trail) {
      setEditingTrailId(trail.id);
      setSelectedTrailLocationId(trail.location_id ?? null);
      setSelectedTrailRecordingCount(trail.recording_count ?? trailRecordings.length);
      setName(trail.name);
      setDifficulty(trail.difficulty || 'moderate');
      setElevation(trail.elevation_meters ? String(trail.elevation_meters) : '');
      void loadTrailRecordings(trail.id);
    } else {
      setEditingTrailId(recording.trail_zone_id ?? null);
      setSelectedTrailLocationId(recording.location_id ?? locationId ?? null);
      setSelectedTrailRecordingCount(1);
      setName(recording.notes?.trim() || `Recorded Trail ${new Date(recording.created_at).toLocaleDateString()}`);
      setDifficulty('moderate');
      setElevation('');
      if (recording.trail_zone_id) void loadTrailRecordings(recording.trail_zone_id);
    }
    cleanedGpsPointsRef.current = cleanTrack;
    rawGpsPointsRef.current = pointsFromJson(recording.raw_points_json);
    setPath(cleanPath);
    pathRef.current = cleanPath;
    setOriginalPath([]);
    setMode('idle');
    setFollowRecordingMap(false);
    setIsEditingPoints(false);
    setRecordingsModalOpen(false);

    // Focus camera on the loaded path
    map.fitBounds(L.latLngBounds(cleanPath), { padding: [40, 40] });
    toast.success('Recording loaded on the map for review.');
  };

  const publishRecordingAsOfficial = async (recording: TrailRecordingRow) => {
    const cleanTrack = pointsFromJson(recording.cleaned_points_json);
    if (cleanTrack.length < 2) {
      toast.error('This recording has no cleaned path to publish.');
      return;
    }
    setRecordingActionId(recording.id);
    try {
      const rawTrack = pointsFromJson(recording.raw_points_json);
      const coordsJson = cleanTrack.map((p) => serializeTrackPoint(p));
      const rawRecordingJson = (rawTrack.length > 0 ? rawTrack : cleanTrack).map((p) => serializeTrackPoint(p, 'accepted'));
      const qualitySummary = recording.quality_summary ?? buildRecordingQuality(rawTrack.length > 0 ? rawTrack : cleanTrack, cleanTrack);
      const routeStations = buildRouteStations(cleanTrack.map(toLatLng));
      const routeLocationId = recording.location_id ?? selectedTrailLocationId ?? locationId ?? null;
      const payload = {
        location_id: routeLocationId,
        coordinates_json: coordsJson,
        cleaned_recording_json: coordsJson,
        raw_recording_json: rawRecordingJson,
        recording_metadata: {
          ...qualitySummary,
          review: reviewRecordingQuality(qualitySummary),
          comparison: recording.comparison_summary ?? null,
          stations: routeStations,
          source_recording_id: recording.id,
          published_at: new Date().toISOString(),
        },
        status: 'active',
        review_status: 'approved',
        is_official: true,
        official_at: new Date().toISOString(),
      };
      let targetTrailId = recording.trail_zone_id ?? null;

      if (targetTrailId) {
        let { error } = await supabase
          .from('trail_zones' as any)
          .update(payload)
          .eq('id', targetTrailId);
        if (error && String(error.message ?? '').toLowerCase().includes('column')) {
          const { cleaned_recording_json, raw_recording_json, recording_metadata, review_status, is_official, official_at, ...legacyPayload } = payload;
          const fallback = await supabase
            .from('trail_zones' as any)
            .update(legacyPayload)
            .eq('id', targetTrailId);
          error = fallback.error;
        }
        if (error) throw error;
      } else {
        const insertPayload = {
          ...payload,
          name: name.trim() || `Recorded Trail ${new Date(recording.created_at).toLocaleDateString()}`,
          difficulty,
          elevation_meters: elevation ? parseInt(elevation) : 0,
          max_capacity: 50,
          source: recording.source ?? 'gps_recording',
          recorded_by: user?.id ?? recording.recorded_by ?? null,
          recording_count: 1,
        };
        let insertResult = await supabase
          .from('trail_zones' as any)
          .insert(insertPayload)
          .select('id')
          .single();
        if (insertResult.error && String(insertResult.error.message ?? '').toLowerCase().includes('column')) {
          const {
            cleaned_recording_json,
            raw_recording_json,
            recording_metadata,
            review_status,
            is_official,
            official_at,
            source,
            recorded_by,
            recording_count,
            ...legacyInsertPayload
          } = insertPayload;
          insertResult = await supabase
            .from('trail_zones' as any)
            .insert(legacyInsertPayload)
            .select('id')
            .single();
        }
        if (insertResult.error) throw insertResult.error;
        targetTrailId = (insertResult.data as { id?: string } | null)?.id ?? null;
        if (!targetTrailId) throw new Error('The official route was created without an ID.');
      }

      const recordingUpdate = await supabase
        .from('trail_recordings' as any)
        .update({
          trail_zone_id: targetTrailId,
          location_id: routeLocationId,
          status: 'active',
          review_decision: 'approved',
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', recording.id);
      if (recordingUpdate.error) throw recordingUpdate.error;

      setEditingTrailId(targetTrailId);
      setSelectedTrailLocationId(routeLocationId);
      toast.success('Recording published as the official route.');
      await Promise.all([
        loadTrailRecordings(targetTrailId),
        loadAvailableRecordings(),
      ]);
      onSaved?.();
    } catch (err: any) {
      toast.error(`Failed to publish recording: ${err.message}`);
    } finally {
      setRecordingActionId(null);
    }
  };

  const deleteTrailRecording = async (recording: TrailRecordingRow) => {
    const linkedTrail = visibleExistingTrails.find((trail) => trail.id === recording.trail_zone_id);
    const deleteWholeRoute = !!recording.trail_zone_id;
    const confirmMessage = deleteWholeRoute
      ? `Permanently delete "${linkedTrail?.name ?? 'this route'}" and all of its saved recordings? This removes the route draft/official route from the map too.`
      : 'Permanently delete this saved recording?';
    if (!window.confirm(confirmMessage)) return;
    setRecordingActionId(recording.id);
    try {
      if (deleteWholeRoute && recording.trail_zone_id) {
        const recordingsDelete = await supabase
          .from('trail_recordings' as any)
          .delete()
          .eq('trail_zone_id', recording.trail_zone_id);
        if (recordingsDelete.error) throw recordingsDelete.error;

        const trailDelete = await supabase
          .from('trail_zones' as any)
          .delete()
          .eq('id', recording.trail_zone_id);
        if (trailDelete.error) {
          const archive = await supabase
            .from('trail_zones' as any)
            .update({
              status: 'deleted',
              review_status: 'deleted',
              is_official: false,
              coordinates_json: [],
              raw_recording_json: [],
              cleaned_recording_json: [],
              recording_metadata: { deleted_at: new Date().toISOString(), delete_error: trailDelete.error.message },
              recording_count: 0,
            })
            .eq('id', recording.trail_zone_id);
          if (archive.error) throw trailDelete.error;
        }

        setTrailRecordings((prev) => prev.filter((item) => item.trail_zone_id !== recording.trail_zone_id));
        if (editingTrailId === recording.trail_zone_id) clearPath();
        toast.success('Route removed from recorded trails.');
        onSaved?.();
      } else {
        const { error } = await supabase
          .from('trail_recordings' as any)
          .delete()
          .eq('id', recording.id);
        if (error) throw error;
        setTrailRecordings((prev) => prev.filter((item) => item.id !== recording.id));
        toast.success('Recording permanently deleted.');
      }
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setRecordingActionId(null);
    }
  };

  const saveTrail = async () => {
    if (!name.trim()) {
      toast.error('Trail name is required');
      return;
    }
    if (path.length < 2) {
      toast.error('At least 2 points are required');
      return;
    }
    setSaving(true);
    try {
      const baseCleanTrack = cleanedGpsPointsRef.current.length > 0 ? cleanedGpsPointsRef.current : pathToTrack(path);
      const finalTrack = path.length > 2 ? postProcessTrack(baseCleanTrack, 1.2) : baseCleanTrack;
      const rawTrack = rawGpsPointsRef.current.length > 0 ? rawGpsPointsRef.current : finalTrack;
      const coordsJson = finalTrack.map((p) => serializeTrackPoint(p));
      const rawRecordingJson = rawTrack.map((p) => serializeTrackPoint(p, 'accepted'));
      const qualitySummary = buildRecordingQuality(rawTrack, finalTrack);
      const review = reviewRecordingQuality(qualitySummary);
      const routeStations = buildRouteStations(finalTrack.map(toLatLng));
      const isGpsRecording = rawGpsPointsRef.current.length > 0;
      const comparisonSummary = {
        comparedRecordingCount: trailRecordings.length,
        bestComparison: bestComparison?.comparison ?? null,
        requiresSecondPass: isGpsRecording && trailRecordings.length === 0,
        generatedAt: new Date().toISOString(),
      };
      const forceDraftReview = isGpsRecording && review.level !== 'good';
      const finalStatus = forceDraftReview ? 'draft' : status;
      const finalReviewStatus = finalStatus === 'active' ? 'approved' : 'pending';
      const finalIsOfficial = finalStatus === 'active';
      const routeLocationId = selectedTrailLocationId ?? locationId ?? null;
      const payload = {
        location_id: routeLocationId,
        name: name.trim(),
        difficulty,
        elevation_meters: elevation ? parseInt(elevation) : 0,
        coordinates_json: coordsJson,
        cleaned_recording_json: coordsJson,
        raw_recording_json: rawRecordingJson,
        recording_metadata: {
          ...qualitySummary,
          review,
          comparison: comparisonSummary,
          stations: routeStations,
        },
        recording_count: Math.max(selectedTrailRecordingCount, trailRecordings.length) + 1,
        status: finalStatus,
        review_status: finalReviewStatus,
        is_official: finalIsOfficial,
        official_at: finalIsOfficial ? new Date().toISOString() : null,
        source: isGpsRecording ? 'gps_recording' : 'manual_editor',
        recorded_by: user?.id ?? null,
        max_capacity: 50,
      };
      let savedTrailId = editingTrailId;

      if (editingTrailId) {
        let { error } = await supabase.from('trail_zones' as any).update(payload).eq('id', editingTrailId);
        if (error && String(error.message ?? '').toLowerCase().includes('column')) {
          const { cleaned_recording_json, raw_recording_json, recording_metadata, recording_count, ...legacyPayload } = payload;
          const fallback = await supabase.from('trail_zones' as any).update(legacyPayload).eq('id', editingTrailId);
          error = fallback.error;
        }
        if (error) throw error;
        toast.success('Trail updated successfully!');
      } else {
        let { data, error } = await supabase.from('trail_zones' as any).insert(payload).select('id').single();
        if (error && String(error.message ?? '').toLowerCase().includes('column')) {
          const { cleaned_recording_json, raw_recording_json, recording_metadata, recording_count, ...legacyPayload } = payload;
          const fallback = await supabase.from('trail_zones' as any).insert(legacyPayload).select('id').single();
          data = fallback.data;
          error = fallback.error;
        }
        if (error) throw error;
        savedTrailId = (data as { id?: string } | null)?.id ?? null;
        toast.success('Trail saved successfully!');
      }

      if (savedTrailId && user?.id) {
        const recordingInsert = await supabase.from('trail_recordings' as any).insert({
          trail_zone_id: savedTrailId,
          location_id: routeLocationId,
          recorded_by: user.id,
          source: rawGpsPointsRef.current.length > 0 ? 'gps_recording' : 'manual_editor',
          status: finalStatus,
          review_decision: finalIsOfficial ? 'approved' : review.level === 'poor' ? 'record_again' : 'pending_review',
          reviewed_by: finalIsOfficial ? user.id : null,
          reviewed_at: finalIsOfficial ? new Date().toISOString() : null,
          raw_points_json: rawRecordingJson,
          cleaned_points_json: coordsJson,
          quality_summary: qualitySummary,
          comparison_summary: comparisonSummary,
          notes: name.trim(),
        });
        if (recordingInsert.error) {
          toast.warning(`Route saved, but GPS recording evidence could not be indexed: ${recordingInsert.error.message}`);
        }
      }
      if (forceDraftReview) {
        toast.warning('GPS quality needs review, so the trail was saved as a draft instead of official.');
      }

      setPath([]);
      setName('');
      setElevation('');
      setStatus('active');
      setEditingTrailId(null);
      pathRef.current = [];
      rawGpsPointsRef.current = [];
      cleanedGpsPointsRef.current = [];
      setTrailRecordings([]);
      setSelectedTrailRecordingCount(0);
      setSelectedTrailLocationId(locationId ?? null);
      setSelectedRecordingId(null);
      localStorage.removeItem(offlineDraftKey);
      void clearNativeTrailPoints(offlineDraftKey).catch(() => {});
      void loadAvailableRecordings();
      onSaved?.();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (mode !== 'recording') return;
    const id = setInterval(() => setRecordingNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const recordedDistanceM = path.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + distanceMeters(path[index - 1], point);
  }, 0);
  const recordedDurationSec = recordingStartedAt ? Math.round((recordingNow - recordingStartedAt) / 1000) : 0;
  const editablePointIndexes = useMemo(() => {
    if (!isEditingPoints || path.length <= 2) return [];
    const stride = Math.max(1, Math.ceil(path.length / 80));
    const indexes: number[] = [];
    for (let index = stride; index < path.length - 1; index += stride) {
      indexes.push(index);
    }
    return indexes;
  }, [isEditingPoints, path.length]);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        void clearPlatformWatch(watchRef.current);
      }
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(offlineDraftKey);
    if (!raw || pathRef.current.length > 0) return;
    try {
      const saved = JSON.parse(raw);
      const savedPath = Array.isArray(saved) ? saved : saved.path;
      if (!Array.isArray(savedPath)) return;
      const recovered = savedPath
        .map((p: any) => Array.isArray(p) ? [Number(p[0]), Number(p[1])] as LatLngTuple : null)
        .filter((p: LatLngTuple | null): p is LatLngTuple => Boolean(p && Number.isFinite(p[0]) && Number.isFinite(p[1])));
      if (recovered.length > 1) {
        pathRef.current = recovered;
        setPath(recovered);
        rawGpsPointsRef.current = Array.isArray(saved.rawPoints)
          ? saved.rawPoints.filter((p: any) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))).map(trackPointFromJson)
          : [];
        cleanedGpsPointsRef.current = Array.isArray(saved.cleanedPoints)
          ? saved.cleanedPoints.filter((p: any) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))).map(trackPointFromJson)
          : pathToTrack(recovered);
        toast.info('Recovered an offline route recording draft.');
      }
    } catch {
      localStorage.removeItem(offlineDraftKey);
    }
  }, []);

  return (
    <>
      {/* ── 1. Map Drawing & Visual Layers (rendered directly into the parent MapContainer) ── */}
      <ClickDrawHandler active={mode === 'drawing'} onAddPoint={addPoint} />

      {/* Show all existing trails as faint, sleek reference lines */}
      {visibleExistingTrails.map((t) => {
        const coords = Array.isArray(t.coordinates_json) ? t.coordinates_json : [];
        if (coords.length < 2) return null;
        const positions = coords.map((c: any) => [c.lat, c.lng] as LatLngTuple);
        const isEditing = t.id === editingTrailId;
        return (
          <Polyline
            key={t.id}
            positions={positions}
            pathOptions={{
              color: isEditing ? '#3b82f6' : '#94a3b8',
              weight: isEditing ? 5 : 2,
              opacity: isEditing ? 0.8 : 0.25,
              dashArray: isEditing ? '8 4' : '4 4',
            }}
          />
        );
      })}

      {/* Original path reference when editing (translucent blue line) */}
      {originalPath.length > 1 && editingTrailId && (
        <Polyline positions={originalPath} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.4, dashArray: '10 5' }} />
      )}

      {/* New drafted path (glowing custom amber line) */}
      {path.length > 1 && (
        <Polyline positions={path} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.95 }} />
      )}
      {path.length > 0 && (
        <Marker
          position={path[0]}
          icon={routeStartIcon}
          draggable={isEditingPoints}
          title={isEditingPoints ? 'Drag route start' : 'Route start'}
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const next = marker.getLatLng();
              movePathPoint(0, [next.lat, next.lng]);
            },
          }}
        />
      )}
      {path.length > 1 && (
        <Marker
          position={path[path.length - 1]}
          icon={routeEndIcon}
          draggable={isEditingPoints}
          title={isEditingPoints ? 'Drag route end' : 'Route end'}
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const next = marker.getLatLng();
              movePathPoint(path.length - 1, [next.lat, next.lng]);
            },
          }}
        />
      )}
      {editablePointIndexes.map((index) => (
        <Marker
          key={`edit-${index}`}
          position={path[index]}
          icon={pointIcon}
          draggable
          title={`Drag route point ${index + 1}`}
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const next = marker.getLatLng();
              movePathPoint(index, [next.lat, next.lng]);
            },
          }}
        />
      ))}

      {/* Absolute follow target locator button during GPS recordings */}
      {mode === 'recording' && path.length > 0 && (
        <div className="absolute right-4 bottom-20 z-[1000]">
          <Button
            type="button"
            size="icon"
            className={`shadow-xl rounded-xl h-10 w-10 border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-md ${
              followRecordingMap 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                : 'bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            aria-label="Follow current recording location"
            onClick={() => {
              const last = pathRef.current[pathRef.current.length - 1];
              suppressRecorderUnlockRef.current = true;
              setFollowRecordingMap(true);
              if (last) map.setView(last, Math.max(map.getZoom(), 17));
              window.setTimeout(() => {
                suppressRecorderUnlockRef.current = false;
              }, 900);
            }}
            title={followRecordingMap ? "Camera locked on location" : "Follow my location"}
          >
            <Locate className="h-5 w-5" />
          </Button>
        </div>
      )}


      {/* ── 2. Floating Console Overlay Controls (Portalled to document.body) ── */}
      {isConsoleCollapsed ? (
        createPortal(
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsConsoleCollapsed(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed top-[9.25rem] left-3 sm:left-4 z-[1000] p-3 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border border-slate-200/60 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2 group pointer-events-auto"
            title="Expand Route Editor Panel"
          >
            <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 pr-1">Show Editor</span>
            <Activity className="h-4 w-4 text-slate-400" />
          </button>,
          document.body
        )
      ) : (
        createPortal(
          <div 
            className="fixed top-[9.25rem] bottom-3 left-3 z-[1000] w-[calc(100%-1.5rem)] sm:bottom-4 sm:left-4 sm:w-[380px] flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200/50 dark:border-slate-800/50 shadow-2xl pointer-events-auto overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-500/10 p-1.5 rounded-lg">
                  <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Route Editor
                  </h2>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Mt. Kalisungan Path Manager
                  </span>
                </div>
              </div>
              
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setIsConsoleCollapsed(true)}
                title="Collapse Panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Scrollable controls list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Standalone and linked GPS recordings */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Recorded GPS Trails ({availableRecordings.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadAvailableRecordings()}
                    disabled={availableRecordingsLoading}
                    className="text-slate-400 transition-colors hover:text-blue-600 disabled:opacity-50"
                    title="Reload recorded trails"
                    aria-label="Reload recorded trails"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${availableRecordingsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {availableRecordings.length > 0 ? (
                  <>
                    <Select
                      value={selectedRecordingId ?? undefined}
                      onValueChange={(recordingId) => {
                        const recording = availableRecordings.find((item) => item.id === recordingId);
                        if (recording) loadRecordingForReview(recording);
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-slate-200/60 bg-slate-50/50 text-xs dark:border-slate-800/60 dark:bg-slate-950/40">
                        <SelectValue placeholder="Select a recorded trail..." />
                      </SelectTrigger>
                      <SelectContent className="z-[3200] max-h-64">
                        {availableRecordings.map((recording) => {
                          const pointCount = pointsFromJson(recording.cleaned_points_json).length;
                          const routeName = recording.notes?.trim() || `Recording ${new Date(recording.created_at).toLocaleDateString()}`;
                          return (
                            <SelectItem key={recording.id} value={recording.id} className="text-xs">
                              {routeName} - {pointCount} pts ({recording.review_decision === 'approved' ? 'official' : 'draft'})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    {selectedAvailableRecording && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 rounded-lg text-xs"
                          onClick={() => loadRecordingForReview(selectedAvailableRecording)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview Track
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 gap-1.5 rounded-lg bg-emerald-600 text-xs text-white hover:bg-emerald-500"
                          disabled={recordingActionId === selectedAvailableRecording.id}
                          onClick={() => void publishRecordingAsOfficial(selectedAvailableRecording)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Publish Path
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {availableRecordingsLoading ? 'Loading recorded trails...' : 'No saved GPS recordings found for this location.'}
                  </div>
                )}
              </div>

              {/* Load existing trail */}
              {visibleExistingTrails.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-1">
                    Route Library ({visibleExistingTrails.length})
                  </span>
                  <Select value={editingTrailId ?? undefined} onValueChange={loadExistingTrail}>
                    <SelectTrigger className="text-xs h-9 bg-slate-50/50 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800/60 rounded-xl">
                      <SelectValue placeholder="Select trail to edit..." />
                    </SelectTrigger>
                    <SelectContent className="z-[3200] max-h-60">
                      {visibleExistingTrails.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name} {t.is_official ? '(official)' : '(draft)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedTrailForDelete && path.length > 0 && (
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-2.5 dark:border-slate-800/70 dark:bg-slate-950/40">
                      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[9px] font-bold uppercase text-slate-400">Distance</p>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{formatMeters(recordedDistanceM)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase text-slate-400">Points</p>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{path.length}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase text-slate-400">Status</p>
                          <p className="truncate text-xs font-bold capitalize text-slate-800 dark:text-slate-100">
                            {selectedTrailForDelete.is_official ? 'Official' : 'Draft'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 rounded-lg text-xs"
                          onClick={focusPathOnMap}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={isEditingPoints ? 'default' : 'outline'}
                          className="h-9 gap-1.5 rounded-lg text-xs"
                          disabled={mode === 'recording'}
                          onClick={() => setIsEditingPoints((current) => !current)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {isEditingPoints ? 'Done Editing' : 'Edit Points'}
                        </Button>
                      </div>
                      {isEditingPoints && (
                        <p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                          Drag the start, end, or amber handles. Large GPS tracks show evenly spaced handles to keep the map smooth.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedTrailForDelete && (
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-1.5 h-8 w-full gap-1.5 text-xs rounded-xl font-bold bg-rose-600/10 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200/30 dark:border-rose-900/40 transition-colors"
                      disabled={deletingTrailId === selectedTrailForDelete.id}
                      onClick={() => deleteTrailPermanently(selectedTrailForDelete.id, selectedTrailForDelete.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Trail
                    </Button>
                  )}
                </div>
              )}

              {/* Trail info parameters */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-1">
                  Route Details
                </span>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Input 
                      placeholder="Trail name" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      className="text-xs h-9 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl" 
                    />
                  </div>
                  <div>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="text-xs h-9 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[3200]">
                        <SelectItem value="easy" className="text-xs">Easy</SelectItem>
                        <SelectItem value="moderate" className="text-xs">Moderate</SelectItem>
                        <SelectItem value="hard" className="text-xs">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Input 
                      placeholder="Elevation (m)" 
                      type="number" 
                      value={elevation} 
                      onChange={(e) => setElevation(e.target.value)} 
                      className="text-xs h-9 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl" 
                    />
                  </div>
                  <div className="col-span-2">
                    <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'active')}>
                      <SelectTrigger className="text-xs h-9 bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[3200]">
                        <SelectItem value="active" className="text-xs">Official Active Route</SelectItem>
                        <SelectItem value="draft" className="text-xs">Draft / Review Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-1">
                  Editor Controls
                </span>

                <div className="flex gap-2 flex-wrap">
                  {mode === 'idle' && (
                    <>
                      <Button 
                        size="sm" 
                        onClick={startDrawing} 
                        className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs flex-1 h-9 rounded-xl shadow-md transition-all"
                      >
                        <MousePointer className="h-3.5 w-3.5" /> 
                        Draw Path
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        onClick={startRecording} 
                        className="gap-1.5 text-xs flex-1 h-9 rounded-xl border border-slate-200/50 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      >
                        <Play className="h-3.5 w-3.5 text-blue-500" /> 
                        GPS Record
                      </Button>
                    </>
                  )}

                  {mode === 'drawing' && (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={stopDrawing} 
                      className="gap-1.5 text-xs w-full h-9 rounded-xl animate-pulse shadow-md"
                    >
                      <Square className="h-3.5 w-3.5" /> 
                      Stop Drawing (Lock Path)
                    </Button>
                  )}

                  {mode === 'recording' && (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={stopRecording} 
                      className="gap-1.5 text-xs w-full h-9 rounded-xl animate-pulse shadow-md"
                    >
                      <Square className="h-3.5 w-3.5" /> 
                      Stop GPS Capture
                    </Button>
                  )}

                  {path.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 w-full">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={undoLastPoint} 
                        className="gap-1 text-xs h-9 rounded-xl border border-slate-200/65 dark:border-slate-800/65"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> 
                        Undo
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={clearPath} 
                        className="gap-1 text-xs h-9 rounded-xl border-rose-200/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> 
                        Discard
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={saveTrail} 
                        disabled={saving} 
                        className="gap-1 text-xs h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        <Save className="h-3.5 w-3.5" /> 
                        {saving
                          ? 'Saving...'
                          : editingTrailId
                            ? 'Update Route'
                            : rawGpsPointsRef.current.length > 0
                              ? 'Save Recording'
                              : 'Save Route'}
                      </Button>
                    </div>
                  )}

                  {editingTrailId && (
                    <Dialog open={recordingsModalOpen} onOpenChange={setRecordingsModalOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary" className="gap-1.5 text-xs w-full h-9 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                          <GitCompare className="h-3.5 w-3.5 text-blue-500" /> 
                          Compare Repeat GPS Tracks ({trailRecordings.length})
                        </Button>
                      </DialogTrigger>
                      <DialogContent 
                        className="z-[3100] max-h-[85vh] max-w-3xl overflow-y-auto"
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        <DialogHeader>
                          <DialogTitle>Compare GPS Tracks & Recordings</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 border-b">
                          <p className="text-xs text-muted-foreground">
                            Load alternate records onto map, publish cleanest track as the official route lines, or clean poor captures.
                          </p>
                          <Select value={recordingSort} onValueChange={(v) => setRecordingSort(v as typeof recordingSort)}>
                            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[3200]">
                              <SelectItem value="newest">Newest first</SelectItem>
                              <SelectItem value="quality">Best quality</SelectItem>
                              <SelectItem value="distance">Longest distance</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3 mt-3">
                          {recordingsLoading ? (
                            <div className="rounded-xl border border-border/30 bg-muted/20 p-4 text-xs text-muted-foreground text-center">
                              Loading previous trail tracks...
                            </div>
                          ) : sortedTrailRecordings.length === 0 ? (
                            <div className="rounded-xl border border-border/30 bg-muted/20 p-4 text-xs text-muted-foreground text-center">
                              No previous raw/cleaned recordings yet for this trail.
                            </div>
                          ) : (
                            sortedTrailRecordings.map((recording) => {
                              const quality = recording.quality_summary ?? {};
                              const review = reviewRecordingQuality(quality);
                              const busy = recordingActionId === recording.id;
                              return (
                                <div key={recording.id} className="rounded-xl border border-border/40 bg-background/60 p-3.5 text-xs flex flex-col gap-3">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-foreground">{new Date(recording.created_at).toLocaleString()}</span>
                                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold px-2 py-0.5 capitalize text-slate-700 dark:text-slate-300">{review.label} Quality</span>
                                        <span className="rounded-full bg-blue-50 dark:bg-blue-950 text-[10px] font-bold px-2 py-0.5 capitalize text-blue-700 dark:text-blue-300">Status: {recording.review_decision ?? 'pending'}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground sm:grid-cols-5 pt-1">
                                        <span>Raw: <b className="text-foreground font-semibold">{quality.rawPointCount ?? '--'}</b></span>
                                        <span>Clean: <b className="text-foreground font-semibold">{quality.cleanedPointCount ?? '--'}</b></span>
                                        <span>Rejected: <b className="text-foreground font-semibold">{quality.rejectedPointCount ?? '--'}</b></span>
                                        <span>Inferred: <b className="text-foreground font-semibold">{quality.estimatedPointCount ?? '--'}</b></span>
                                        <span>Accuracy: <b className="text-foreground font-semibold">{quality.averageAccuracyM == null ? '--' : `${Number(quality.averageAccuracyM).toFixed(1)}m`}</b></span>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        Distance: <b>{formatMeters(quality.distanceM)}</b> / Match score: <b>{review.score}/100</b>
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5 w-full lg:w-auto shrink-0 mt-2 lg:mt-0">
                                      <Button size="sm" variant="outline" className="flex-1 lg:flex-none h-8 text-[11px] rounded-lg" onClick={() => loadRecordingForReview(recording)} disabled={busy}>
                                        Load
                                      </Button>
                                      <Button size="sm" className="flex-1 lg:flex-none h-8 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg" onClick={() => publishRecordingAsOfficial(recording)} disabled={busy}>
                                        Publish
                                      </Button>
                                      <Button size="sm" variant="destructive" className="flex-1 lg:flex-none h-8 text-[11px] rounded-lg" onClick={() => deleteTrailRecording(recording)} disabled={busy}>
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Dynamic state instruction banner */}
              <div className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/60 font-medium">
                {mode === 'drawing' && '🔴 DRAW MODE ACTIVE: Click directly on the main fullscreen map to insert route segments.'}
                {mode === 'recording' && `🟢 GPS CAPTURE: Pinned ${path.length} points, Distance: ${(recordedDistanceM / 1000).toFixed(2)}km, Elapsed: ${Math.floor(recordedDurationSec / 60)}:${String(recordedDurationSec % 60).padStart(2, '0')}`}
                {mode === 'idle' && path.length > 0 && `📝 DRAFT PATH READY: ${path.length} segments defined. Specify details above & tap save.`}
                {mode === 'idle' && path.length === 0 && '💡 Choose a trail above to modify, or click "Draw Path" or "GPS Record" to chart a new route directly on the mountain.'}
              </div>

              {/* Quality details panel */}
              {currentQuality && currentReview && (
                <div className="rounded-xl border border-blue-100/50 dark:border-blue-900/30 bg-blue-50/10 dark:bg-blue-950/10 p-3 space-y-2.5">
                  <div className="flex items-start gap-2 border-b border-blue-100/30 dark:border-blue-900/20 pb-1.5">
                    {currentReview.level === 'good' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                    ) : currentReview.level === 'poor' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-500 shrink-0" />
                    ) : (
                      <Activity className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <div>
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 block">Quality Assessment</span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        GPS Accuracy: <span className="text-blue-600 dark:text-blue-400 font-bold">{currentReview.label}</span> ({currentReview.score}/100)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    {[
                      ['Raw', currentQuality.rawPointCount],
                      ['Cleaned', currentQuality.cleanedPointCount],
                      ['Discarded', currentQuality.rejectedPointCount],
                      ['Inferred', currentQuality.estimatedPointCount],
                      ['Accuracy', currentQuality.averageAccuracyM == null ? '--' : `${currentQuality.averageAccuracyM.toFixed(1)}m`],
                      ['Distance', formatMeters(currentQuality.distanceM)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-1.5 border border-slate-200/30 dark:border-slate-800/30 text-center">
                        <div className="text-[8px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>

                  {currentReview.reasons.length > 0 && (
                    <div className="text-[9px] text-slate-500 dark:text-slate-400 space-y-0.5 bg-white/40 dark:bg-slate-900/30 p-2 rounded-lg border border-slate-200/20 dark:border-slate-800/20">
                      {currentReview.reasons.slice(0, 3).map((reason) => (
                        <div key={reason} className="flex items-start gap-1">
                          <span className="text-blue-500 shrink-0">•</span>
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>,
          document.body
        )
      )}
    </>
  );
}
