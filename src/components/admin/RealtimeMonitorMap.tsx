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
import { parseMeta } from '@/lib/bookingMeta';
import type { CompanionDetail } from '@/types';

interface Props {
  /** When set, only show data for this location. null = all (super_admin). */
  locationId: string | null;
  /** Allow admin/super_admin to add checkpoints by clicking the map. */
  canAddCheckpoints?: boolean;
}

interface ActiveSession {
  id: string;
  user_id: string;
  booking_id: string | null;
  trail_zone_id?: string | null;
  location_id?: string | null;
  participant_role?: 'hiker' | 'guide' | 'ranger' | 'admin';
  tracking_phase?: 'ascent' | 'peak' | 'descent' | 'completed';
  total_distance_km?: number;
  moving_time_sec?: number;
  resting_time_sec?: number;
  peak_reached_at?: string | null;
  descent_started_at?: string | null;
  start_time: string;
  hiker_name?: string;
  groupSize?: number;
  guideName?: string;
  guidePhone?: string;
  hikerPhone?: string;
  emergencyContact?: string;
  companions?: string[];
  companionDetails?: CompanionDetail[];
  medicalNotes?: string;
  hasMinors?: boolean;
  minorCount?: number;
  lastLat?: number;
  lastLng?: number;
  lastTs?: string;
  path?: [number, number][];
}

interface TrailZoneRef {
  id: string;
  location_id: string | null;
  name: string;
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

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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

    const sessQuery = supabase
      .from('hiker_sessions' as any)
      .select('id,user_id,booking_id,trail_zone_id,location_id,participant_role,tracking_phase,total_distance_km,moving_time_sec,resting_time_sec,peak_reached_at,descent_started_at,start_time')
      .eq('status', 'active');
    const { data: sessData } = await sessQuery;
    let sessList = ((sessData as any[]) ?? []) as ActiveSession[];

    const trailZoneIds = Array.from(new Set(sessList.map((s) => s.trail_zone_id).filter(Boolean))) as string[];
    const trailZoneMap: Record<string, TrailZoneRef> = {};
    if (trailZoneIds.length > 0) {
      const { data: zoneData } = await supabase
        .from('trail_zones' as any)
        .select('id,location_id,name')
        .in('id', trailZoneIds);
      ((zoneData as unknown as TrailZoneRef[] | null) ?? []).forEach((z) => { trailZoneMap[z.id] = z; });
      sessList.forEach((s) => {
        if (s.trail_zone_id && trailZoneMap[s.trail_zone_id]) {
          (s as any).trail_zone_name = trailZoneMap[s.trail_zone_id].name;
        }
      });
    }

    const bookingIds = Array.from(new Set(sessList.map((s) => s.booking_id).filter(Boolean))) as string[];
    const bookingMap: Record<string, any> = {};
    if (bookingIds.length > 0) {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id,location_id,group_size,emergency_contact_name,emergency_contact_phone,notes')
        .in('id', bookingIds);
      ((bookingData as any[]) ?? []).forEach((b) => { bookingMap[b.id] = b; });
      if (locationId) {
        sessList = sessList.filter((s) => {
          const bookingLocationId = s.booking_id ? bookingMap[s.booking_id]?.location_id : null;
          const trailLocationId = s.trail_zone_id ? trailZoneMap[s.trail_zone_id]?.location_id : null;
          return (bookingLocationId ?? s.location_id ?? trailLocationId) === locationId;
        });
      }
      sessList.forEach((s) => {
        const booking = s.booking_id ? bookingMap[s.booking_id] : null;
        if (!booking) return;
        const meta = parseMeta(booking.notes);
        s.location_id = booking.location_id;
        s.groupSize = booking.group_size;
        s.hiker_name = meta.fullName || booking.emergency_contact_name || s.hiker_name || 'Hiker';
        s.guideName = meta.assignedGuide || meta.preferredGuide || 'Not assigned';
        s.guidePhone = meta.guidePhone;
        s.hikerPhone = meta.phoneNumber || booking.emergency_contact_phone;
        s.emergencyContact = booking.emergency_contact_name
          ? `${booking.emergency_contact_name}${booking.emergency_contact_phone ? ` (${booking.emergency_contact_phone})` : ''}`
          : undefined;
        s.companions = meta.companions ?? [];
        s.companionDetails = meta.companionDetails ?? [];
        s.medicalNotes = meta.medicalNotes;
        s.hasMinors = meta.hasMinors;
        s.minorCount = meta.minorCount;
      });
    } else if (locationId) {
      sessList = sessList.filter((s) => {
        const trailLocationId = s.trail_zone_id ? trailZoneMap[s.trail_zone_id]?.location_id : null;
        return (s.location_id ?? trailLocationId) === locationId;
      });
    }

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

      const { data: pathData } = await supabase
        .from('hiker_locations' as any)
        .select('session_id,latitude,longitude,timestamp')
        .in('session_id', ids)
        .order('timestamp', { ascending: true })
        .limit(1500);
      const paths: Record<string, [number, number][]> = {};
      ((pathData as any[]) ?? []).forEach((row) => {
        (paths[row.session_id] ??= []).push([Number(row.latitude), Number(row.longitude)]);
      });
      sessList.forEach((s) => { s.path = paths[s.id] ?? []; });

