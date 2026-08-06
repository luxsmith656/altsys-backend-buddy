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
  Box
} from 'lucide-react';
import { toast } from 'sonner';
import ActiveHikersLayer from '@/components/map/ActiveHikersLayer';
import LiveSessionsLayer from '@/components/map/LiveSessionsLayer';
import TrailRecorder from '@/components/map/TrailRecorder';
import Terrain3DDialog from '@/components/map/Terrain3DDialog';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';

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
  const { activeLocationId } = useLocations();
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
  const [selfLocation, setSelfLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedHikerId, setExpandedHikerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const availableTrails: MapTrail[] = dbTrails.length > 0 ? dbTrails : TRAILS;
  const currentTrail = availableTrails[selectedTrail] || availableTrails[0];
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
      .order('created_at', { ascending: true });
    if (restrictToAssignedTrail) {
      trackerQuery = trackerQuery.eq('id', assignedTrailZoneId) as typeof trackerQuery;
    } else if (activeLocationId) {
      trackerQuery = trackerQuery.eq('location_id', activeLocationId) as typeof trackerQuery;
    }
    
    const { data: primaryData, error } = await trackerQuery;
    let trackerData = primaryData;
    
    if (error && isSchemaCacheError(error)) {
      let fallback = supabase
        .from('trail_zones')
        .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,status')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (restrictToAssignedTrail) {
        fallback = fallback.eq('id', assignedTrailZoneId) as typeof fallback;
      } else if (activeLocationId) {
        fallback = fallback.eq('location_id', activeLocationId) as typeof fallback;
      }
      const res = await fallback;
      trackerData = res.data as unknown as typeof trackerData;
    }
    
    const loaded = ((trackerData as DBTrailZone[]) ?? [])
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

  // Search filter
  const filteredHikers = useMemo(() => {
    return simulationHikers.filter((h) => {
      if (h.phase === 'completed') return false;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        h.name.toLowerCase().includes(query) ||
        h.guideName.toLowerCase().includes(query) ||
        (h.companions && h.companions.some((c) => c.toLowerCase().includes(query)))
      );
    });
  }, [simulationHikers, searchQuery]);

  const currentOfficialStations: OfficialStation[] = currentTrail?.stations?.length
    ? currentTrail.stations.map((station) => ({
        index: station.index,
        name: station.name,
        pos: [station.lat, station.lng],
        description: station.description,
      }))
    : OFFICIAL_STATIONS;

  const handleSelfLocationChange = useCallback((location: { lat: number; lng: number } | null) => {
    setSelfLocation(location);
  }, []);

  const locateSelf = () => {
    if (!mapInstance || !selfLocation) return;
    mapInstance.setView([selfLocation.lat, selfLocation.lng], Math.max(mapInstance.getZoom(), 17), { animate: true });
  };

  return (
    <div className="h-[100dvh] pt-16 flex flex-col bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden">
      
      {/* ── Dashboard Subheader / Mode Switcher ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800/60 px-3 py-2.5 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 shrink-0 shadow-sm z-10">
        <div>
          <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
            {isSelfTrackingRole ? 'My Mt. Kalisungan Hike' : 'Mt. Kalisungan Tracking Console'}
          </h1>
          <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isSelfTrackingRole
              ? 'Your assigned route, live position, and recorded trail progress.'
              : 'Real-time hiker monitoring, emergency safety pings, and official trail line editor.'}
          </p>
        </div>
        
        <div className="flex w-full items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-200/50 bg-slate-100 p-1 dark:border-slate-700/50 dark:bg-slate-800 sm:w-auto sm:self-auto">
          <Button
            size="sm"
            variant={activeMapTab === 'tracker' ? 'secondary' : 'ghost'}
            className={`h-8 min-w-0 flex-1 gap-1.5 rounded-md px-3 text-xs transition-all sm:flex-none ${
              activeMapTab === 'tracker' 
                ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-50' 
                : 'text-slate-600 dark:text-slate-400'
            }`}
            onClick={() => {
              setActiveMapTab('tracker');
              navigate('/map');
            }}
          >
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span className="min-[380px]:hidden">Tracker</span>
            <span className="hidden min-[380px]:inline">{isSelfTrackingRole ? 'My Tracker' : 'Live Tracker'}</span>
          </Button>
          {isTrailRecorder && (
            <Button
              size="sm"
              variant={activeMapTab === 'editor' ? 'secondary' : 'ghost'}
              className={`h-8 min-w-0 flex-1 gap-1.5 rounded-md px-3 text-xs transition-all sm:flex-none ${
                activeMapTab === 'editor' 
                  ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-50' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              onClick={() => setActiveMapTab('editor')}
            >
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              <span className="min-[380px]:hidden">Editor</span>
              <span className="hidden min-[380px]:inline">Trail Route Editor</span>
            </Button>
          )}
          {canMonitorAll && activeMapTab === 'tracker' && (
            <Button
              type="button"
              size="icon"
              variant={simulationMode ? 'secondary' : 'ghost'}
              className="h-8 w-8 shrink-0 rounded-md text-amber-600 hover:bg-white dark:text-amber-400 dark:hover:bg-slate-900"
              onClick={() => {
                setSimulationMode((enabled) => {
                  if (enabled) {
                    setSimulationControlsOpen(false);
                    setIsSidebarCollapsed(true);
                  }
                  return !enabled;
                });
              }}
              aria-label={simulationMode ? 'Disable simulation mode' : 'Enable simulation mode'}
              title={simulationMode ? 'Disable simulation mode' : 'Enable simulation mode'}
            >
              <Activity className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-md text-emerald-600 hover:bg-white hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-slate-900"
            onClick={() => setTerrain3dOpen(true)}
            aria-label="Open 3D terrain"
            title="Open 3D terrain"
          >
            <Box className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Main Workspace ── */}
      <div className="flex-1 relative overflow-hidden w-full h-full">
        
        {/* Fullscreen Map container shared by both Tracking Console & Trail Route Editor */}
        <div className="absolute inset-0 w-full h-full z-0">
          <MapContainer
            center={MT_KALISUNGAN_CENTER}
            zoom={DEFAULT_ZOOM}
            maxZoom={20}
            className="h-full w-full"
            zoomControl={true}
            attributionControl={false}
          >
            <MapInstanceBridge onReady={setMapInstance} />
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} attribution="© OpenStreetMap" />
            
            {activeMapTab === 'tracker' ? (
              <>
                {user && (
                  <LiveSessionsLayer
                    mode={canMonitorAll ? 'monitor' : 'self'}
                    userId={user.id}
                    userRole={role}
                    locationId={canMonitorAll ? activeLocationId : null}
                    onSelfLocationChange={isSelfTrackingRole ? handleSelfLocationChange : undefined}
                  />
                )}

                {canMonitorAll && simulationMode && (
                  <ActiveHikersLayer
                    showStations={false}
                    routePath={currentTrail.path as [number, number][]}
                    routeStations={currentTrail.stations}
                    routeDistanceKm={currentRouteDistanceKm}
                    simulationControlsOpen={simulationControlsOpen}
                    onSimulationControlsOpenChange={(open) => {
                      setSimulationControlsOpen(open);
                      if (open) setIsSidebarCollapsed(true);
                    }}
                  />
                )}

                {/* Show Summit Trail lines */}
                {availableTrails.map((t, i) => (
                  <Polyline
                    key={t.name}
                    positions={t.path}
                    pathOptions={{
                      color: t.color,
                      weight: i === selectedTrail ? 6 : 3,
                      opacity: i === selectedTrail ? 1 : 0.45,
                    }}
                  />
                ))}

                {dbTrails.flatMap((trail) =>
                  (trail.stations ?? []).map((station) => (
                    <Marker
                      key={`${trail.id ?? trail.name}-${station.id}`}
                      position={[station.lat, station.lng]}
                      icon={routeStationIcon(station)}
                      zIndexOffset={100}
                    >
                      <Popup>
                        <div className="max-w-[230px] p-1">
                          <p className="font-bold">{station.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{station.description}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )),
                )}
              </>
            ) : (
              /* Trail Route Editor Layers & Handles inside MapContainer */
              <TrailRecorder
                existingTrails={rawTrailZones}
                locationId={activeLocationId}
                onSaved={fetchTrails}
              />
            )}
          </MapContainer>
        </div>

        {/* Floating Controls Overlay for Tracker */}
        {canMonitorAll && simulationMode && activeMapTab === 'tracker' && (
          isSidebarCollapsed ? (
            /* Collapsed Minimap Control Button */
            <button
              onClick={() => {
                setSimulationControlsOpen(false);
                setIsSidebarCollapsed(false);
              }}
              className="absolute top-4 left-4 z-[1000] flex min-h-11 items-center gap-2 rounded-xl border border-slate-200/60 bg-white/95 p-3 shadow-xl backdrop-blur-md transition-all hover:bg-slate-50 pointer-events-auto group dark:border-slate-800/60 dark:bg-slate-900/95 dark:hover:bg-slate-800 sm:rounded-2xl"
              aria-label="Show tracking console"
              title="Expand Tracking Console"
            >
              <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 pr-1">Show Tracker</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          ) : (
            /* Expanded Glassmorphic Dashboard Panel */
            <div 
              className="absolute top-4 left-4 z-[1000] flex max-h-[46dvh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200/50 bg-white/95 shadow-2xl backdrop-blur-md pointer-events-auto dark:border-slate-800/50 dark:bg-slate-900/95 sm:max-h-[78vh] sm:w-[360px] sm:rounded-2xl"
            >
              {/* Floating Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-500/10 p-1.5 rounded-lg">
                    <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Tracking Console
                    </h2>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {simulationHikers.filter(h => h.phase !== 'completed').length} active groups
                    </span>
                  </div>
                </div>
                
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 sm:h-7 sm:w-7"
                  onClick={() => setIsSidebarCollapsed(true)}
                  aria-label="Collapse tracking console"
                  title="Collapse Panel"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>

              {/* Scrollable Body Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans">
                
                {/* Search Box - Premium Minimal */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search groups, guides, team..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 dark:text-slate-200 transition-all"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2 text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-1"
                    >
                      clear
                    </button>
                  )}
                </div>

                {/* Active Expeditions List */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-1">
                    Active Hiker Groups
                  </span>
                  
                  <div className="space-y-2.5 pr-0.5">
                    {filteredHikers.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 border border-dashed rounded-xl border-slate-200/60 dark:border-slate-800/60 p-4">
                        {searchQuery ? "No groups match your query." : "No active groups found on the mountain."}
                      </div>
                    ) : (
                      filteredHikers.map((h) => {
                        const isSos = h.phase === 'sos';
                        const isExpanded = expandedHikerId === h.id;
                        
                        return (
                          <div 
                            key={h.id}
                            className={`group relative p-3 rounded-xl border transition-all duration-300 flex flex-col gap-2 cursor-pointer ${
                              isSos 
                                ? 'bg-rose-50/70 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/40 text-rose-950 dark:text-rose-100 shadow-sm shadow-rose-100/50 dark:shadow-none' 
                                : isExpanded 
                                  ? 'bg-slate-50/80 dark:bg-slate-900/40 border-emerald-500/50 dark:border-emerald-500/30 shadow-sm'
                                  : 'bg-white/60 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900/50 border-slate-200/60 dark:border-slate-800/50 text-slate-900 dark:text-slate-100'
                            }`}
                            onClick={() => {
                              handleLocateHiker(h);
                              setExpandedHikerId(isExpanded ? null : h.id);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-2 w-2 rounded-full ${
                                    isSos ? 'bg-rose-500 animate-ping' :
                                    h.phase === 'peak' ? 'bg-amber-500 animate-pulse' :
                                    h.phase === 'descent' ? 'bg-blue-500' : 'bg-emerald-500'
                                  }`} />
                                  <h3 className="font-semibold text-xs tracking-tight text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                    {h.name}
                                  </h3>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                  <User className="h-3 w-3 text-slate-400" />
                                  Guide: <span className="font-semibold text-slate-700 dark:text-slate-300">{h.guideName}</span>
                                </p>
                              </div>
                              
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide capitalize select-none ${
                                h.phase === 'ascent' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/40 dark:border-emerald-900/20' :
                                h.phase === 'peak' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/40 dark:border-amber-900/20' :
                                h.phase === 'descent' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/40 dark:border-blue-900/20' : 
                                'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400 animate-pulse'
                              }`}>
                                {h.phase === 'sos' ? '⚠️ SOS' : h.phase}
                              </span>
                            </div>
                            
                            {/* Progress Line */}
                            <div className="w-full bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden mt-0.5">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  h.phase === 'sos' ? 'bg-rose-500 animate-pulse' :
                                  h.phase === 'peak' ? 'bg-amber-500' :
                                  h.phase === 'descent' ? 'bg-blue-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${(h.progress / 9.0) * 100}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500">
                              <span className="flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">📍 {h.progress <= 0.05 ? 'Basecamp' : h.progress >= 8.95 ? 'Summit' : `Station ${Math.floor(h.progress) + 1}`}</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                {h.phase === 'sos' ? 'STALLED' : h.phase === 'peak' ? `Peak Stay` : `${Math.round((h.progress / 9.0) * 100)}%`}
                              </span>
                            </div>

                            {/* Expanded Detailed Section */}
                            {isExpanded && (
                              <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 space-y-2.5 text-[11px] text-slate-600 dark:text-slate-300">
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-slate-50/50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100/50 dark:border-slate-850/40">
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 block">Group Size</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{h.groupSize} Pax</span>
                                  </div>
                                  <div className="bg-slate-50/50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100/50 dark:border-slate-850/40">
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 block">Minors</span>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {h.hasMinors ? `${h.minorCount} child(ren)` : 'None'}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1.5 bg-slate-50/50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100/50 dark:border-slate-850/40">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">Contact Guide</span>
                                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">{h.guidePhone}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">Emergency Contact</span>
                                    <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">{h.emergencyContact}</span>
                                  </div>
                                </div>

                                {h.companions && h.companions.length > 0 && (
                                  <div>
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Companions</span>
                                    <div className="flex flex-wrap gap-1">
                                      {h.companions.map((comp, idx) => (
                                        <span key={idx} className="bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded text-[9px] text-slate-600 dark:text-slate-300 border border-slate-200/20 dark:border-slate-750/30">
                                          {comp}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {h.medicalNotes && (
                                  <div className="bg-rose-50/50 dark:bg-rose-950/10 p-2 rounded-lg border border-rose-100 dark:border-rose-950/30 text-rose-900 dark:text-rose-300">
                                    <span className="text-[9px] uppercase font-bold tracking-wider text-rose-400 block mb-0.5">⚠️ Medical Alert</span>
                                    <p className="text-[10px] leading-relaxed">{h.medicalNotes}</p>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 pt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="flex-1 h-7 text-[10px] text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLocateHiker(h);
                                    }}
                                  >
                                    Locate On Map
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1 h-7 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toast.success(`Message sent to guide ${h.guideName}`, {
                                        description: `Alert ping dispatched to guide companion channel.`
                                      });
                                    }}
                                  >
                                    Ping Guide
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Checkpoint Timeline */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/65">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block px-1">
                    Stations Timeline
                  </span>

                  <div className="relative pl-3 space-y-3.5 before:absolute before:left-5 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-100 dark:before:bg-slate-800">
                    {currentOfficialStations.map((st) => {
                      const activeGroupsHere = hikersAtStation(st.index);
                      const hasActiveHikers = activeGroupsHere.length > 0;
                      
                      return (
                        <div key={st.index} className="relative flex gap-3 group">
                          {/* Circle Bullet */}
                          <button
                            type="button"
                            onClick={() => handleLocateStation(st)}
                            className={`relative z-10 w-5 h-5 rounded-full font-bold text-[9px] flex items-center justify-center shrink-0 border transition-all shadow-sm ${
                              st.index === 7 
                                ? 'bg-rose-500 border-rose-400 text-white ring-4 ring-rose-500/10' 
                                : hasActiveHikers
                                  ? 'bg-emerald-600 border-emerald-500 text-white ring-4 ring-emerald-500/20'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-500'
                            }`}
                          >
                            {st.index === 1 ? 'J' : st.index === 7 ? 'P' : st.index - 1}
                          </button>

                          <div className="flex-1 text-left bg-slate-50/20 dark:bg-slate-950/20 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 transition-all flex flex-col gap-0.5 w-full">
                            <div className="flex items-center justify-between gap-1 w-full">
                              <span 
                                onClick={() => handleLocateStation(st)}
                                className="font-bold text-[10px] text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                              >
                                {st.name}
                              </span>
                              
                              {hasActiveHikers && (
                                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                  {activeGroupsHere.length} active
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">{st.description}</p>
                            
                            {hasActiveHikers && (
                              <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/40 flex flex-wrap gap-1">
                                {activeGroupsHere.map((hg) => (
                                  <span 
                                    key={hg.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLocateHiker(hg);
                                      setExpandedHikerId(hg.id);
                                    }}
                                    className="text-[8px] bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-slate-600 dark:text-slate-300 hover:text-emerald-600 px-1.5 py-0.5 rounded border border-slate-200/40 dark:border-slate-800/60 cursor-pointer font-medium transition-colors"
                                  >
                                    👤 {hg.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          )
        )}

        {isSelfTrackingRole && activeMapTab === 'tracker' && selfLocation && (
          <Button
            type="button"
            size="icon"
            onClick={locateSelf}
            className="absolute bottom-4 right-4 z-[1000] h-11 w-11 rounded-xl shadow-xl"
            aria-label="Locate my live position"
            title="Locate my live position"
          >
            <Navigation className="h-5 w-5" />
          </Button>
        )}

      </div>
      <Terrain3DDialog
        open={terrain3dOpen}
        onOpenChange={setTerrain3dOpen}
        routeName={currentTrail.name}
        routePath={currentTrail.path as [number, number][]}
        stations={currentTrail.stations ?? []}
      />
    </div>
  );
}
