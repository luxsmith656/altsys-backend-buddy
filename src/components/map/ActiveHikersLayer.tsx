import { useEffect, useState, useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { RouteStation } from '@/lib/map-data';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Zap, 
  AlertOctagon, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Timer, 
  ShieldAlert, 
  Users, 
  Phone, 
  Heart, 
  Compass, 
  Clock, 
  Activity,
  ArrowDown
} from 'lucide-react';

// The official Summit Trail path points
const SUMMIT_TRAIL_PATH: [number, number][] = [
  [14.1440, 121.3430], // Station 1: Base Camp
  [14.1448, 121.3435],
  [14.1455, 121.3440], // Station 2: Bamboo Grove
  [14.1462, 121.3445],
  [14.1468, 121.3448], // Station 3: Forest Canopy
  [14.1473, 121.3452],
  [14.1478, 121.3455],
  [14.1483, 121.3458], // Station 4: High Camp
  [14.1488, 121.3460],
  [14.1495, 121.3462], // Station 5: Summit Peak
];

// 7 Official Stations along the Summit Trail
export const OFFICIAL_STATIONS = [
  { id: 'st1', index: 1, name: 'Jump off: Start of Trail (0 km)', pos: [14.1440, 121.3430] as [number, number], description: 'Main trailhead. Registration, safety briefing, and guide assignment.' },
  { id: 'st2', index: 2, name: 'Station 1: Bamboo Grove (1 km)', pos: [14.1455, 121.3440] as [number, number], description: 'Cool rest point shaded by bamboo arches. Emergency kit available.' },
  { id: 'st3', index: 3, name: 'Station 2: Forest Canopy Rest (2 km)', pos: [14.1468, 121.3448] as [number, number], description: 'Midway point rest stop. High-canopy forest shade.' },
  { id: 'st4', index: 4, name: 'Station 3: Mountain Spring (3 km)', pos: [14.1478, 121.3455] as [number, number], description: 'Water source rest point under giant trees.' },
  { id: 'st5', index: 5, name: 'Station 4: Wilderness Ridge (4 km)', pos: [14.1483, 121.3458] as [number, number], description: 'Steep ridge rest area. pre-summit scenic viewing spot.' },
  { id: 'st6', index: 6, name: 'Station 5: Summit Camp (5 km)', pos: [14.1488, 121.3460] as [number, number], description: 'Final staging area camp before the summit assault.' },
  { id: 'st7', index: 7, name: 'Mt. Kalisungan Peak (Summit - 6 km)', pos: [14.1495, 121.3462] as [number, number], description: 'Summit (629m). Breathtaking 360-degree views of Southern Tagalog.' },
];

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
  
  // Simulation Variables
  progress: number; // float 0 to 9 representing indices of SUMMIT_TRAIL_PATH
  phase: 'ascent' | 'peak' | 'descent' | 'completed' | 'sos';
  speedMultiplier: number;
  peakReachedAt: string | null;
  peakTimerLeft: number; // in simulated seconds (2 hours = 7200s)
  totalDistanceKm: number;
  direction: 1 | -1;
  hasWarnedAboutTimer?: boolean;
}

const INITIAL_SIMULATION: SimulatedHiker[] = [
  {
    id: 'sim-1',
    name: 'Marcos Expedition',
    guideName: 'Ruel Santos',
    guidePhone: '+63 917 555 4321',
    groupSize: 4,
    startTime: '07:15 AM',
    emergencyContact: 'Celestina Marcos (+63 915 222 3333)',
    medicalNotes: null,
    hasMinors: true,
    minorCount: 1,
    companions: ['Lito Marcos', 'Jenny Marcos', 'Berto Marcos (Minor)'],
    progress: 1.5,
    phase: 'ascent',
    speedMultiplier: 1.1,
    peakReachedAt: null,
    peakTimerLeft: 7200,
    totalDistanceKm: 0.5,
    direction: 1,
  },
  {
    id: 'sim-2',
    name: 'Reyes Family Hike',
    guideName: 'Danilo Cruz',
    guidePhone: '+63 920 111 2222',
    groupSize: 2,
    startTime: '06:45 AM',
    emergencyContact: 'Elena Reyes (+63 918 888 9999)',
    medicalNotes: 'Asthma (Carries rescue inhaler)',
    hasMinors: false,
    minorCount: 0,
    companions: ['Elena Reyes'],
    progress: 9.0, // At peak
    phase: 'peak',
    speedMultiplier: 0.95,
    peakReachedAt: new Date(Date.now() - 3600 * 1000).toISOString(), // reached peak 1 hour ago
    peakTimerLeft: 3600, // 1 hour left
    totalDistanceKm: 3.2,
    direction: 1,
  },
  {
    id: 'sim-3',
    name: 'Wanderers Solo',
    guideName: 'Esteban Reyes',
    guidePhone: '+63 909 333 4444',
    groupSize: 1,
    startTime: '08:30 AM',
    emergencyContact: 'David Wanderers (+63 916 555 6666)',
    medicalNotes: null,
    hasMinors: false,
    minorCount: 0,
    companions: [],
    progress: 7.2, // descending
    phase: 'descent',
    speedMultiplier: 1.3,
    peakReachedAt: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
    peakTimerLeft: 0,
    totalDistanceKm: 4.1,
    direction: -1,
  }
];

