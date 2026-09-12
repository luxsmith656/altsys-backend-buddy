import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { officialRoutesForLocation, type OfficialRouteCandidate } from '@/lib/officialRoutes';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import { Button } from '@/components/ui/button';
import { Activity, Plus, Minus, Loader2, Navigation, MapPin } from 'lucide-react';
import MapWorkspace from '@/components/map/MapWorkspace';
import LiveGroupDetails from '@/components/map/LiveGroupDetails';
import { gpsPresentation, type LiveMapGroup } from '@/lib/liveMapPresentation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLocations } from '@/hooks/useLocations';
import { parseMeta } from '@/lib/bookingMeta';
import { routeStationsFromMetadata } from '@/lib/map-data';
import type { CompanionDetail } from '@/types';

interface Props {
  /** When set, only show data for this location. null = all (super_admin). */
  locationId: string | null;
  /** Allow admin/super_admin to add checkpoints by clicking the map. */
  canAddCheckpoints?: boolean;
  tools?: ReactNode;
  routeActions?: ReactNode;
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
  peakDeadlineAt?: string | null;
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
  coordinates_json?: unknown;
  recording_metadata?: unknown;
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

export default function RealtimeMonitorMap(props: Props) {
  return <ScopedMonitorMap key={props.locationId ?? 'all'} {...props} />;
}

function ScopedMonitorMap({ locationId, canAddCheckpoints = false, tools, routeActions }: Props) {
  const { locations } = useLocations();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hikerLayer = useRef<L.LayerGroup | null>(null);
  const checkpointLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);

