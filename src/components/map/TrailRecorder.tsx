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
  }[];
  onSaved?: () => void;
}

export default function TrailRecorder({ existingTrails, onSaved }: TrailRecorderProps) {
  const [mode, setMode] = useState<'idle' | 'drawing' | 'recording'>('idle');
  const [path, setPath] = useState<LatLngTuple[]>([]);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState('moderate');
  const [elevation, setElevation] = useState('');
  const [status, setStatus] = useState<'draft' | 'active'>('active');
  const [saving, setSaving] = useState(false);
  const [editingTrailId, setEditingTrailId] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  // GPS recording
  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    setMode('recording');
    setPath([]);
    toast.info('GPS recording started. Walk the trail path.');

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
        setPath((prev) => [...prev, point]);
      },
      (err) => toast.error(`GPS Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, []);

  const stopRecording = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setMode('idle');
    toast.success(`Recorded ${path.length} points`);
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
    setEditingTrailId(null);
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
      const coordsJson = path.map(([lat, lng]) => ({ lat, lng }));
      const payload = {
        name: name.trim(),
        difficulty,
        elevation_meters: elevation ? parseInt(elevation) : 0,
        coordinates_json: coordsJson,
        status,
        review_status: status === 'active' ? 'approved' : 'pending',
        is_official: status === 'active',
        official_at: status === 'active' ? new Date().toISOString() : null,
        max_capacity: 50,
      };

      if (editingTrailId) {
        const { error } = await supabase.from('trail_zones').update(payload).eq('id', editingTrailId);
        if (error) throw error;
        toast.success('Trail updated successfully!');
      } else {
        const { error } = await supabase.from('trail_zones').insert(payload);
        if (error) throw error;
        toast.success('Trail saved successfully!');
      }

      setPath([]);
      setName('');
      setElevation('');
      setStatus('active');
      setEditingTrailId(null);
      onSaved?.();
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
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
          {mode === 'recording' && `Recording... ${path.length} points captured`}
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
