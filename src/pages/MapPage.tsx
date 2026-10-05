import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  routeStationsFromMetadata,
  buildRouteStations,
  normalizeOfficialRoutePath,
  getDefaultTrailForLocation,
  MT_KALISUNGAN_CENTER,
  DEFAULT_ZOOM,
  TRAILS,
  haversineDistance,
  type RouteStation,
} from '@/lib/map-data';
import { Button } from '@/components/ui/button';
import { 
  MapPinned, 
  Layers, 
  Activity, 
  Compass, 
  Users, 
  RefreshCw, 
  Navigation,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Plus,
  Minus
} from 'lucide-react';
import { toast } from 'sonner';
import ActiveHikersLayer, { type MapHikerFilterMode, type SimulationRouteConfig } from '@/components/map/ActiveHikersLayer';
import LiveSessionsLayer from '@/components/map/LiveSessionsLayer';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import MapWorkspace from '@/components/map/MapWorkspace';
import LiveGroupDetails from '@/components/map/LiveGroupDetails';
import type { LiveMapGroup } from '@/lib/liveMapPresentation';
import TrailRecorder from '@/components/map/TrailRecorder';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { officialRoutesForLocation } from '@/lib/officialRoutes';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';

import 'leaflet/dist/leaflet.css';

interface DBTrailZone {
  id: string;
  location_id: string | null;
  name: string;
  difficulty: string | null;
  elevation_meters: number | null;
  coordinates_json: unknown;
  status: string | null;
  is_official?: boolean;
  review_status?: string;
  source?: string;
  raw_recording_json?: unknown;
  cleaned_recording_json?: unknown;
  recording_metadata?: unknown;
  recording_count?: number;
  recorded_by?: string | null;
}

interface SimulatedHiker {
  id: string;
  name: string;
  guideName: string;
  guidePhone: string;
  groupSize: number;
  startTime: string;
  emergencyContact: string;
  medicalNotes: string | null;
  hasMinors: boolean;
  minorCount: number;
  companions: string[];
  progress: number;
  phase: 'ascent' | 'peak' | 'descent' | 'completed' | 'sos';
  speedMultiplier: number;
  peakReachedAt: string | null;
  peakTimerLeft: number;
  totalDistanceKm: number;
  direction: 1 | -1;
  hasWarnedAboutTimer?: boolean;
  routeId?: string;
}

interface OfficialStation {
  index: number;
  name: string;
  pos: [number, number];
  description: string;
}

type MapTrail = (typeof TRAILS)[number] & {
  id?: string;
  stations?: RouteStation[];
  locationId?: string | null;
  locationName?: string;
};

// Fix default marker icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Helper for schema cache errors
function isSchemaCacheError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return message.includes('schema cache') || message.includes('could not find') || message.includes('column');
}

// Leaflet map instance bridge to expose map instance to parent state
function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, onReady]);
  return null;
}

// Official Summit Trail stations matching ActiveHikersLayer coordinates
const OFFICIAL_STATIONS: OfficialStation[] = [
  { index: 1, name: 'Jump off: Start of Trail (0 km)', pos: [14.1440, 121.3430], description: 'Main trailhead. Registration, safety briefing, and guide assignment.' },
  { index: 2, name: 'Station 1: Bamboo Grove (1 km)', pos: [14.1455, 121.3440], description: 'Cool rest point shaded by bamboo arches. Emergency kit available.' },
  { index: 3, name: 'Station 2: Forest Canopy Rest (2 km)', pos: [14.1468, 121.3448], description: 'Midway point rest stop. High-canopy forest shade.' },
  { index: 4, name: 'Station 3: Mountain Spring (3 km)', pos: [14.1478, 121.3455], description: 'Water source rest point under giant trees.' },
  { index: 5, name: 'Station 4: Wilderness Ridge (4 km)', pos: [14.1483, 121.3458], description: 'Steep ridge rest area. pre-summit scenic viewing spot.' },
  { index: 6, name: 'Station 5: Summit Camp (5 km)', pos: [14.1488, 121.3460], description: 'Final staging area camp before the summit assault.' },
  { index: 7, name: 'Mt. Kalisungan Peak (Summit - 6 km)', pos: [14.1495, 121.3462], description: 'Summit (629m). Breathtaking 360-degree views of Southern Tagalog.' },
];