type SimulationStation = {
  id: string;
  index: number;
  name: string;
  pos: [number, number];
  description: string;
};

// Progress remains 0..9 for the simulation controls, but follows any route geometry.
function interpolatePosition(progress: number, routePath: [number, number][]): [number, number] {
  const safePath = routePath.length >= 2 ? routePath : SUMMIT_TRAIL_PATH;
  const scaledProgress = Math.max(0, Math.min(1, progress / 9)) * (safePath.length - 1);
  const index = Math.floor(scaledProgress);
  const nextIndex = Math.min(index + 1, safePath.length - 1);
  if (index === nextIndex) return safePath[index];
  
  const [lat1, lng1] = safePath[index];
  const [lat2, lng2] = safePath[nextIndex];
  
  const ratio = scaledProgress - index;
  const lat = lat1 + (lat2 - lat1) * ratio;
  const lng = lng1 + (lng2 - lng1) * ratio;
  return [lat, lng];
}

// Format duration
function formatSeconds(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

function getProgressDescription(progress: number, stations: SimulationStation[]) {
  const routeStations = stations.length >= 2 ? stations : OFFICIAL_STATIONS;
  const scaled = Math.max(0, Math.min(1, progress / 9)) * (routeStations.length - 1);
  const nearestIndex = Math.round(scaled);
  if (Math.abs(scaled - nearestIndex) <= 0.08) {
    return `At ${routeStations[nearestIndex].name}`;
  }
  const lowerIndex = Math.min(Math.floor(scaled), routeStations.length - 2);
  return `Between ${routeStations[lowerIndex].name} and ${routeStations[lowerIndex + 1].name}`;
}

interface ActiveHikersLayerProps {
  showStations?: boolean;
  routePath?: [number, number][];
  routeStations?: RouteStation[];
  routeDistanceKm?: number;
  simulationControlsOpen?: boolean;
  onSimulationControlsOpenChange?: (open: boolean) => void;
}

export default function ActiveHikersLayer({
  showStations = true,
  routePath,
  routeStations,
  routeDistanceKm = 6,
  simulationControlsOpen,
  onSimulationControlsOpenChange,
}: ActiveHikersLayerProps) {
  const simulationPath = routePath && routePath.length >= 2 ? routePath : SUMMIT_TRAIL_PATH;
  const simulationStations = useMemo<SimulationStation[]>(() => {
    if (!routeStations || routeStations.length < 2) return OFFICIAL_STATIONS;
    return routeStations.map((station) => ({
      id: station.id,
      index: station.index,
      name: station.name,
      pos: [station.lat, station.lng],
      description: station.description,
    }));
  }, [routeStations]);
  const [hikers, setHikers] = useState<SimulatedHiker[]>(() => {
    const saved = localStorage.getItem('trail_hiker_simulation_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_SIMULATION;
      }
    }
    return INITIAL_SIMULATION;
  });

  const [isSimPlaying, setIsSimPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState<1 | 5 | 10 | 30>(5);
  const [internalShowDashboard, setInternalShowDashboard] = useState(false);
  const showDashboard = simulationControlsOpen ?? internalShowDashboard;
  const setShowDashboard = (open: boolean) => {
    setInternalShowDashboard(open);
    onSimulationControlsOpenChange?.(open);
  };

  // Save state to localStorage on update
  useEffect(() => {
    localStorage.setItem('trail_hiker_simulation_state', JSON.stringify(hikers));
  }, [hikers]);

  // Simulation tick loop
  useEffect(() => {
    if (!isSimPlaying) return;

    const timer = setInterval(() => {
      setHikers((prev) => prev.map((h) => {
        if (h.phase === 'completed') return h;
        if (h.phase === 'sos') return h; // Freeze or stop on SOS

        let nextProgress = h.progress;
        let nextPhase: 'ascent' | 'peak' | 'descent' | 'completed' | 'sos' = h.phase;
        let nextTimer = h.peakTimerLeft;
        let nextDirection = h.direction;
        let nextPeakTime = h.peakReachedAt;
        let nextDistance = h.totalDistanceKm;
        let nextHasWarned = h.hasWarnedAboutTimer;

        // Base increment per tick: 0.005 segment units
        const progressIncrement = 0.005 * h.speedMultiplier * simSpeed;

        if (h.phase === 'ascent') {
          nextDirection = 1;
          nextProgress = h.progress + progressIncrement;
          nextDistance = Number((nextDistance + progressIncrement * (routeDistanceKm / 9)).toFixed(3));
          
          if (nextProgress >= 9.0) {
            nextProgress = 9.0;
            nextPhase = 'peak';
            nextPeakTime = new Date().toISOString();
            nextTimer = 7200; // 2 hours
            nextHasWarned = false;
            toast.success(`🎉 ${h.name} reached the Summit!`, {
              description: `Guide ${h.guideName} has started their 2-hour rest timer at Station 5.`,
              duration: 5000,
            });
          }
        } else if (h.phase === 'peak') {
          // Decrement peak stay timer
          nextTimer = Math.max(0, h.peakTimerLeft - (1 * simSpeed));
          
          // Warning at 15 minutes left
          if (nextTimer <= 900 && !nextHasWarned && nextTimer > 0) {
            nextHasWarned = true;
            toast.warning(`⚠️ Peak limit notice for ${h.name}`, {
              description: `Only 15 minutes left on their 2-hour summit stay. Preparing for descent.`,
              duration: 6000,
            });
          }

          if (nextTimer <= 0) {
            nextPhase = 'descent';
            nextDirection = -1;
            toast.info(`⏰ Summit stay expired for ${h.name}`, {
              description: `The 2-hour rest limit is up. Guide ${h.guideName} is leading the group down.`,
              duration: 5000,
            });
          }
        } else if (h.phase === 'descent') {
          nextDirection = -1;
          nextProgress = h.progress - progressIncrement;
          nextDistance = Number((nextDistance + progressIncrement * (routeDistanceKm / 9)).toFixed(3));

          if (nextProgress <= 0.0) {
            nextProgress = 0.0;
            nextPhase = 'completed';
            toast.success(`🏡 Safe Arrival: ${h.name}`, {
              description: `Group successfully finished their descent and registered check-out at Base Camp.`,
              duration: 6000,
            });
          }
        }

        return {
          ...h,
          progress: nextProgress,
          phase: nextPhase,
          peakTimerLeft: nextTimer,
          direction: nextDirection,
          peakReachedAt: nextPeakTime,
          totalDistanceKm: nextDistance,
          hasWarnedAboutTimer: nextHasWarned,
        };
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [isSimPlaying, routeDistanceKm, simSpeed]);

  // Initiate descent early
  const handleInitiateEarlyDescent = (hikerId: string) => {
    setHikers((prev) => prev.map((h) => {
      if (h.id === hikerId && h.phase === 'peak') {
        const secondsSaved = h.peakTimerLeft;
        const minutesSaved = Math.round(secondsSaved / 60);
        
        toast.warning(`⚠️ [Guide Ping] Early Descent Initiated!`, {
          description: `Guide ${h.guideName} cut the peak rest short by ${minutesSaved} mins for ${h.name}. Commencing safe downward track.`,
          duration: 7000,
        });

        return {
          ...h,
          phase: 'descent',
          direction: -1,
          peakTimerLeft: 0,
        };
      }
      return h;
    }));
  };

  // Trigger SOS event for simulation demo
  const handleTriggerSOS = (hikerId: string) => {
    setHikers((prev) => prev.map((h) => {
      if (h.id === hikerId) {
        toast.error(`🚨 EMERGENCY SOS! Guide ${h.guideName} of ${h.name} Pinged!`, {
          description: `ALERT: Medical distress reported. Position: ${getProgressDescription(h.progress, simulationStations)}. Dispatching emergency responders immediately!`,
          duration: 10000,
        });
        return {
          ...h,
          phase: 'sos',
        };
      }
      return h;
    }));
  };

  // Resolve SOS
  const handleResolveSOS = (hikerId: string) => {
    setHikers((prev) => prev.map((h) => {
      if (h.id === hikerId && h.phase === 'sos') {
        toast.success(`✅ SOS Resolved for ${h.name}`, {
          description: `Responders reached the group. Moving status restored to ascent/descent.`,
          duration: 5000,
        });
        return {
          ...h,
          phase: h.progress >= 9.0 ? 'peak' : h.direction === -1 ? 'descent' : 'ascent',
        };
      }
      return h;
    }));
  };

  // Reset the entire simulation
  const handleResetSimulation = () => {
    setHikers(INITIAL_SIMULATION);
    setIsSimPlaying(true);
    toast.info('🔄 Simulation reset successfully', {
      description: 'Hikers placed back at their initial positions and timers initialized.',
    });
  };

  // Calculate ETA dynamically
  const calculateETA = (h: SimulatedHiker) => {
    if (h.phase === 'completed') return 'Safely Checked Out';
    if (h.phase === 'sos') return 'EMERGENCY - STALLED';

    const baseAscentPaceMinPerSegment = 10 / h.speedMultiplier; // ~90 mins total
    const baseDescentPaceMinPerSegment = 5.5 / h.speedMultiplier; // ~50 mins total

    if (h.phase === 'ascent') {
      const remainingSegments = 9.0 - h.progress;
      const etaMin = Math.round((remainingSegments * baseAscentPaceMinPerSegment) / (simSpeed === 1 ? 1 : simSpeed * 0.5));
      return etaMin <= 1 ? 'Under a minute' : `${etaMin} mins to Peak`;
    }

    if (h.phase === 'peak') {
      const simulatedMinsLeft = Math.round(h.peakTimerLeft / 60);
      return `At Peak - Rest: ${simulatedMinsLeft}m left`;
    }

    if (h.phase === 'descent') {
      const remainingSegments = h.progress;
      const etaMin = Math.round((remainingSegments * baseDescentPaceMinPerSegment) / (simSpeed === 1 ? 1 : simSpeed * 0.5));
      return etaMin <= 1 ? 'Arriving Basecamp' : `${etaMin} mins to Basecamp`;
    }

    return 'Unknown';
  };

  // Station leaflet icons (green circular badge)
  const stationIcon = (index: number, isPeak: boolean) => {
    const label = index === 1 ? 'J' : index === 7 ? 'P' : String(index - 1);
    return new L.DivIcon({
      html: `
        <div class="flex items-center justify-center" style="
          width: 26px;
          height: 26px;
          background: ${isPeak ? '#ef4444' : '#10b981'};
          color: white;
          border: 2.5px solid white;
          border-radius: 50%;
          font-weight: 800;
          font-size: 11px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${label}
        </div>
      `,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  };

  // Dynamic hiker marker icon with halo pulse
  const hikerMarkerIcon = (h: SimulatedHiker) => {
    let color = '#10b981'; // ascent green
    let iconLetter = 'H';
    
    if (h.phase === 'peak') {
      color = '#eab308'; // peak gold
      iconLetter = 'P';
    } else if (h.phase === 'descent') {
      color = '#3b82f6'; // descent blue
      iconLetter = 'D';
    } else if (h.phase === 'sos') {
      color = '#dc2626'; // SOS red
      iconLetter = '🚨';
    } else if (h.phase === 'completed') {
      color = '#64748b'; // gray
      iconLetter = '✓';
    }

    const glowClass = h.phase === 'sos' ? 'animate-ping' : h.phase === 'peak' ? 'animate-pulse' : '';

    return new L.DivIcon({
      html: `
        <div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-6 w-6 rounded-full opacity-60 ${glowClass}" style="background-color: ${color};"></span>
          <div style="
            position: relative;
            background: ${color};
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 3px 8px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
          ">
            ${iconLetter}
          </div>
        </div>
      `,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  };

  return (
    <>
      {/* 1. Official Stations Layer */}
      {showStations && simulationStations.map((st) => (
        <Marker 
          key={st.id} 
          position={st.pos} 
          icon={stationIcon(st.index, st.index === 7)}
          zIndexOffset={100}
        >
          <Popup>
            <div className="p-1 max-w-[240px]">
              <div className="font-bold text-sm text-emerald-800 border-b pb-1 mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {st.index === 1 ? 'J' : st.index === 7 ? 'P' : `S${st.index - 1}`}
                </span>
                {st.name}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{st.description}</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* 2. Simulated Moving Hikers Layer */}
      {hikers.map((h) => {
        if (h.phase === 'completed') return null; // hide finished hikers
        const latLng = interpolatePosition(h.progress, simulationPath);
        const etaText = calculateETA(h);
        
        return (
          <Marker 
            key={h.id} 
            position={latLng} 
            icon={hikerMarkerIcon(h)}
            zIndexOffset={1800}
          >
            <Popup>
              <div className="min-w-[250px] p-1 font-sans text-xs text-foreground">
                {/* Header */}
                <div className="border-b pb-1.5 mb-2 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-primary flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      {h.name}
                    </h4>
                    <span className="text-[10px] text-muted-foreground font-mono">ID: {h.id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                    h.phase === 'ascent' ? 'bg-emerald-100 text-emerald-800' :
                    h.phase === 'peak' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                    h.phase === 'descent' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {h.phase === 'sos' ? '⚠️ Emergency' : h.phase}
                  </span>
                </div>

                {/* Info Fields */}
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><Compass className="h-3.5 w-3.5" /> Position:</span>
                    <span className="font-medium text-foreground text-right">{getProgressDescription(h.progress, simulationStations)}</span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Est. ETA:</span>
                    <span className="font-semibold text-emerald-600 text-right">{etaText}</span>
                  </div>

                  {h.phase === 'peak' && (
                    <div className="mt-1 p-2 bg-amber-50 rounded border border-amber-200 text-amber-900">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <Timer className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                        Summit Limit Timer:
                      </div>
                      <div className="text-[11px] font-semibold text-amber-800">
                        {formatSeconds(h.peakTimerLeft)} remaining
                      </div>
                      <p className="text-[10px] mt-0.5 leading-relaxed text-amber-700">
                        Once timer expires, the group will automatically start descending as per safety protocol.
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-1.5 mt-1 space-y-1 text-[11px]">
                    <div><b>Lead Guide:</b> {h.guideName} ({h.guidePhone})</div>
                    <div><b>Group Count:</b> {h.groupSize} Pax {h.hasMinors && <span className="text-amber-600">({h.minorCount} Minor)</span>}</div>
                    {h.medicalNotes && <div className="text-red-600 flex items-center gap-1"><b>Medical:</b> {h.medicalNotes}</div>}
                    <div><b>Emergency Contact:</b> {h.emergencyContact}</div>
                  </div>

                  {/* Actions inside Popup */}
                  <div className="border-t pt-2 mt-2 flex flex-col gap-1.5">
                    {h.phase === 'peak' && (
                      <button
                        type="button"
                        onClick={() => handleInitiateEarlyDescent(h.id)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded flex items-center justify-center gap-1 transition-all"
                      >
                        <ArrowDown className="h-3 w-3" />
                        Initiate Early Descent (Down)
                      </button>
                    )}

                    {h.phase === 'sos' ? (
                      <button
                        type="button"
                        onClick={() => handleResolveSOS(h.id)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2 rounded flex items-center justify-center gap-1 transition-all"
                      >
                        Resolve SOS & Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTriggerSOS(h.id)}
                        className="w-full bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 font-bold py-1 px-2 rounded flex items-center justify-center gap-1 transition-all text-[10px]"
                      >
                        <ShieldAlert className="h-3 w-3 text-red-600" />
                        Simulate Emergency (SOS)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* 3. Floating Simulation Controller Portal (Renders nicely on top of Map Page) */}
      {showDashboard && createPortal(
        <div className="fixed bottom-3 right-3 z-[1200] flex max-h-[58dvh] w-[calc(100%-1.5rem)] flex-col gap-3 rounded-xl border border-border bg-background/95 p-4 font-sans text-xs shadow-2xl backdrop-blur-md sm:top-[9.25rem] sm:bottom-auto sm:right-4 sm:max-h-[calc(100dvh-10.25rem)] sm:max-w-[340px]">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1">
                <Activity className="h-4 w-4 text-emerald-500" />
                Hiker Tracking Simulation
              </h3>
            </div>
            <button
              onClick={() => setShowDashboard(false)}
              className="inline-flex min-h-10 items-center rounded px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Hide simulation controls"
            >
              Hide
            </button>
          </div>

          {/* Controller buttons */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setIsSimPlaying(!isSimPlaying)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold ${
                  isSimPlaying ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isSimPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isSimPlaying ? 'Pause' : 'Resume'}
              </button>
              
              <button
                type="button"
                onClick={handleResetSimulation}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1 font-medium"
                title="Reset simulation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            {/* Speed multipliers */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              {([1, 5, 10, 30] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd)}
                  className={`px-1.5 py-1 rounded text-[10px] font-bold ${
                    simSpeed === spd ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Quick status list */}
          <div className="space-y-2 mt-1 max-h-[220px] overflow-y-auto pr-1">
            <h4 className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">
              Active Simulated Hikers
            </h4>
            
            {hikers.map((h) => {
              const etaText = calculateETA(h);
              const isSos = h.phase === 'sos';
              
              return (
                <div 
                  key={h.id} 
                  className={`p-2.5 rounded-lg border flex flex-col gap-1 ${
                    isSos ? 'bg-red-50/90 border-red-200 text-red-900' : 'bg-muted/30 hover:bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{h.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold capitalize ${
                      h.phase === 'ascent' ? 'bg-emerald-100 text-emerald-800' :
                      h.phase === 'peak' ? 'bg-amber-100 text-amber-800' :
                      h.phase === 'descent' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {h.phase === 'completed' ? 'Done' : h.phase === 'sos' ? 'SOS' : h.phase}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  {h.phase !== 'completed' && (
                    <div className="w-full bg-slate-200 rounded-full h-1 my-1 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          h.phase === 'sos' ? 'bg-red-500 animate-pulse' :
                          h.phase === 'peak' ? 'bg-amber-500' :
                          h.phase === 'descent' ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${(h.progress / 9) * 100}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span className="truncate max-w-[130px]">📍 {getProgressDescription(h.progress, simulationStations)}</span>
                    <span className="font-semibold text-emerald-600 truncate max-w-[140px]">{etaText}</span>
                  </div>

                  {/* Immediate actions */}
                  <div className="flex gap-1.5 mt-1 pt-1.5 border-t border-dashed border-border">
                    {h.phase === 'peak' && (
                      <button
                        onClick={() => handleInitiateEarlyDescent(h.id)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-1.5 rounded text-[9px] flex items-center justify-center gap-1"
                      >
                        Descent Now
                      </button>
                    )}
                    {isSos ? (
                      <button
                        onClick={() => handleResolveSOS(h.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-1.5 rounded text-[9px]"
                      >
                        Clear SOS
                      </button>
                    ) : h.phase !== 'completed' ? (
                      <button
                        onClick={() => handleTriggerSOS(h.id)}
                        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-1 px-1.5 rounded text-[9px]"
                      >
                        Simulate SOS
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-muted-foreground border-t pt-1.5 text-center flex items-center justify-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            Click hiker markers on the map to view detailed emergency profile & pings.
          </div>
        </div>,
        document.body
      )}

      {/* Floating Button to restore Dashboard if closed */}
      {!showDashboard && createPortal(
        <button
          onClick={() => setShowDashboard(true)}
          className="fixed top-[10.5rem] right-3 z-[1200] inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 sm:top-[9.25rem] sm:right-4 sm:w-auto sm:gap-1.5 sm:px-3 sm:font-bold"
          aria-label="Show simulation controls"
          title="Show simulation controls"
        >
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="hidden sm:inline">Show Simulation Controls</span>
        </button>,
        document.body
      )}
    </>
  );
}
