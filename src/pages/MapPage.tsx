import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  routeStationsFromMetadata,
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
  Box,
  Plus,
  Minus
} from 'lucide-react';
import { toast } from 'sonner';
import ActiveHikersLayer, { type MapHikerFilterMode } from '@/components/map/ActiveHikersLayer';
import LiveSessionsLayer from '@/components/map/LiveSessionsLayer';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import MapWorkspace from '@/components/map/MapWorkspace';
import LiveGroupDetails from '@/components/map/LiveGroupDetails';
import type { LiveMapGroup } from '@/lib/liveMapPresentation';
import TrailRecorder from '@/components/map/TrailRecorder';
import Terrain3DDialog from '@/components/map/Terrain3DDialog';
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
  const { activeLocationId, loading: locationsLoading, isSuperAdmin } = useLocations();
  const navigate = useNavigate();
  
  const isTrailRecorder = role === 'ranger' || role === 'guide' || role === 'admin' || role === 'super_admin';
  const canMonitorAll = role === 'ranger' || role === 'admin' || role === 'super_admin';
  const isSelfTrackingRole = role === 'hiker' || role === 'guide';
  const [activeMapTab, setActiveMapTab] = useState<'tracker' | 'editor'>('tracker');
  
  const [dbTrails, setDbTrails] = useState<MapTrail[]>([]);
  const [rawTrailZones, setRawTrailZones] = useState<DBTrailZone[]>([]);
  const [selectedTrail] = useState<number>(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  
  const [simulationHikers, setSimulationHikers] = useState<SimulatedHiker[]>([]);
  const [assignedTrailZoneId, setAssignedTrailZoneId] = useState<string | null>(null);
  const [officialRoutesRevision, setOfficialRoutesRevision] = useState(0);
  const [terrain3dOpen, setTerrain3dOpen] = useState(false);

  // Redesign state: Collapsible sidebar, card expansions, search
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.matchMedia('(max-width: 639px)').matches,
  );
  const [simulationControlsOpen, setSimulationControlsOpen] = useState(false);
  const [simulationMode, setSimulationMode] = useState(false);
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
  const availableTrails: MapTrail[] = dbTrails;
  // A local fallback is used only for the staff simulation canvas; it is never rendered as an official route.
  const currentTrail: MapTrail = availableTrails[selectedTrail] || (TRAILS[0] as MapTrail);
  const currentRouteDistanceKm = currentTrail.path.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = currentTrail.path[index - 1];
    return total + haversineDistance(previous[0], previous[1], point[0], point[1]);
  }, 0);

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
    } else if (activeLocationId) {
      trackerQuery = trackerQuery.eq('location_id', activeLocationId) as typeof trackerQuery;
    }
    
    const { data: trackerData, error } = await trackerQuery;
    if (error) toast.error('Published routes could not be loaded. Please reconnect and retry.');
    const loaded = officialRoutesForLocation((trackerData as DBTrailZone[]) ?? [], restrictToAssignedTrail ? undefined : activeLocationId)
      .map((trail, index) => {
        const coords = Array.isArray(trail.coordinates_json) ? (trail.coordinates_json as { lat: number; lng: number }[]) : [];
        const path = coords
          .map((p) => [Number(p.lat), Number(p.lng)] as [number, number])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        if (path.length < 2) return null;
        let distanceKm = 0;
        for (let i = 1; i < path.length; i++) {
          distanceKm += haversineDistance(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
        }
        const colors = ['#16a34a', '#2563eb', '#dc2626', '#9333ea', '#ea580c'];
        return {
          id: trail.id,
          name: trail.name || `Official Trail ${index + 1}`,
          difficulty: (trail.difficulty || 'moderate') as 'easy' | 'moderate' | 'hard',
          color: colors[index % colors.length],
          elevation: `${Number(trail.elevation_meters || 0)}m`,
          distance: `${distanceKm.toFixed(1)} km`,
          path,
          stations: routeStationsFromMetadata(trail.recording_metadata, path),
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
      if (activeLocationId) {
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
        if (activeLocationId) {
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
  }, [role, assignedTrailZoneId, activeLocationId, isTrailRecorder]);

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
    
    const routePath = currentTrail.path;
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
        <strong>{hiker.name} · {hiker.groupSize} pax</strong><small>{hiker.phase} · {Math.round(hiker.progress / 9 * 100)}% of ascent</small>
      </button></li>)}
    </ul>
    {simulated && <LiveGroupDetails group={{ id: simulated.id, lead: simulated.name, guide: simulated.guideName, pax: simulated.groupSize,
      phase: simulated.phase, phone: simulated.guidePhone, companions: simulated.companions ?? [], distanceKm: simulated.totalDistanceKm,
      route: currentTrail.name, emergencyContact: simulated.emergencyContact, medicalNotes: simulated.medicalNotes ?? undefined,
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
      onClick={() => { setSimulationMode(!simulationMode); setSimulationControlsOpen(false); }}>
      <Activity size={18} />{simulationMode ? 'Exit simulation' : 'Simulation'}
    </Button>}
    <Button variant="ghost" aria-label="Open 3D terrain" onClick={() => setTerrain3dOpen(true)}><Box size={18} />3D terrain</Button>
  </div>;
  const routePanel = <>
    <ul className="live-map-route-list">
      {availableTrails.map((trail) => <li key={trail.id ?? trail.name}>
        <button type="button" aria-label={`Show ${trail.name} on map`} onClick={() => {
          if (mapInstance && trail.path.length) mapInstance.fitBounds(trail.path, {
            paddingTopLeft: [30, 30], paddingBottomRight: [60, Math.min(mapInstance.getSize().y * .4, 260)], maxZoom: 17, animate: false,
          });
        }}><strong>{trail.name}</strong><small>Published route</small></button>
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
          <MapWorkspace title={simulationMode ? 'Simulation groups' : 'My hike'}
            routes={routePanel} tools={mapTools}
            panel={activeMapTab === 'editor' ? null : simulationMode ? simulationPanel : selfPanel}>
            <MapContainer center={MT_KALISUNGAN_CENTER} zoom={DEFAULT_ZOOM} maxZoom={20} zoomAnimation={false}
              className="h-full w-full" zoomControl={false} attributionControl={true}>
              <MapInstanceBridge onReady={setMapInstance} />
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} attribution="© OpenStreetMap" />
              {activeMapTab === 'tracker' ? <>
                {user && isSelfTrackingRole && <LiveSessionsLayer mode="self" userId={user.id} userRole={role} onSelfLocationChange={handleSelfLocationChange} />}
                {canMonitorAll && simulationMode && <ActiveHikersLayer showStations={false} routePath={currentTrail.path as [number, number][]}
                  routeStations={currentTrail.stations} routeDistanceKm={currentRouteDistanceKm} simulationControlsOpen={simulationControlsOpen}
                  filterMode={mapFilterMode} onlyActive={onlyActiveSessions} onSimulationControlsOpenChange={setSimulationControlsOpen}
                  controlsEmbedded controlsContainer={simControlsElement} />}
                {availableTrails.map((trail) => <Polyline key={trail.id ?? trail.name} positions={trail.path} pathOptions={{ color: trail.color, weight: 5 }} />)}
                {dbTrails.flatMap((trail) => (trail.stations ?? []).map((station) => <Marker key={station.id}
                  position={[station.lat, station.lng]} icon={routeStationIcon(station)} zIndexOffset={100}>
                  <Popup><strong>{station.name}</strong><p>{station.description}</p></Popup>
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
      <Terrain3DDialog open={terrain3dOpen} onOpenChange={setTerrain3dOpen} routeName={currentTrail.name}
        routePath={currentTrail.path as [number, number][]} stations={currentTrail.stations ?? []} />
    </div>
  );
}
