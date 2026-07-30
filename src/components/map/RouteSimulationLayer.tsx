import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { createPortal } from 'react-dom';
import L, { type LatLngTuple } from 'leaflet';
import { Activity, Pause, Play, RotateCcw, Users, X } from 'lucide-react';
import { haversineDistance } from '@/lib/map-data';

type SimulationPhase = 'ascent' | 'peak' | 'descent';

type SimulatedGroup = {
  id: string;
  name: string;
  guide: string;
  companions: string[];
  progress: number;
  direction: 1 | -1;
  phase: SimulationPhase;
  speed: number;
};

const INITIAL_GROUPS: SimulatedGroup[] = [
  {
    id: 'sim-marcos',
    name: 'Marcos Expedition',
    guide: 'Ruel Santos',
    companions: ['Lito Marcos', 'Jenny Marcos', 'Berto Marcos'],
    progress: 0.18,
    direction: 1,
    phase: 'ascent',
    speed: 1,
  },
  {
    id: 'sim-reyes',
    name: 'Reyes Family Hike',
    guide: 'Danilo Cruz',
    companions: ['Elena Reyes'],
    progress: 0.62,
    direction: 1,
    phase: 'ascent',
    speed: 0.8,
  },
  {
    id: 'sim-wanderers',
    name: 'Wanderers Group',
    guide: 'Esteban Reyes',
    companions: ['David Cruz', 'Mia Cruz'],
    progress: 0.76,
    direction: -1,
    phase: 'descent',
    speed: 1.15,
  },
];

function routeDistanceMeters(path: LatLngTuple[]) {
  return path.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = path[index - 1];
    return total + haversineDistance(previous[0], previous[1], point[0], point[1]) * 1000;
  }, 0);
}

function pointAlongRoute(path: LatLngTuple[], progress: number): LatLngTuple {
  if (path.length === 0) return [14.1475, 121.3454];
  if (path.length === 1) return path[0];

  const totalMeters = routeDistanceMeters(path);
  if (totalMeters <= 0) return path[0];
  const targetMeters = Math.max(0, Math.min(1, progress)) * totalMeters;
  let coveredMeters = 0;

  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1];
    const current = path[index];
    const segmentMeters = haversineDistance(previous[0], previous[1], current[0], current[1]) * 1000;
    if (coveredMeters + segmentMeters >= targetMeters && segmentMeters > 0) {
      const ratio = (targetMeters - coveredMeters) / segmentMeters;
      return [
        previous[0] + (current[0] - previous[0]) * ratio,
        previous[1] + (current[1] - previous[1]) * ratio,
      ];
    }
    coveredMeters += segmentMeters;
  }

  return path[path.length - 1];
}

function groupIcon(phase: SimulationPhase) {
  const color = phase === 'peak' ? '#f59e0b' : phase === 'descent' ? '#2563eb' : '#16a34a';
  const label = phase === 'peak' ? 'P' : phase === 'descent' ? 'D' : 'H';
  return new L.DivIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};color:#fff;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.4);font-size:11px;font-weight:800">${label}</div>`,
  });
}

interface RouteSimulationLayerProps {
  routeName: string;
  routePath: LatLngTuple[];
}

export default function RouteSimulationLayer({ routeName, routePath }: RouteSimulationLayerProps) {
  const validPath = useMemo(
    () => routePath.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    [routePath],
  );
  const totalKm = useMemo(() => routeDistanceMeters(validPath) / 1000, [validPath]);
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 5 | 10>(5);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);

  useEffect(() => {
    if (!playing || validPath.length < 2) return;
    const timer = window.setInterval(() => {
      setGroups((current) => current.map((group) => {
        const delta = 0.00045 * speed * group.speed * group.direction;
        let progress = group.progress + delta;
        let direction = group.direction;
        let phase = group.phase;

        if (progress >= 1) {
          progress = 1;
          direction = -1;
          phase = 'peak';
        } else if (phase === 'peak') {
          phase = 'descent';
        } else if (progress <= 0) {
          progress = 0;
          direction = 1;
          phase = 'ascent';
        } else {
          phase = direction === 1 ? 'ascent' : 'descent';
        }

        return { ...group, progress, direction, phase };
      }));
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing, speed, validPath.length]);

  if (validPath.length < 2) return null;

  const controller = panelOpen ? (
    <div className="fixed right-3 top-[8.75rem] z-[9999] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-background/95 p-3 shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Route Simulation</div>
          <div className="truncate text-[11px] text-muted-foreground">{routeName}</div>
        </div>
        <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setPanelOpen(false)} aria-label="Close simulation controls">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => {
            setGroups(INITIAL_GROUPS);
            setPlaying(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <div className="ml-auto flex rounded-md border border-border p-0.5">
          {([1, 5, 10] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
              className={`h-7 min-w-8 rounded px-1.5 text-[11px] font-semibold ${speed === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {value}x
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-xs">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
            <span className="capitalize text-muted-foreground">{group.phase}</span>
            <span className="w-10 text-right font-semibold">{Math.round(group.progress * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      className="fixed right-3 top-[8.75rem] z-[9999] inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background/95 px-3 text-xs font-semibold shadow-xl backdrop-blur-md"
    >
      <Activity className="h-4 w-4 text-success" />
      Simulation
    </button>
  );

  return (
    <>
      {groups.map((group) => (
        <Marker key={group.id} position={pointAlongRoute(validPath, group.progress)} icon={groupIcon(group.phase)}>
          <Popup>
            <div className="min-w-56 space-y-2 text-xs">
              <div>
                <div className="font-bold">{group.name}</div>
                <div className="capitalize text-muted-foreground">{group.phase} on {routeName}</div>
              </div>
              <div><b>Guide:</b> {group.guide}</div>
              <div><b>Companions:</b> {group.companions.join(', ')}</div>
              <div><b>Progress:</b> {Math.round(group.progress * 100)}% ({(totalKm * group.progress).toFixed(2)} km)</div>
              <div><b>Estimated remaining:</b> {Math.max(1, Math.round(totalKm * (group.direction === 1 ? 1 - group.progress : group.progress) * 24))} minutes</div>
            </div>
          </Popup>
        </Marker>
      ))}
      {typeof document !== 'undefined' && createPortal(controller, document.body)}
    </>
  );
}