function routeStationIcon(station: RouteStation) {
  const label = station.kind === 'jump_off' ? 'J' : station.kind === 'peak' ? 'P' : `S${station.index - 1}`;
  const color = station.kind === 'peak' ? '#dc2626' : station.kind === 'jump_off' ? '#059669' : '#2563eb';
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;display:grid;place-items:center;background:${color};color:white;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(15,23,42,.4);font:700 10px system-ui">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function MapPage() {
  const { role, user } = useAuth();
  const { activeLocationId, loading: locationsLoading, isSuperAdmin, locations } = useLocations();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('map-workspace-open');
    return () => document.body.classList.remove('map-workspace-open');
  }, []);
  
  const isTrailRecorder = role === 'ranger' || role === 'guide' || role === 'admin' || role === 'super_admin';
  const canMonitorAll = role === 'ranger' || role === 'admin' || role === 'super_admin';
  const isSelfTrackingRole = role === 'hiker' || role === 'guide';
  const [activeMapTab, setActiveMapTab] = useState<'tracker' | 'editor'>('tracker');
  
  const [dbTrails, setDbTrails] = useState<MapTrail[]>([]);
  const [rawTrailZones, setRawTrailZones] = useState<DBTrailZone[]>([]);
  const [scopeMode, setScopeMode] = useState<'all' | 'one' | 'two'>('all');
  const [scopeLocationIds, setScopeLocationIds] = useState<string[]>([]);
  const [routeFilterId, setRouteFilterId] = useState('all');
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  const [simulationHikers, setSimulationHikers] = useState<SimulatedHiker[]>([]);
  const [assignedTrailZoneId, setAssignedTrailZoneId] = useState<string | null>(null);
  const [officialRoutesRevision, setOfficialRoutesRevision] = useState(0);

  // Redesign state: Collapsible sidebar, card expansions, search
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.matchMedia('(max-width: 639px)').matches,
  );
  const [simulationControlsOpen, setSimulationControlsOpen] = useState(false);
  const [simulationMode, setSimulationMode] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const [selfLocation, setSelfLocation] = useState<{ lat: number; lng: number; timestamp?: string } | null>(null);
  const [selfGroup, setSelfGroup] = useState<LiveMapGroup | null>(null);
  const [simControlsElement, setSimControlsElement] = useState<HTMLDivElement | null>(null);
  const [mapClock, setMapClock] = useState(Date.now);
  const [activeSelfSession, setActiveSelfSession] = useState<{ id: string; booking_id: string | null; participant_role?: string; tracking_phase?: string } | null>(null);
  const [phaseSaving, setPhaseSaving] = useState(false);
  const [expandedHikerId, setExpandedHikerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapFilterMode, setMapFilterMode] = useState<MapHikerFilterMode>('group');
  const [onlyActiveSessions, setOnlyActiveSessions] = useState(true);
  useEffect(() => { const id = window.setInterval(() => setMapClock(Date.now()), 30000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    setSelfGroup(null);
    if (!activeSelfSession?.booking_id || !isSelfTrackingRole) return;
    let active = true;
    void supabase.from('bookings').select('group_size,notes').eq('id', activeSelfSession.booking_id).maybeSingle().then(({ data, error }) => {
      if (!active || !data || error) return;
      const meta = parseMeta(data.notes);
      setSelfGroup({ id: activeSelfSession.id, lead: meta.fullName || 'My group', guide: meta.assignedGuide,
        pax: data.group_size, phone: meta.guidePhone, route: meta.assignedTrailName,
        companions: meta.companions ?? [] });
    });
    return () => { active = false; };
  }, [activeSelfSession?.booking_id, activeSelfSession?.id, isSelfTrackingRole]);
  const barangayLocations = useMemo(() => locations.filter((location) => {
    const key = `${location.slug} ${location.name}`.toLowerCase();
    return key.includes('lamot-1') || key.includes('lamot 1') || key.includes('lamot-2') || key.includes('lamot 2') || key.includes('sto-tomas') || key.includes('sto. tomas') || key.includes('sto tomas');
  }), [locations]);
  const mayChooseMultipleLocations = role === 'super_admin' || role === 'mdrrmo';
  const scopeCount = scopeMode === 'one' ? 1 : scopeMode === 'two' ? 2 : barangayLocations.length;
  const effectiveScopeIds = useMemo(() => {
    if (!mayChooseMultipleLocations) return activeLocationId ? [activeLocationId] : [];
    const valid = scopeLocationIds.filter((id) => barangayLocations.some((location) => location.id === id));
    return valid.length >= scopeCount ? valid.slice(0, scopeCount) : barangayLocations.slice(0, scopeCount).map((location) => location.id);
  }, [activeLocationId, barangayLocations, mayChooseMultipleLocations, scopeCount, scopeLocationIds]);
  const scopeTrails = useMemo(() => dbTrails.filter((trail) => !trail.locationId || !effectiveScopeIds.length || effectiveScopeIds.includes(trail.locationId)), [dbTrails, effectiveScopeIds]);
  const displayTrails = useMemo(() => routeFilterId === 'all' ? scopeTrails : scopeTrails.filter((trail) => (trail.id ?? trail.name) === routeFilterId), [routeFilterId, scopeTrails]);
  const availableTrails: MapTrail[] = displayTrails;
  // A local fallback is used only for the staff simulation canvas; it is never rendered as an official route.
  const fallbackDefaultTrail = getDefaultTrailForLocation(activeLocationId);
  const currentTrail: MapTrail = availableTrails[0] || ({ ...fallbackDefaultTrail, stations: buildRouteStations(fallbackDefaultTrail.path) } as MapTrail);
  const currentRouteDistanceKm = currentTrail.path.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = currentTrail.path[index - 1];
    return total + haversineDistance(previous[0], previous[1], point[0], point[1]);
  }, 0);
  const simulationRoutes = useMemo<SimulationRouteConfig[]>(() => availableTrails.map((trail) => ({
    id: trail.id ?? trail.name,
    name: trail.name,
    locationName: trail.locationName ?? 'Trailhead',
    path: trail.path as [number, number][],
    stations: trail.stations ?? buildRouteStations(trail.path),
    distanceKm: trail.path.slice(1).reduce((sum, point, index) => sum + haversineDistance(
      trail.path[index][0], trail.path[index][1], point[0], point[1]), 0),
  })), [availableTrails]);

  const toggleScopeLocation = (locationId: string) => {
    setScopeLocationIds((current) => {
      const selection = current.length ? current : effectiveScopeIds;
      if (selection.includes(locationId)) return selection.filter((id) => id !== locationId);
      return selection.length < scopeCount ? [...selection, locationId] : [...selection.slice(1), locationId];
    });
  };

  // Tracker routes and editor routes intentionally use different visibility rules.
  const fetchTrails = useCallback(async () => {
    const restrictToAssignedTrail = (role === 'hiker' || role === 'guide') && !!assignedTrailZoneId;
    let trackerQuery = supabase
      .from('trail_zones')
      .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,status,is_official,review_status,recording_metadata')
      .eq('status', 'active')
      .eq('is_official', true)
      .eq('review_status', 'approved')
      .order('created_at', { ascending: true });
    if (restrictToAssignedTrail) {
      trackerQuery = trackerQuery.eq('id', assignedTrailZoneId) as typeof trackerQuery;
    } else if (activeLocationId && role !== 'super_admin' && role !== 'mdrrmo') {
      trackerQuery = trackerQuery.eq('location_id', activeLocationId) as typeof trackerQuery;
    }
    
    const { data: trackerData, error } = await trackerQuery;
    if (error) toast.error('Published routes could not be loaded. Please reconnect and retry.');
    const trackerRows = (trackerData as DBTrailZone[]) ?? [];
    const referenceRow = trackerRows
      .filter((row) => {
        const location = locations.find((item) => item.id === row.location_id);
        const routeLabel = `${row.name} ${location?.slug ?? ''} ${location?.name ?? ''}`.toLowerCase();
        return routeLabel.includes('lamot-2') || routeLabel.includes('lamot 2') || routeLabel.includes('lamot2');
      })
      .sort((a, b) => (Array.isArray(b.coordinates_json) ? b.coordinates_json.length : 0) - (Array.isArray(a.coordinates_json) ? a.coordinates_json.length : 0))[0];
    const referencePath = Array.isArray(referenceRow?.coordinates_json)
      ? (referenceRow.coordinates_json as { lat: number; lng: number }[])
          .map((point) => [Number(point.lat), Number(point.lng)] as [number, number])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
      : undefined;
    const loaded = officialRoutesForLocation(trackerRows, restrictToAssignedTrail || role === 'super_admin' || role === 'mdrrmo' ? undefined : activeLocationId)
      .map((trail, index) => {
        const coords = Array.isArray(trail.coordinates_json) ? (trail.coordinates_json as { lat: number; lng: number }[]) : [];
        const rawPath = coords
          .map((p) => [Number(p.lat), Number(p.lng)] as [number, number])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        const assignedLocation = locations.find((location) => location.id === trail.location_id);
        const routeText = `${trail.name} ${assignedLocation?.slug ?? ''} ${assignedLocation?.name ?? ''}`.toLowerCase();
        const namedTrailhead = routeText.includes('lamot 1') || routeText.includes('lamot-1') || routeText.includes('lamot1')
          ? barangayLocations.find((location) => location.slug.includes('lamot-1'))
          : routeText.includes('sto. tomas') || routeText.includes('sto tomas') || routeText.includes('sto-tomas')
            ? barangayLocations.find((location) => location.slug.includes('sto-tomas'))
            : routeText.includes('lamot 2') || routeText.includes('lamot-2') || routeText.includes('lamot2')
              ? barangayLocations.find((location) => location.slug.includes('lamot-2')) : undefined;
        const trailhead = namedTrailhead ?? assignedLocation;
        const path = normalizeOfficialRoutePath(rawPath, `${trailhead?.slug ?? ''} ${trailhead?.name ?? ''} ${trail.name} ${activeLocationId ?? ''}`, referencePath);
        if (path.length < 2) return null;
        let distanceKm = 0;
        for (let i = 1; i < path.length; i++) {
          distanceKm += haversineDistance(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
        }
        const colors = ['#16a34a', '#2563eb', '#dc2626', '#9333ea', '#ea580c'];
        return {
          id: trail.id,
          locationId: namedTrailhead?.id ?? trail.location_id,
          locationName: trailhead?.name ?? 'Unassigned trailhead',
          name: trail.name || `Official Trail ${index + 1}`,
          difficulty: (trail.difficulty || 'moderate') as 'easy' | 'moderate' | 'hard',
          color: colors[index % colors.length],
          elevation: `${Number(trail.elevation_meters || 0)}m`,
          distance: `${distanceKm.toFixed(1)} km`,
          path,
          stations: (() => {
            const stations = routeStationsFromMetadata(trail.recording_metadata, rawPath);
            return stations.length >= 2
              && stations[0].lat === path[0][0]
              && stations[0].lng === path[0][1]
              && stations[stations.length - 1].lat === path[path.length - 1][0]
              && stations[stations.length - 1].lng === path[path.length - 1][1]
              ? stations
              : buildRouteStations(path);
          })(),
        };
      })
      .filter(Boolean) as MapTrail[];

    setDbTrails(loaded);

    if (isTrailRecorder) {
      let editorQuery = supabase
        .from('trail_zones')
        .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,status,is_official,review_status,source,raw_recording_json,cleaned_recording_json,recording_metadata,recording_count,recorded_by')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });
      if (activeLocationId && role !== 'super_admin') {
        editorQuery = editorQuery.eq('location_id', activeLocationId) as typeof editorQuery;
      }

      const editorResult = await editorQuery;
      if (!editorResult.error) {
        setRawTrailZones((editorResult.data as DBTrailZone[]) ?? []);
      } else if (isSchemaCacheError(editorResult.error)) {
        let editorFallback = supabase
          .from('trail_zones')
          .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,status')
          .neq('status', 'deleted')
          .order('created_at', { ascending: false });
        if (activeLocationId && role !== 'super_admin') {
          editorFallback = editorFallback.eq('location_id', activeLocationId) as typeof editorFallback;
        }
        const fallbackResult = await editorFallback;
        setRawTrailZones((fallbackResult.data as DBTrailZone[]) ?? []);
      } else {
        toast.error(`Could not load editable routes: ${editorResult.error.message}`);
      }
    } else {
      setRawTrailZones([]);
    }
  }, [role, assignedTrailZoneId, activeLocationId, isTrailRecorder, locations, barangayLocations]);

  useEffect(() => {
    let active = true;
    if (!user || (role !== 'hiker' && role !== 'guide')) {
      setAssignedTrailZoneId(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      const { data, error } = await supabase
        .from('hiker_sessions')
        .select('trail_zone_id,start_time,status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (error && !isSchemaCacheError(error)) {
        console.warn('Unable to load assigned trail for hiker map', error);
        return;
      }
      setAssignedTrailZoneId((data as { trail_zone_id?: string | null } | null)?.trail_zone_id ?? null);
    })();

    return () => {
      active = false;
    };
  }, [role, user]);

  useEffect(() => {
    if (!user || !isSelfTrackingRole) {
      setActiveSelfSession(null);
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('hiker_sessions')
        .select('id,booking_id,participant_role,tracking_phase')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) setActiveSelfSession(data as typeof activeSelfSession);
    })();
    const channel = supabase
      .channel(`self-phase-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions', filter: `user_id=eq.${user.id}` }, () => {
        void supabase
          .from('hiker_sessions')
          .select('id,booking_id,participant_role,tracking_phase')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => active && setActiveSelfSession(data as typeof activeSelfSession));
      })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [isSelfTrackingRole, user]);

  const setOwnGroupPhase = async (phase: 'peak' | 'descent') => {
    if (!activeSelfSession?.booking_id) return;
    if (phase === 'peak' && role !== 'hiker' && role !== 'guide') return;
    if (phase === 'descent' && role !== 'guide') return;
    setPhaseSaving(true);
    const now = new Date().toISOString();
    const { data: booking, error: bookingReadError } = await supabase
      .from('bookings')
      .select('notes')
      .eq('id', activeSelfSession.booking_id)
      .maybeSingle();
    if (bookingReadError || !booking) {
      toast.error('Could not update the group hike status.');
      setPhaseSaving(false);
      return;
    }
    const meta = parseMeta(booking.notes);
    const nextMeta = phase === 'peak'
      ? {
          ...meta,
          groupPhase: 'peak' as const,
          peakReachedAt: now,
          peakDeadlineAt: new Date(Date.now() + (2 + Number(meta.peakExtensionHours ?? 0)) * 60 * 60 * 1000).toISOString(),
        }
      : { ...meta, groupPhase: 'descent' as const, descentStartedAt: now };
    const sessionUpdate = phase === 'peak'
      ? { tracking_phase: 'peak', peak_reached_at: now }
      : { tracking_phase: 'descent', descent_started_at: now };
    const [{ error: sessionError }, { error: bookingError }] = await Promise.all([
      supabase.from('hiker_sessions').update(sessionUpdate as any).eq('id', activeSelfSession.id),
      supabase.from('bookings').update({ notes: encodeMeta(nextMeta) }).eq('id', activeSelfSession.booking_id),
    ]);
    if (sessionError || bookingError) toast.error(`Status update could not be saved: ${(sessionError || bookingError)?.message}`);
    else {
      setActiveSelfSession({ ...activeSelfSession, tracking_phase: phase });
      toast.success(phase === 'peak' ? 'Peak arrival saved. Your two-hour stay is now running.' : 'Descent saved and shared with your admin.');
    }
    setPhaseSaving(false);
  };

  useEffect(() => {
    fetchTrails();
  }, [fetchTrails, officialRoutesRevision]);

  useEffect(() => {
    const channel = supabase
      .channel(`official-route-map-${user?.id ?? 'guest'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trail_zones' },
        () => setOfficialRoutesRevision((revision) => revision + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Sync hiker list from the simulated localStorage state in ActiveHikersLayer
  const loadSimulatedHikers = useCallback(() => {
    const saved = localStorage.getItem('trail_hiker_simulation_state');
    if (saved) {
      try {
        setSimulationHikers(JSON.parse(saved));
      } catch (e) {
        // Fallback
      }
    }
  }, []);

  useEffect(() => {
    if (!canMonitorAll) {
      setSimulationHikers([]);
      return;
    }
    loadSimulatedHikers();
    const interval = setInterval(loadSimulatedHikers, 1000);
    return () => clearInterval(interval);
  }, [canMonitorAll, loadSimulatedHikers]);

  // Center/zoom map onto a selected simulated hiker's interpolated position
  const handleLocateHiker = (hiker: SimulatedHiker) => {
    if (!mapInstance) return;
    
    const routePath = (simulationRoutes.find((route) => route.id === hiker.routeId) ?? simulationRoutes[0])?.path ?? currentTrail.path;
    const scaledProgress = Math.max(0, Math.min(1, hiker.progress / 9)) * (routePath.length - 1);
    const index = Math.floor(scaledProgress);
    const nextIndex = Math.min(index + 1, routePath.length - 1);
    const ratio = scaledProgress - index;
    const [lat1, lng1] = routePath[index];
    const [lat2, lng2] = routePath[nextIndex];
    const lat = lat1 + (lat2 - lat1) * ratio;
    const lng = lng1 + (lng2 - lng1) * ratio;
    
    mapInstance.setView([lat, lng], 18);
    toast.info(`Locating Hiker Group`, {
      description: `Centered map on ${hiker.name}.`,
      duration: 3000
    });
  };

  // Center/zoom map onto a selected station
  const handleLocateStation = (st: OfficialStation) => {
    if (!mapInstance) return;
    mapInstance.setView(st.pos, 18);
    toast.info(`Station Focused`, {
      description: `Viewing ${st.name}.`,
      duration: 3500
    });
  };

  // Calculate simulated hikers resting/crossing each station
  const hikersAtStation = (stationIndex: number) => {
    return simulationHikers.filter((h) => {
      if (h.phase === 'completed') return false;
      
      const currentStation = Math.round((Math.max(0, Math.min(9, h.progress)) / 9) * 6) + 1;
      
      return currentStation === stationIndex;
    });
  };

  // Search and filter logic
  const filteredHikers = useMemo(() => {
    return simulationHikers.filter((h) => {
      if (onlyActiveSessions && h.phase === 'completed') return false;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        h.name.toLowerCase().includes(query) ||
        h.guideName.toLowerCase().includes(query) ||
        (h.companions && h.companions.some((c) => c.toLowerCase().includes(query)))
      );
    });
  }, [simulationHikers, searchQuery, onlyActiveSessions]);

  const currentOfficialStations: OfficialStation[] = currentTrail?.stations?.length
    ? currentTrail.stations.map((station) => ({
        index: station.index,
        name: station.name,
        pos: [station.lat, station.lng],
        description: station.description,
      }))
    : OFFICIAL_STATIONS;

  const handleSelfLocationChange = useCallback((location: { lat: number; lng: number; timestamp?: string } | null) => {
    setSelfLocation(location);
  }, []);

  const locateSelf = () => {
    if (!mapInstance || !selfLocation) return;
    mapInstance.setView([selfLocation.lat, selfLocation.lng], Math.max(mapInstance.getZoom(), 17), { animate: true });
  };

  const simulated = filteredHikers.find((hiker) => hiker.id === expandedHikerId);
  const selfPanel = activeSelfSession ? (
    <LiveGroupDetails group={{ ...(selfGroup ?? { id: activeSelfSession.id, lead: 'My group', companions: [] }),
      ...selfLocation, phase: activeSelfSession.tracking_phase }} now={mapClock} onLocate={locateSelf}
      actions={<>
        {activeSelfSession.tracking_phase === 'ascent' && <Button onClick={() => void setOwnGroupPhase('peak')} disabled={phaseSaving}>We are at the peak</Button>}
        {role === 'guide' && activeSelfSession.tracking_phase === 'peak' && <Button onClick={() => void setOwnGroupPhase('descent')} disabled={phaseSaving}>Start group descent</Button>}
      </>} />
  ) : <p className="live-map-empty">Check in at your jump-off to start your hike.</p>;
  const simulationPanel = <>
    <p className="live-map-simulation-label">Simulation only. These positions are not live GPS.</p>
    <div className="p-3 space-y-3">
      <label className="sr-only" htmlFor="simulation-search">Search simulated groups</label>
      <input id="simulation-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
        className="w-full h-11 border border-input bg-background px-3 rounded" placeholder="Search simulated groups" />
      <Button variant="outline" className="w-full" onClick={() => setSimulationControlsOpen(!simulationControlsOpen)}
        aria-expanded={simulationControlsOpen}>Simulation controls</Button>
      <div ref={setSimControlsElement} />
    </div>
    <ul className="live-map-group-list" aria-label="Simulated groups">
      {filteredHikers.map((hiker) => <li key={hiker.id}><button type="button" className="live-map-group-row"
        aria-pressed={hiker.id === expandedHikerId} onClick={() => setExpandedHikerId(hiker.id)}>
        <strong>{hiker.name} · {hiker.groupSize} pax</strong>
        <small>{simulationRoutes.find((route) => route.id === hiker.routeId)?.locationName ?? currentTrail.locationName} · {simulationRoutes.find((route) => route.id === hiker.routeId)?.name ?? currentTrail.name}</small>
        <small>{hiker.phase} · {Math.round(hiker.progress / 9 * 100)}% of ascent</small>
      </button></li>)}
    </ul>
    {simulated && <LiveGroupDetails group={{ id: simulated.id, lead: simulated.name, guide: simulated.guideName, pax: simulated.groupSize,
      phase: simulated.phase, phone: simulated.guidePhone, companions: simulated.companions ?? [], distanceKm: simulated.totalDistanceKm,
      route: simulationRoutes.find((route) => route.id === simulated.routeId)?.name ?? currentTrail.name,
      emergencyContact: simulated.emergencyContact, medicalNotes: simulated.medicalNotes ?? undefined,
      simulated: true }} now={mapClock} onLocate={() => handleLocateHiker(simulated)} />}
  </>;

  const routeActions = isTrailRecorder ? <div className="live-map-menu">
    <Button variant="ghost" onClick={() => setActiveMapTab(activeMapTab === 'editor' ? 'tracker' : 'editor')}>
      <Layers size={18} />{activeMapTab === 'editor' ? 'Back to live map' : 'Open route editor'}
    </Button>
  </div> : null;
  const mapTools = <div className="live-map-menu">
    {canMonitorAll && activeMapTab === 'tracker' && <Button variant="ghost"
      aria-pressed={simulationMode} aria-label={simulationMode ? 'Disable simulation mode' : 'Enable simulation mode'}
      onClick={() => { setSimulationMode(!simulationMode); setSimulationControlsOpen(false); setWorkspacePanelOpen(!simulationMode); }}>
      <Activity size={18} />{simulationMode ? 'Exit simulation' : 'Simulation'}
    </Button>}
  </div>;
  const routePanel = <>
    {mayChooseMultipleLocations && <section className="space-y-3 border-b border-border p-3" aria-label="Barangay simulation scope">
      <p className="text-xs font-semibold text-muted-foreground">Show trailheads</p>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Choose barangay scope">
        {(['one', 'two', 'all'] as const).map((mode) => <Button key={mode} type="button" size="sm"
          variant={scopeMode === mode ? 'default' : 'outline'} aria-pressed={scopeMode === mode}
          onClick={() => {
            setScopeMode(mode);
            setRouteFilterId('all');
            if (mode !== 'all') setScopeLocationIds(barangayLocations.slice(0, mode === 'one' ? 1 : 2).map((location) => location.id));
          }}>{mode === 'all' ? 'All' : mode === 'one' ? '1 barangay' : '2 barangays'}</Button>)}
      </div>
      {scopeMode === 'one' && <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Barangay</span>
        <select className="h-10 w-full rounded border border-input bg-background px-3" value={effectiveScopeIds[0] ?? ''}
          onChange={(event) => setScopeLocationIds([event.target.value])}>
          {barangayLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>}
      {scopeMode === 'two' && <div className="space-y-2">{barangayLocations.map((location) => <label key={location.id} className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" checked={effectiveScopeIds.includes(location.id)} onChange={() => toggleScopeLocation(location.id)} />{location.name}
      </label>)}</div>}
    </section>}
    <section className="space-y-2 p-3">
      <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Trail</span>
        <select className="h-10 w-full rounded border border-input bg-background px-3" value={routeFilterId}
          onChange={(event) => setRouteFilterId(event.target.value)}>
          <option value="all">All trails in scope</option>
          {scopeTrails.map((trail) => <option key={trail.id ?? trail.name} value={trail.id ?? trail.name}>{trail.name} · {trail.locationName}</option>)}
        </select>
      </label>
      {canMonitorAll && <Button type="button" className="w-full" onClick={() => {
        setActiveMapTab('tracker');
        setSimulationMode(true);
        setSimulationControlsOpen(true);
        setWorkspacePanelOpen(true);
      }}><Activity size={16} /> Start simulation · {scopeMode === 'all' ? 'all trailheads' : scopeMode === 'one' ? '1 barangay' : '2 barangays'}</Button>}
    </section>
    <ul className="live-map-route-list">
      {availableTrails.map((trail) => <li key={trail.id ?? trail.name}>
        <button type="button" aria-label={`Show ${trail.name} on map`} onClick={() => {
          setRouteFilterId(trail.id ?? trail.name);
          if (mapInstance && trail.path.length) mapInstance.fitBounds(trail.path, {
            paddingTopLeft: [30, 30], paddingBottomRight: [60, Math.min(mapInstance.getSize().y * .4, 260)], maxZoom: 17, animate: false,
          });
        }}><strong>{trail.name}</strong><small>{trail.locationName} · Published route</small></button>
      </li>)}
    </ul>
    {!availableTrails.length && <p className="live-map-empty">No published route is available for your hike.</p>}
    {routeActions}
  </>;

  return (
    <div className="live-map-page">
      <h1 className="live-map-caption">{isSelfTrackingRole ? 'My hike' : 'Map'}</h1>
      {canMonitorAll && activeMapTab === 'tracker' && !simulationMode ? (
        locationsLoading || (!isSuperAdmin && !activeLocationId)
          ? <p className="live-map-empty" role="status">Loading your assigned location...</p>
          : <RealtimeMonitorMap locationId={activeLocationId} canAddCheckpoints={role === 'admin' || role === 'super_admin'} tools={mapTools} routeActions={routeActions} />
      ) : (
        <div className="live-map-page-body">
          <MapWorkspace title={simulationMode ? 'Simulation groups' : 'My hike'} open={workspacePanelOpen} onOpenChange={setWorkspacePanelOpen}
            routes={routePanel} tools={mapTools}
            panel={activeMapTab === 'editor' ? null : simulationMode ? simulationPanel : selfPanel}>
            <MapContainer center={MT_KALISUNGAN_CENTER} zoom={DEFAULT_ZOOM} minZoom={3} maxZoom={20}
              zoomAnimation={false} zoomSnap={0.5} zoomDelta={0.5} wheelPxPerZoomLevel={80}
              scrollWheelZoom touchZoom doubleClickZoom dragging keyboard
              className="h-full w-full" zoomControl={false} attributionControl={true}>
              <MapInstanceBridge onReady={setMapInstance} />
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} attribution="© OpenStreetMap" />
              {activeMapTab === 'tracker' ? <>
                {user && isSelfTrackingRole && <LiveSessionsLayer mode="self" userId={user.id} userRole={role} onSelfLocationChange={handleSelfLocationChange} />}
                {canMonitorAll && simulationMode && <ActiveHikersLayer showStations={false} routePath={currentTrail.path as [number, number][]}
                  routeStations={currentTrail.stations} routeDistanceKm={currentRouteDistanceKm} simulationRoutes={simulationRoutes} simulationControlsOpen={simulationControlsOpen}
                  filterMode={mapFilterMode} onlyActive={onlyActiveSessions} onSimulationControlsOpenChange={setSimulationControlsOpen}
                  controlsEmbedded controlsContainer={simControlsElement} />}
                {availableTrails.map((trail) => <Polyline key={trail.id ?? trail.name} positions={trail.path} pathOptions={{ color: trail.color, weight: 5 }} />)}
                {availableTrails.flatMap((trail) => (trail.stations ?? []).map((station) => <Marker key={`${trail.id ?? trail.name}:${station.id}`}
                  position={[station.lat, station.lng]} icon={routeStationIcon(station)} zIndexOffset={100}>
                  <Popup><strong>{station.name}</strong><p>{trail.name}</p><p>{station.description}</p></Popup>
                </Marker>))}
              </> : <TrailRecorder existingTrails={rawTrailZones} locationId={activeLocationId} onSaved={fetchTrails} />}
            </MapContainer>
            {activeMapTab === 'tracker' && <div className="live-map-tools" role="group" aria-label="Map controls">
              <button type="button" className="live-map-icon" aria-label="Zoom in" title="Zoom in" onClick={() => mapInstance?.zoomIn()}><Plus size={18} /></button>
              <button type="button" className="live-map-icon" aria-label="Zoom out" title="Zoom out" onClick={() => mapInstance?.zoomOut()}><Minus size={18} /></button>
              {isSelfTrackingRole && <button type="button" className="live-map-icon" aria-label="Locate my live position" title="Locate my live position"
                disabled={!selfLocation} onClick={locateSelf}><Navigation size={18} /></button>}
            </div>}
          </MapWorkspace>
        </div>
      )}
    </div>
  );
}
