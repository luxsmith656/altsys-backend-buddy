import { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMapEvents, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Play, Square, MousePointer, Navigation, Trash2, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { MT_KALISUNGAN_CENTER, DEFAULT_ZOOM } from '@/lib/map-data';
import { buildRecordingQuality, MotionGpsFilter, normalizeTrackPoint, postProcessTrack, type GpsTrackPoint } from '@/lib/tracking/gpsFilter';
import { useAuth } from '@/hooks/useAuth';
import type { LatLngTuple } from 'leaflet';

const pointIcon = new L.DivIcon({
  html: `<div style="width:10px;height:10px;background:#f59e0b;border:2px solid #fff;border-radius:50%;"></div>`,
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
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

function RecordingMapFollower({ path, active }: { path: LatLngTuple[]; active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (path.length === 0) return;
    const last = path[path.length - 1];
    if (active) {
      map.setView(last, Math.max(map.getZoom(), 17));
    } else if (path.length > 1) {
      map.fitBounds(L.latLngBounds(path), { padding: [24, 24] });
    }
  }, [active, map, path]);
  return null;
}

interface TrailRecorderProps {
  existingTrails?: {
    id: string;
    name: string;
    coordinates_json: any;
    status?: string;
    difficulty?: string;
    elevation_meters?: number;
    review_status?: string;
    source?: string;
    raw_recording_json?: any;
    cleaned_recording_json?: any;
    recording_metadata?: any;
  }[];
  onSaved?: () => void;
}

export default function TrailRecorder({ existingTrails, onSaved }: TrailRecorderProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'idle' | 'drawing' | 'recording'>('idle');
  const [path, setPath] = useState<LatLngTuple[]>([]);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState('moderate');
  const [elevation, setElevation] = useState('');
  const [status, setStatus] = useState<'draft' | 'active'>('active');
  const [saving, setSaving] = useState(false);
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsFilterRef = useRef<MotionGpsFilter | null>(null);
  const predictedCountRef = useRef(0);
  const rawGpsPointsRef = useRef<GpsTrackPoint[]>([]);
  const cleanedGpsPointsRef = useRef<GpsTrackPoint[]>([]);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingNow, setRecordingNow] = useState(Date.now());
  const pathRef = useRef<LatLngTuple[]>([]);
  const offlineDraftKey = 'altsys-admin-trail-recorder-draft';

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // GPS recording
  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    gpsFilterRef.current = new MotionGpsFilter({
      minAccuracyForStartM: 50,
      maxAccuracyM: 85,
      minAppendDistanceM: 1.6,
    });
    predictedCountRef.current = 0;
    rawGpsPointsRef.current = [];
    cleanedGpsPointsRef.current = [];
    setMode('recording');
    setPath([]);
    pathRef.current = [];
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
          toast.warning(`Weak GPS ignored (${Math.round(accuracy)}m). Recording is still active offline.`, { id: 'trail-recorder-accuracy' });
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
    navigator.geolocation.getCurrentPosition(
      acceptPosition,
      (err) => toast.error(`GPS Error: ${err.message}`),
      options
    );
    watchRef.current = navigator.geolocation.watchPosition(
      acceptPosition,
      (err) => toast.error(`GPS Error: ${err.message}`),
      options
    );
    pollRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(acceptPosition, () => {}, options);
    }, 3500);
  }, []);

  const stopRecording = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
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
    toast.success(`Recorded ${pathRef.current.length} points. Review the trail on the map before saving.`);
  }, [path.length]);

  const startDrawing = () => {
    setMode('drawing');
    setPath([]);
    toast.info('Click on the map to draw trail points');
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
    gpsFilterRef.current?.reset();
    gpsFilterRef.current = null;
    predictedCountRef.current = 0;
    rawGpsPointsRef.current = [];
    cleanedGpsPointsRef.current = [];
    localStorage.removeItem(offlineDraftKey);
  };

  const [originalPath, setOriginalPath] = useState<LatLngTuple[]>([]);

  const loadExistingTrail = (trailId: string) => {
    const trail = existingTrails?.find((t) => t.id === trailId);
    if (trail) {
      setEditingTrailId(trailId);
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
        ? trail.raw_recording_json
            .filter((c: any) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
            .map(trackPointFromJson)
        : [];
      setOriginalPath(parsed);
      toast.info(`Loaded trail "${trail.name}" for editing`);
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
      const payload = {
        name: name.trim(),
        difficulty,
        elevation_meters: elevation ? parseInt(elevation) : 0,
        coordinates_json: coordsJson,
        cleaned_recording_json: coordsJson,
        raw_recording_json: rawRecordingJson,
        recording_metadata: qualitySummary,
        recording_count: 1,
        status,
        review_status: status === 'active' ? 'approved' : 'pending',
        is_official: status === 'active',
        official_at: status === 'active' ? new Date().toISOString() : null,
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
        savedTrailId = data?.id ?? null;
        toast.success('Trail saved successfully!');
      }

      if (savedTrailId && user?.id) {
        await supabase.from('trail_recordings' as any).insert({
          trail_zone_id: savedTrailId,
          recorded_by: user.id,
          source: rawGpsPointsRef.current.length > 0 ? 'gps_recording' : 'manual_editor',
          status,
          raw_points_json: rawRecordingJson,
          cleaned_points_json: coordsJson,
          quality_summary: qualitySummary,
        });
      }

      setPath([]);
      setName('');
      setElevation('');
      setStatus('active');
      setEditingTrailId(null);
      pathRef.current = [];
      rawGpsPointsRef.current = [];
      cleanedGpsPointsRef.current = [];
      localStorage.removeItem(offlineDraftKey);
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

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
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
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" />
          Trail Route Editor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Load existing trail */}
        {existingTrails && existingTrails.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Edit Existing Trail</label>
            <Select onValueChange={loadExistingTrail}>
              <SelectTrigger><SelectValue placeholder="Select trail to edit..." /></SelectTrigger>
              <SelectContent>
                {existingTrails.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.status === 'draft' ? '(draft)' : '(official)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Trail info inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="Trail name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-1" />
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Elevation (m)" type="number" value={elevation} onChange={(e) => setElevation(e.target.value)} />
          <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'active')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Official Active</SelectItem>
              <SelectItem value="draft">Draft Review</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Recording controls */}
        <div className="flex gap-2 flex-wrap">
          {mode === 'idle' && (
            <>
              <Button size="sm" onClick={startDrawing} className="gap-1">
                <MousePointer className="h-3 w-3" /> Draw on Map
              </Button>
              <Button size="sm" variant="secondary" onClick={startRecording} className="gap-1">
                <Play className="h-3 w-3" /> GPS Record
              </Button>
            </>
          )}
          {mode === 'drawing' && (
            <Button size="sm" variant="destructive" onClick={stopDrawing} className="gap-1">
              <Square className="h-3 w-3" /> Stop Drawing
            </Button>
          )}
          {mode === 'recording' && (
            <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1">
              <Square className="h-3 w-3" /> Stop Recording
            </Button>
          )}
          {path.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={undoLastPoint} className="gap-1">
                <Undo2 className="h-3 w-3" /> Undo
              </Button>
              <Button size="sm" variant="outline" onClick={clearPath} className="gap-1">
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
              <Button size="sm" onClick={saveTrail} disabled={saving} className="gap-1">
                <Save className="h-3 w-3" /> {editingTrailId ? 'Update' : 'Save'} Trail
              </Button>
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {mode === 'drawing' && 'Click on the map below to add trail points.'}
          {mode === 'recording' && `Recording... ${path.length} points, ${(recordedDistanceM / 1000).toFixed(2)} km, ${Math.floor(recordedDurationSec / 60)}:${String(recordedDurationSec % 60).padStart(2, '0')}`}
          {mode === 'idle' && path.length > 0 && `${path.length} points ready. Enter details and save.`}
        </div>

        {/* Mini map for drawing */}
        <div className="h-[300px] rounded-lg overflow-hidden border border-border/30">
          <MapContainer center={MT_KALISUNGAN_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl={true}>
            <TileLayer
              attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            />
            <ClickDrawHandler active={mode === 'drawing'} onAddPoint={addPoint} />
            <RecordingMapFollower path={path} active={mode === 'recording'} />

            {/* Show all existing trails as faint reference lines */}
            {existingTrails?.map((t) => {
              const coords = Array.isArray(t.coordinates_json) ? t.coordinates_json : [];
              if (coords.length < 2) return null;
              const positions = coords.map((c: any) => [c.lat, c.lng] as LatLngTuple);
              const isEditing = t.id === editingTrailId;
              return (
                <Polyline
                  key={t.id}
                  positions={positions}
                  pathOptions={{
                    color: isEditing ? '#3b82f6' : '#6b7280',
                    weight: isEditing ? 3 : 2,
                    opacity: isEditing ? 0.7 : 0.3,
                    dashArray: isEditing ? '8 4' : '4 4',
                  }}
                />
              );
            })}

            {/* Original path when editing (blue reference) */}
            {originalPath.length > 1 && editingTrailId && (
              <Polyline positions={originalPath} pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.5, dashArray: '8 4' }} />
            )}

            {/* New/edited path (yellow) */}
            {path.length > 1 && (
              <Polyline positions={path} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '5 5' }} />
            )}
            {path.map((p, i) => (
              <Marker key={i} position={p} icon={pointIcon} />
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