      // Names
      const userIds = Array.from(new Set(sessList.map((s) => s.user_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,full_name')
        .in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });
      sessList.forEach((s) => { s.hiker_name = s.hiker_name || nameMap[s.user_id] || 'Hiker'; });

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
      const role = s.participant_role ?? 'hiker';
      const markerColor = stale ? '#f97316' : role === 'guide' ? '#3b82f6' : role === 'ranger' ? '#a855f7' : '#22c55e';
      const distanceKm = Number(s.total_distance_km ?? 0);
      const movingMin = Math.round(Number(s.moving_time_sec ?? 0) / 60);
      const pace = distanceKm > 0 && movingMin > 0 ? movingMin / distanceKm : null;
      if ((s.path?.length ?? 0) > 1) {
        L.polyline(s.path!, {
          color: markerColor,
          weight: 3,
          opacity: 0.55,
        }).addTo(hikerLayer.current!);
      }
      const companionRows = s.companionDetails?.length
        ? s.companionDetails.map((c, i) =>
          `<li>${esc(c.name || `Companion ${i + 1}`)}${c.age ? `, ${esc(c.age)}` : ''}${c.city ? ` - ${esc(c.city)}` : ''}</li>`,
        ).join('')
        : (s.companions ?? []).map((c) => `<li>${esc(c)}</li>`).join('');
      const popupHtml = `
        <div style="min-width:240px;max-width:300px">
          <strong>${esc(s.hiker_name)}</strong>
          <div style="margin-top:6px;font-size:12px;line-height:1.45">
            <div><b>Tracker:</b> ${esc(role)} ${s.tracking_phase ? `- ${esc(s.tracking_phase)}` : ''}</div>
            ${s.trail_zone_id && trailZoneMap[s.trail_zone_id] ? `<div><b>Route:</b> ${esc(trailZoneMap[s.trail_zone_id].name)}</div>` : ''}
            <div><b>Group:</b> ${s.groupSize ?? 1} hiker${(s.groupSize ?? 1) === 1 ? '' : 's'}</div>
            <div><b>Assigned guide:</b> ${esc(s.guideName || 'Not assigned')}</div>
            ${s.guidePhone ? `<div><b>Guide phone:</b> ${esc(s.guidePhone)}</div>` : ''}
            ${s.hikerPhone ? `<div><b>Hiker phone:</b> ${esc(s.hikerPhone)}</div>` : ''}
            ${s.emergencyContact ? `<div><b>Emergency:</b> ${esc(s.emergencyContact)}</div>` : ''}
            <div><b>Started:</b> ${new Date(s.start_time).toLocaleTimeString()}</div>
            <div><b>Last ping:</b> ${ageMin == null ? 'no ping yet' : `${ageMin} min ago`}</div>
            <div><b>Distance:</b> ${distanceKm.toFixed(2)} km</div>
            <div><b>Moving:</b> ${movingMin} min</div>
            <div><b>Pace:</b> ${pace == null ? 'not enough data' : `${pace.toFixed(1)} min/km`}</div>
            <div><b>Checkpoints:</b> ${reached}/${checkpoints.length}</div>
            <div><b>Trail points:</b> ${s.path?.length ?? 0}</div>
            ${s.hasMinors ? `<div style="color:#b45309"><b>Minors:</b> ${s.minorCount ?? 1}</div>` : ''}
            ${s.medicalNotes ? `<div style="color:#dc2626"><b>Medical:</b> ${esc(s.medicalNotes)}</div>` : ''}
            ${companionRows ? `<div style="margin-top:6px"><b>Companions</b><ul style="margin:3px 0 0 16px;padding:0">${companionRows}</ul></div>` : ''}
          </div>
        </div>
      `;
      const m = L.marker([s.lastLat, s.lastLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${markerColor};width:${role === 'guide' ? 18 : 16}px;height:${role === 'guide' ? 18 : 16}px;border-radius:${role === 'guide' ? '4px' : '50%'};border:3px solid white;box-shadow:0 0 0 3px ${stale ? 'rgba(249,115,22,.3)' : 'rgba(34,197,94,.3)'}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).bindPopup(popupHtml);
      hikerLayer.current!.addLayer(m);
    });
  }, [sessions, checkpoints, progress]);

  /* ── Inactivity alert: warn admin when a hiker hasn't pinged in 20+ min ── */
  const alertedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const check = () => {
      sessions.forEach((s) => {
        if (!s.lastTs) return;
        const ageMin = (Date.now() - new Date(s.lastTs).getTime()) / 60000;
        if (ageMin >= 20 && !alertedRef.current.has(s.id)) {
          alertedRef.current.add(s.id);
          toast.error(`⚠ Inactivity alert: ${s.hiker_name} has not pinged in ${Math.round(ageMin)} min.`, {
            duration: 12000,
            id: `inactivity-${s.id}`,
          });
        }
        // Reset once they ping again
        if (ageMin < 5) alertedRef.current.delete(s.id);
      });
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [sessions]);

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
                    <span className="text-[10px] uppercase text-muted-foreground">{s.participant_role ?? 'hiker'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>📍 {reached}/{checkpoints.length}</span>
                    <span className="capitalize">{s.tracking_phase ?? 'ascent'}</span>
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
