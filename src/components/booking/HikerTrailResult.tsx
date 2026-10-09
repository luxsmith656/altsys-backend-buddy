import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import polyline from '@mapbox/polyline';
import { Activity, Clock3, MapPin, Mountain, Timer, TrendingDown, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getSessionPoints, listSessions, type OfflinePoint, type OfflineSession } from '@/lib/offlineDb';
import 'leaflet/dist/leaflet.css';

type TrackPoint = { lat: number; lng: number; alt?: number | null; ts?: number | null };
type TrailSession = {
  id: string;
  booking_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  total_distance_km?: number | null;
  moving_time_sec?: number | null;
  resting_time_sec?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  encoded_path?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  sessionId?: string;
  bookingId?: string;
  title?: string;
};

const startIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 8px #0006"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const finishIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:6px;background:#dc2626;border:3px solid white;box-shadow:0 2px 8px #0006"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatPace(seconds: number, km: number) {
  if (!km || km < 0.01 || !seconds) return '—';
  const pace = seconds / 60 / km;
  return `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km`;
}

function FitTrack({ points }: { points: TrackPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), { padding: [28, 28] });
  }, [map, points]);
  return null;
}

function normalizeOfflineSession(session: OfflineSession): TrailSession {
  return {
    id: session.serverSessionId || session.id,
    booking_id: session.bookingId,
    start_time: new Date(session.startedAt).toISOString(),
    end_time: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    total_distance_km: session.distanceM / 1000,
    moving_time_sec: session.movingSec,
    resting_time_sec: session.restingSec,
    elevation_gain_m: session.ascentM,
    elevation_loss_m: session.descentM,
    encoded_path: session.encodedPath,
  };
}

export default function HikerTrailResult({ open, onClose, userId, sessionId, bookingId, title = 'Your hike' }: Props) {
  const [session, setSession] = useState<TrailSession | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSession(null);
    setPoints([]);
    void (async () => {
      let serverSession: TrailSession | null = null;
      if (sessionId || bookingId) {
        let query = supabase
          .from('hiker_sessions')
          .select('id,booking_id,start_time,end_time,total_distance_km,moving_time_sec,resting_time_sec,elevation_gain_m,elevation_loss_m,encoded_path')
          .eq('user_id', userId)
          .eq('status', 'completed');
        query = sessionId ? query.eq('id', sessionId) : query.eq('booking_id', bookingId as string);
        const { data } = await query.order('end_time', { ascending: false }).limit(1).maybeSingle();
        serverSession = (data as TrailSession | null) ?? null;
      }

      let track: TrackPoint[] = [];
      if (serverSession) {
        const { data } = await supabase
          .from('hiker_locations')
          .select('latitude,longitude,altitude,timestamp')
          .eq('session_id', serverSession.id)
          .order('timestamp', { ascending: true });
        track = ((data ?? []) as Array<{ latitude: number; longitude: number; altitude?: number | null; timestamp?: string | null }>)
          .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
          .map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude), alt: point.altitude, ts: point.timestamp ? Date.parse(point.timestamp) : null }));
      }

      const localSessions = await listSessions(userId).catch(() => []);
      const local = localSessions.find((item) =>
        (serverSession && item.serverSessionId === serverSession.id) ||
        (sessionId && (item.id === sessionId || item.serverSessionId === sessionId)) ||
        (bookingId && item.bookingId === bookingId),
      );
      if (!serverSession && local) serverSession = normalizeOfflineSession(local);
      if (track.length < 2 && local) {
        const localPoints = await getSessionPoints(local.id).catch(() => [] as OfflinePoint[]);
        track = localPoints
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
          .map((point) => ({ lat: point.lat, lng: point.lng, alt: point.alt, ts: point.ts }));
      }
      if (track.length < 2 && serverSession?.encoded_path) {
        try {
          track = polyline.decode(serverSession.encoded_path).map(([lat, lng]) => ({ lat, lng }));
        } catch {
          // Keep the result usable even if an older recording contains invalid geometry.
        }
      }
      if (!cancelled) {
        setSession(serverSession);
        setPoints(track);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId, open, sessionId, userId]);

  const distanceKm = Number(session?.total_distance_km ?? 0);
  const movingSeconds = Number(session?.moving_time_sec ?? 0);
  const restingSeconds = Number(session?.resting_time_sec ?? 0);
  const elapsedSeconds = useMemo(() => {
    if (!session?.start_time) return movingSeconds + restingSeconds;
    const end = session.end_time ? Date.parse(session.end_time) : Date.now();
    return Math.max(0, Math.round((end - Date.parse(session.start_time)) / 1000));
  }, [movingSeconds, restingSeconds, session]);
  const line = points.map((point) => [point.lat, point.lng] as [number, number]);
  const center = line[0] ?? [14.1475, 121.3454] as [number, number];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mountain className="h-5 w-5 text-primary" /> {title} · Trail result</DialogTitle>
          <DialogDescription>Your recorded path, saved distance, and hike statistics.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">Loading your recorded trail…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={<MapPin className="h-4 w-4" />} label="Distance" value={`${distanceKm.toFixed(2)} km`} />
              <Stat icon={<Timer className="h-4 w-4" />} label="Moving time" value={formatDuration(movingSeconds)} />
              <Stat icon={<Clock3 className="h-4 w-4" />} label="Total time" value={formatDuration(elapsedSeconds)} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Avg pace" value={formatPace(movingSeconds, distanceKm)} />
              <Stat icon={<TrendingUp className="h-4 w-4" />} label="Elevation gain" value={`${Math.round(Number(session?.elevation_gain_m ?? 0))} m`} />
              <Stat icon={<TrendingDown className="h-4 w-4" />} label="Elevation loss" value={`${Math.round(Number(session?.elevation_loss_m ?? 0))} m`} />
            </div>
            <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/20">
              {line.length >= 2 ? (
                <MapContainer center={center} zoom={15} scrollWheelZoom className="h-[min(52vh,420px)] w-full">
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <FitTrack points={points} />
                  <Polyline positions={line} pathOptions={{ color: '#16a34a', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
                  <Marker position={line[0]} icon={startIcon} />
                  <Marker position={line[line.length - 1]} icon={finishIcon} />
                </MapContainer>
              ) : (
                <div className="flex min-h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  This hike has statistics saved, but its GPS points are still waiting to sync from the offline recorder.
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{points.length > 1 ? `${points.length} GPS points · green start · red finish` : 'Track preview unavailable until the recorded points sync'}</span>
              <span>{session?.end_time ? `Finished ${new Date(session.end_time).toLocaleString('en-PH')}` : 'Saved offline'}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-secondary/30 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="text-base font-semibold sm:text-lg">{value}</div>
    </div>
  );
}