  const [rawSessions, setRawSessions] = useState<ActiveSession[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [officialRoutes, setOfficialRoutes] = useState<TrailZoneRef[]>([]);
  const [progress, setProgress] = useState<Record<string, { checkpoint_id: string; created_at: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [placingCheckpoint, setPlacingCheckpoint] = useState(false);
  const placingRef = useRef(false);
  placingRef.current = placingCheckpoint;
  const loadVersion = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'cluster' | 'individual'>('cluster');
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
      zoomControl: false,
      // Leaflet's delayed CSS zoom completion can outlive a tracker/simulation switch.
      zoomAnimation: false,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(mapRef.current);

    hikerLayer.current = L.layerGroup().addTo(mapRef.current);
    checkpointLayer.current = L.layerGroup().addTo(mapRef.current);
    routeLayer.current = L.layerGroup().addTo(mapRef.current);

    if (canAddCheckpoints) {
      mapRef.current.on('click', (e) => {
        if (!placingRef.current) return;
        setPendingCp({ lat: e.latlng.lat, lng: e.latlng.lng });
        setPlacingCheckpoint(false);
        setCpName('');
        setCpDesc('');
        setCpRadius(30);
      });
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false })) : null;
    observer?.observe(containerRef.current);
    return () => {
      loadVersion.current++;
      observer?.disconnect();
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
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError(false);

    let cpQuery = supabase.from('checkpoints' as any).select('*').order('order_index');
    if (locationId) cpQuery = cpQuery.eq('location_id', locationId);
    const { data: cpData, error: cpError } = await cpQuery;
    if (version !== loadVersion.current) return;

    let routeQuery = supabase
      .from('trail_zones' as any)
      .select('id,location_id,name,coordinates_json,recording_metadata,status,is_official,review_status')
      .eq('status', 'active')
      .eq('is_official', true)
      .eq('review_status', 'approved')
      .order('created_at', { ascending: true });
    if (locationId) routeQuery = routeQuery.eq('location_id', locationId);
    const { data: routeData, error: routeError } = await routeQuery;
    if (version !== loadVersion.current) return;
    // Published geometry must not depend on session/location telemetry succeeding.
    // Keep the last validated route on a failed refresh; a successful empty result
    // still clears it when a route is unpublished. Scope changes remount this map.
    if (!routeError) setOfficialRoutes(officialRoutesForLocation((routeData as unknown as (TrailZoneRef & OfficialRouteCandidate)[]) ?? [], locationId));
    if (!cpError) setCheckpoints((cpData as unknown as Checkpoint[]) ?? []);

    const sessQuery = supabase
      .from('hiker_sessions' as any)
      .select('id,user_id,booking_id,trail_zone_id,location_id,participant_role,tracking_phase,total_distance_km,moving_time_sec,resting_time_sec,peak_reached_at,descent_started_at,start_time,client_session_id')
      .eq('status', 'active')
      .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`);
    const { data: sessData, error: sessionError } = await sessQuery;
    if (version !== loadVersion.current) return;
    if (sessionError) {
      setLoadError(true);
      setRawSessions([]);
      setLoading(false);
      return;
    }
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
        s.hiker_name = meta.fullName || s.hiker_name;
        s.guideName = meta.assignedGuide || 'Not assigned';
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
        s.tracking_phase = meta.groupPhase ?? s.tracking_phase;
        s.peak_reached_at = meta.peakReachedAt ?? s.peak_reached_at;
        s.descent_started_at = meta.descentStartedAt ?? s.descent_started_at;
        s.peakDeadlineAt = meta.peakDeadlineAt ?? null;
      });
    } else if (locationId) {
      sessList = sessList.filter((s) => {
        const trailLocationId = s.trail_zone_id ? trailZoneMap[s.trail_zone_id]?.location_id : null;
        return (s.location_id ?? trailLocationId) === locationId;
      });
    }

    let nextProgress: Record<string, { checkpoint_id: string; created_at: string }[]> = {};

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
        if (row.latitude != null && row.longitude != null && gpsPresentation({ lat: Number(row.latitude), lng: Number(row.longitude), timestamp: row.timestamp }, Date.now()).hasFix && !latest[row.session_id]) {
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
        if (row.latitude != null && row.longitude != null && gpsPresentation({ lat: Number(row.latitude), lng: Number(row.longitude), timestamp: row.timestamp }, Date.now()).hasFix) {
          (paths[row.session_id] ??= []).push([Number(row.latitude), Number(row.longitude)]);
        }
      });
      sessList.forEach((s) => { s.path = paths[s.id] ?? []; });

      // Names from profiles
      const userIds = Array.from(new Set(sessList.map((s) => s.user_id)));
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id,full_name')
        .in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });
      sessList.forEach((session) => {
        session.hiker_name = session.hiker_name || nameMap[session.user_id] || 'Hiker Lead';
        const guide = sessList.find((candidate) => candidate.booking_id === session.booking_id && session.booking_id && candidate.participant_role === 'guide');
        if (guide && nameMap[guide.user_id]) session.guideName = nameMap[guide.user_id];
      });

      // Survey progress per session
      const { data: surveys } = await supabase
        .from('checkpoint_surveys' as any)
        .select('session_id,checkpoint_id,created_at')
        .in('session_id', ids);
      const map: Record<string, { checkpoint_id: string; created_at: string }[]> = {};
      ((surveys as any[]) ?? []).forEach((row) => {
        if (!row.session_id) return;
        (map[row.session_id] ??= []).push({ checkpoint_id: row.checkpoint_id, created_at: row.created_at });
      });
      nextProgress = map;
    }

    if (version !== loadVersion.current) return;
    setProgress(nextProgress);
    setLoadError(Boolean(cpError || routeError));
    setRawSessions(sessList);
    setLoading(false);
  };

  /* ── Filter / Cluster Sessions ── */
  useEffect(() => {
    if (viewMode === 'individual') {
      setSessions(rawSessions);
      return;
    }

    // Group by booking_id for Cluster Mode
    const grouped: ActiveSession[] = [];
    const bookingGroupMap = new Map<string, ActiveSession[]>();
    rawSessions.forEach((s) => {
      if (s.booking_id) {
        if (!bookingGroupMap.has(s.booking_id)) bookingGroupMap.set(s.booking_id, []);
        bookingGroupMap.get(s.booking_id)!.push(s);
      } else {
        grouped.push(s);
      }
    });

    bookingGroupMap.forEach((group) => {
      const primary = group.find((s) => s.participant_role === 'guide' && s.lastTs)
        || group.find((s) => s.lastTs) || group[0];
      grouped.push(primary);
    });

    setSessions(grouped);
  }, [rawSessions, viewMode]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_zones' }, () => {
        void loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  /* ── render markers ── */
  useEffect(() => {
    if (!mapRef.current || !hikerLayer.current || !checkpointLayer.current || !routeLayer.current) return;
    hikerLayer.current.clearLayers();
    checkpointLayer.current.clearLayers();
    routeLayer.current.clearLayers();

    officialRoutes.forEach((route, routeIndex) => {
      const path = Array.isArray(route.coordinates_json)
        ? route.coordinates_json
            .map((point: any) => [Number(point.lat), Number(point.lng)] as [number, number])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
        : [];
      if (path.length < 2) return;

      const routeColor = ['#059669', '#2563eb', '#dc2626', '#9333ea'][routeIndex % 4];
      L.polyline(path, {
        color: routeColor,
        weight: 5,
        opacity: 0.9,
      })
        .bindPopup(`<strong>${esc(route.name)}</strong><br/><small>Official published route</small>`)
        .addTo(routeLayer.current!);

      routeStationsFromMetadata(route.recording_metadata, path).forEach((station) => {
        const label = station.kind === 'jump_off' ? 'J' : station.kind === 'peak' ? 'P' : `S${station.index - 1}`;
        const color = station.kind === 'peak' ? '#dc2626' : station.kind === 'jump_off' ? '#059669' : '#2563eb';
        L.marker([station.lat, station.lng], {
          zIndexOffset: 100,
          icon: L.divIcon({
            className: '',
            html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;box-shadow:0 2px 7px rgba(0,0,0,.4)">${label}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .bindPopup(`<strong>${esc(station.name)}</strong><br/><small>${esc(station.description)}</small>`)
          .addTo(routeLayer.current!);
      });
    });

    // checkpoints
    checkpoints.forEach((cp, idx) => {
      const marker = L.marker([cp.latitude, cp.longitude], {
        zIndexOffset: 200,
        icon: L.divIcon({
          className: '',
          html: `<div style="background:hsl(var(--primary));color:white;width:26px;height:26px;border-radius:6px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4)">${idx + 1}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).bindPopup(`<strong>${esc(cp.name)}</strong><br/>${esc(cp.description)}<br/><small>Trigger radius: ${cp.trigger_radius_m}m</small>`);
      checkpointLayer.current!.addLayer(marker);
      L.circle([cp.latitude, cp.longitude], {
        radius: cp.trigger_radius_m,
        color: 'hsl(var(--primary))',
        fillOpacity: 0.06,
        weight: 1,
      }).addTo(checkpointLayer.current!);
    });

    // hikers / groups
    sessions.forEach((s) => {
      if (s.lastLat == null || s.lastLng == null || !gpsPresentation({ lat: s.lastLat, lng: s.lastLng, timestamp: s.lastTs }, clock).hasFix) return;
      const ageMin = s.lastTs ? Math.round((clock - new Date(s.lastTs).getTime()) / 60000) : null;
      const isOffline = ageMin == null || ageMin >= 5; // five minutes without a ping is a stale mobile position
      const role = s.participant_role ?? 'hiker';
      const isCluster = viewMode === 'cluster' && (s.groupSize ?? 1) > 1;

      // Color coding
      const markerColor = isOffline
        ? '#f97316' // Orange for offline/paused
        : role === 'guide'
        ? '#3b82f6' // Blue for guide
        : role === 'ranger'
        ? '#a855f7' // Purple for ranger
        : isCluster
        ? '#059669' // Emerald cluster
        : '#22c55e'; // Green for hiker

      if ((s.path?.length ?? 0) > 1) {
        L.polyline(s.path!, {
          color: markerColor,
          weight: 3,
          opacity: 0.55,
        }).addTo(hikerLayer.current!);
      }

      // Group spread circle if in cluster mode
      if (isCluster) {
        L.circle([s.lastLat, s.lastLng], {
          radius: 35,
          color: markerColor,
          fillColor: markerColor,
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: isOffline ? '4, 4' : undefined,
        }).addTo(hikerLayer.current!);
      }

      const iconHtml = `<span style="--marker-color:${markerColor}">${isCluster ? s.groupSize ?? 1 : role === 'guide' ? 'G' : 'H'}</span>`;
      const m = L.marker([s.lastLat!, s.lastLng!], {
        title: `${s.hiker_name ?? 'Hiker Lead'} - select group`,
        alt: `${s.hiker_name ?? 'Hiker Lead'} - select group`,
        zIndexOffset: 2000,
        icon: L.divIcon({ className: 'live-map-marker', html: iconHtml, iconSize: [44, 44], iconAnchor: [22, 22] }),
      }).on('click', () => { setSelectedId(s.id); setPanelOpen(true); });
      hikerLayer.current!.addLayer(m);
    });
  }, [sessions, checkpoints, progress, officialRoutes, viewMode, clock]);

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
      order_index: checkpoints.length + 1,
    });
    setSavingCp(false);
    if (error) {
      toast.error('Failed to create checkpoint: ' + error.message);
      return;
    }
    toast.success(`Checkpoint "${cpName}" added!`);
    setPendingCp(null);
    void loadData();
  };

  const groups: LiveMapGroup[] = sessions.map((session) => ({
    id: session.id, lead: session.hiker_name || 'Hiker Lead', guide: session.guideName,
    pax: session.groupSize, phase: session.tracking_phase,
    route: officialRoutes.find((route) => route.id === session.trail_zone_id)?.name,
    lat: session.lastLat, lng: session.lastLng, timestamp: session.lastTs,
    distanceKm: session.total_distance_km,
    companions: session.companionDetails?.length
      ? session.companionDetails.map((companion) => companion.name || 'Unnamed companion')
      : session.companions ?? [],
    phone: session.guidePhone, emergencyContact: session.emergencyContact, medicalNotes: session.medicalNotes,
  }));
  const selected = groups.find((group) => group.id === selectedId);
  const locate = (group: LiveMapGroup) => {
    if (gpsPresentation(group, clock).hasFix) mapRef.current?.setView([group.lat!, group.lng!], 17);
  };

  return (
    <section className="live-map-monitor" aria-label="Live hiking map">
      <MapWorkspace open={panelOpen} onOpenChange={setPanelOpen}
        routes={<>
          <ul className="live-map-route-list">
            {officialRoutes.map(route => <li key={route.id}><button type="button" aria-label={`Show ${route.name} on map`} onClick={() => {
              const path = route.coordinates_json as { lat: number; lng: number }[];
              const map = mapRef.current;
              map?.fitBounds(path.map(point => [point.lat, point.lng] as [number, number]), { paddingTopLeft: [30, 30], paddingBottomRight: [60, Math.min(map.getSize().y * .4, 260)], maxZoom: 17, animate: false });
            }}><strong>{route.name}</strong><small>Official published route</small></button></li>)}
          </ul>
          {!officialRoutes.length && <p className="live-map-empty">No published routes available.</p>}
          {routeActions}
        </>}
        tools={<>
      <header className="live-map-toolbar">
        <h2 className="sr-only">Live hiking map</h2>
        {loading && <Loader2 size={16} className="animate-spin" aria-label="Loading live groups" />}
        <label className="sr-only" htmlFor="live-map-view">Map grouping</label>
        <select id="live-map-view" value={viewMode} onChange={(event) => setViewMode(event.target.value as typeof viewMode)}>
          <option value="cluster">Groups</option><option value="individual">Individuals</option>
        </select>
        {canAddCheckpoints && <button type="button" className="live-map-icon" disabled={!locationId}
          aria-pressed={placingCheckpoint} aria-label="Place checkpoint" title="Place checkpoint"
          onClick={() => setPlacingCheckpoint(!placingCheckpoint)}><MapPin size={18} /></button>}
      </header>
          {tools}
        </>}
        panel={<>
        {loadError && <p role="alert" className="live-map-empty">Live data could not be fully loaded. <button type="button" onClick={() => void loadData()}>Retry</button></p>}
        <ul className="live-map-group-list" aria-label="Active groups">
          {groups.map((group) => {
            const gps = gpsPresentation(group, clock);
            return <li key={group.id}><button type="button" className="live-map-group-row" aria-pressed={selectedId === group.id}
              onClick={() => setSelectedId(group.id)}>
              <strong>{group.lead} · {group.pax == null ? 'Party unknown' : `${group.pax} pax`}</strong>
              <small>{group.phase || 'Phase not recorded'} · {gps.hasFix ? `${gps.stale ? 'Last fix' : 'GPS'} ${gps.ageLabel}` : 'Awaiting GPS'}</small>
            </button></li>;
          })}
        </ul>
        {!loading && !groups.length && !loadError && <p className="live-map-empty">No active groups at this location.</p>}
        {selected ? <LiveGroupDetails group={selected} now={clock} onLocate={() => locate(selected)} />
          : groups.length > 0 && <p className="live-map-empty live-map-muted">No group selected</p>}
      </>}>
        <div ref={containerRef} className="live-map-surface" aria-label="Live group positions" />
        <div className="live-map-tools" role="group" aria-label="Map controls">
          <button type="button" className="live-map-icon" aria-label="Zoom in" title="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={18} /></button>
          <button type="button" className="live-map-icon" aria-label="Zoom out" title="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={18} /></button>
          <button type="button" className="live-map-icon" aria-label="Recenter location" title="Recenter location" onClick={() => mapRef.current?.setView(center, 14)}><Navigation size={18} /></button>
        </div>
      </MapWorkspace>

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
    </section>
  );
}
