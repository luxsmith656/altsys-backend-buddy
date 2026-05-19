import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, MapPin, Users, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLocations } from '@/hooks/useLocations';

interface Props {
  /** When set, only show data for this location. null = all (super_admin). */
  locationId: string | null;
  /** Allow admin/super_admin to add checkpoints by clicking the map. */
  canAddCheckpoints?: boolean;
}

interface ActiveSession {
  id: string;
  user_id: string;
  location_id: string | null;
  start_time: string;
  hiker_name?: string;
  lastLat?: number;
  lastLng?: number;
  lastTs?: string;
}

interface Checkpoint {
  id: string;
  location_id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  trigger_radius_m: number;
  order_index: number;
}

const DEFAULT_CENTER: [number, number] = [14.149, 121.347];

export default function RealtimeMonitorMap({ locationId, canAddCheckpoints = false }: Props) {
  const { locations } = useLocations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hikerLayer = useRef<L.LayerGroup | null>(null);
  const checkpointLayer = useRef<L.LayerGroup | null>(null);

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [progress, setProgress] = useState<Record<string, { checkpoint_id: string; created_at: string }[]>>({});
  const [loading, setLoading] = useState(true);

  // checkpoint placement
  const [pendingCp, setPendingCp] = useState<{ lat: number; lng: number } | null>(null);
  const [cpName, setCpName] = useState('');
  const [cpDesc, setCpDesc] = useState('');
  const [cpRadius, setCpRadius] = useState(30);
  const [savingCp, setSavingCp] = useState(false);

  const center = useMemo<[number, number]>(() => {
    if (locationId) {
      const loc = locations.find((l) => l.id === locationId);
      if (loc) return [Number(loc.center_lat), Number(loc.center_lng)];
    }
    return DEFAULT_CENTER;
  }, [locationId, locations]);

  /* ── init map ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center,
      zoom: 14,
      zoomControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapRef.current);

    hikerLayer.current = L.layerGroup().addTo(mapRef.current);
    checkpointLayer.current = L.layerGroup().addTo(mapRef.current);

    if (canAddCheckpoints) {
      mapRef.current.on('click', (e) => {
        setPendingCp({ lat: e.latlng.lat, lng: e.latlng.lng });
        setCpName('');
        setCpDesc('');
        setCpRadius(30);
      });
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── recenter on location change ── */
  useEffect(() => {
    mapRef.current?.setView(center, 14);
  }, [center]);

  /* ── load checkpoints + active sessions + survey progress ── */
  const loadData = async () => {
    setLoading(true);

    let cpQuery = supabase.from('checkpoints' as any).select('*').order('order_index');
    if (locationId) cpQuery = cpQuery.eq('location_id', locationId);
    const { data: cpData } = await cpQuery;
    setCheckpoints(((cpData as unknown as Checkpoint[]) ?? []));

    let sessQuery = supabase
      .from('hiker_sessions' as any)
      .select('id,user_id,location_id,start_time')
      .eq('status', 'active');
    if (locationId) sessQuery = sessQuery.eq('location_id', locationId);
    const { data: sessData } = await sessQuery;
    const sessList = ((sessData as any[]) ?? []) as ActiveSession[];

    // Get latest location for each session
    if (sessList.length > 0) {
      const ids = sessList.map((s) => s.id);
      const { data: locData } = await supabase
        .from('hiker_locations' as any)
        .select('session_id,latitude,longitude,timestamp')
        .in('session_id', ids)
        .order('timestamp', { ascending: false })
        .limit(500);
      const latest: Record<string, { lat: number; lng: number; ts: string }> = {};
      ((locData as any[]) ?? []).forEach((row) => {
        if (!latest[row.session_id]) {
          latest[row.session_id] = { lat: Number(row.latitude), lng: Number(row.longitude), ts: row.timestamp };
        }
      });
      sessList.forEach((s) => {
        const l = latest[s.id];
        if (l) {
          s.lastLat = l.lat;
          s.lastLng = l.lng;
          s.lastTs = l.ts;
        }
      });

      // Names
      const userIds = Array.from(new Set(sessList.map((s) => s.user_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,full_name')
        .in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });
      sessList.forEach((s) => { s.hiker_name = nameMap[s.user_id] || 'Hiker'; });

      // Survey progress per session = checkpoints answered
      const { data: surveys } = await supabase
        .from('checkpoint_surveys' as any)
        .select('session_id,checkpoint_id,created_at')
        .in('session_id', ids);
      const map: Record<string, { checkpoint_id: string; created_at: string }[]> = {};
      ((surveys as any[]) ?? []).forEach((row) => {
        if (!row.session_id) return;
        (map[row.session_id] ??= []).push({ checkpoint_id: row.checkpoint_id, created_at: row.created_at });
      });
      setProgress(map);
    }

    setSessions(sessList);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  /* ── realtime subscriptions ── */
  useEffect(() => {
    const ch = supabase
      .channel(`realtime-monitor-${locationId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_locations' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkpoint_surveys' }, () => {
        void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkpoints' }, () => {
        void loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  /* ── render markers ── */
  useEffect(() => {
    if (!mapRef.current || !hikerLayer.current || !checkpointLayer.current) return;
    hikerLayer.current.clearLayers();
    checkpointLayer.current.clearLayers();

    // checkpoints
    checkpoints.forEach((cp, idx) => {
      const marker = L.marker([cp.latitude, cp.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:hsl(var(--primary));color:white;width:26px;height:26px;border-radius:6px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4)">${idx + 1}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).bindPopup(`<strong>${cp.name}</strong><br/>${cp.description || ''}<br/><small>Trigger radius: ${cp.trigger_radius_m}m</small>`);
      checkpointLayer.current!.addLayer(marker);
      L.circle([cp.latitude, cp.longitude], {
        radius: cp.trigger_radius_m,
        color: 'hsl(var(--primary))',
        fillOpacity: 0.06,
        weight: 1,
      }).addTo(checkpointLayer.current!);
    });

    // hikers
    sessions.forEach((s) => {
      if (s.lastLat == null || s.lastLng == null) return;
      const ageMin = s.lastTs ? Math.round((Date.now() - new Date(s.lastTs).getTime()) / 60000) : null;
      const stale = ageMin != null && ageMin > 5;
      const reached = (progress[s.id] ?? []).length;
      const m = L.marker([s.lastLat, s.lastLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${stale ? '#f97316' : '#22c55e'};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px ${stale ? 'rgba(249,115,22,.3)' : 'rgba(34,197,94,.3)'}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).bindPopup(
        `<strong>${s.hiker_name}</strong><br/>` +
        `Started: ${new Date(s.start_time).toLocaleTimeString()}<br/>` +
        `Last ping: ${ageMin == null ? '—' : `${ageMin} min ago`}<br/>` +
        `Checkpoints reached: ${reached}/${checkpoints.length}`,
      );
      hikerLayer.current!.addLayer(m);
    });
  }, [sessions, checkpoints, progress]);

  const saveCheckpoint = async () => {
    if (!pendingCp || !cpName.trim()) {
      toast.error('Please name the checkpoint.');
      return;
    }
    if (!locationId) {
      toast.error('Pick a specific location first to add a checkpoint.');
      return;
    }
    setSavingCp(true);
    const { error } = await supabase.from('checkpoints' as any).insert({
      location_id: locationId,
      name: cpName.trim(),
      description: cpDesc.trim(),
      latitude: pendingCp.lat,
      longitude: pendingCp.lng,
      trigger_radius_m: cpRadius,
      order_index: checkpoints.length,
    } as any);
    setSavingCp(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Checkpoint added!');
    setPendingCp(null);
    void loadData();
  };

  const totalActive = sessions.length;
  const stale = sessions.filter((s) => {
    if (!s.lastTs) return true;
    return Date.now() - new Date(s.lastTs).getTime() > 5 * 60_000;
  }).length;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" /> Real-time Hiker Monitor
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {totalActive} active</Badge>
            {stale > 0 && <Badge variant="outline" className="gap-1 text-orange-500 border-orange-500/30">⚠ {stale} stale</Badge>}
            <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {checkpoints.length} checkpoints</Badge>
          </div>
        </div>
        {canAddCheckpoints && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Plus className="h-3 w-3" /> Click anywhere on the map to add a checkpoint at that point.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={containerRef} className="w-full h-[420px] rounded-lg overflow-hidden border border-border/30" style={{ zIndex: 0 }} />

        {sessions.length > 0 && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live progress</h4>
            {sessions.map((s) => {
              const reached = (progress[s.id] ?? []).length;
              const ageMin = s.lastTs ? Math.round((Date.now() - new Date(s.lastTs).getTime()) / 60000) : null;
              const stale = ageMin != null && ageMin > 10;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full ${stale ? 'bg-orange-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="font-medium truncate">{s.hiker_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>📍 {reached}/{checkpoints.length}</span>
                    <span className={stale ? 'text-orange-500' : ''}>{ageMin == null ? 'no ping' : `${ageMin}m ago`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!pendingCp} onOpenChange={(o) => !o && setPendingCp(null)}>
        <DialogContent className="z-[3100]">
          <DialogHeader>
            <DialogTitle>Add checkpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="e.g. Rest Area 1 / Halfway Point" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={cpDesc} onChange={(e) => setCpDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs">Trigger radius (meters): {cpRadius}m</Label>
              <Input type="range" min={10} max={150} step={5} value={cpRadius} onChange={(e) => setCpRadius(+e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Mini-survey auto-prompts when a hiker enters this radius.</p>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              📍 {pendingCp?.lat.toFixed(5)}, {pendingCp?.lng.toFixed(5)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingCp(null)}>Cancel</Button>
            <Button onClick={saveCheckpoint} disabled={savingCp}>
              {savingCp && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save Checkpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
