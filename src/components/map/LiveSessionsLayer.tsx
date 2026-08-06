import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ensureActiveHikeTracker } from '@/lib/tracking/activeTrackerManager';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import type { TrackerSnapshot } from '@/lib/tracking/HikeTracker';

type SessionRole = 'hiker' | 'guide' | 'ranger' | 'admin';

type ActiveSession = {
  id: string;
  user_id: string;
  booking_id: string | null;
  trail_zone_id?: string | null;
  location_id?: string | null;
  participant_role?: SessionRole;
  tracking_phase?: string;
  start_time: string;
  client_session_id?: string | null;
};

type LocationPoint = {
  session_id: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  timestamp: string;
};

type Props = {
  mode: 'self' | 'monitor';
  userId: string;
  userRole: string | null;
  locationId?: string | null;
  onSelfLocationChange?: (location: { lat: number; lng: number } | null) => void;
};

const roleColor: Record<string, string> = {
  hiker: '#16a34a',
  guide: '#2563eb',
  ranger: '#9333ea',
  admin: '#ea580c',
};

function liveMarkerIcon(role: string, heading: number | null, isSelf: boolean) {
  const color = roleColor[role] ?? '#16a34a';
  const rotation = Number.isFinite(heading) ? Number(heading) : 0;
  const label = isSelf ? 'YOU' : role === 'guide' ? 'G' : role === 'ranger' ? 'R' : 'H';
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:38px;height:38px;display:grid;place-items:center">
        <div style="position:absolute;inset:3px;border-radius:${role === 'guide' ? '9px' : '50%'};background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(15,23,42,.4)"></div>
        <span style="position:relative;color:white;font:800 ${isSelf ? '8px' : '11px'} system-ui">${label}</span>
        <span style="position:absolute;left:15px;top:-7px;color:${color};font-size:16px;line-height:1;transform:rotate(${rotation}deg);transform-origin:4px 25px;text-shadow:0 1px 2px white">▲</span>
      </div>`,
    iconSize: [38, 38],
    iconAnchor: role === 'guide' ? [8, 19] : [30, 19],
    popupAnchor: [0, -18],
  });
}

export default function LiveSessionsLayer({
  mode,
  userId,
  userRole,
  locationId,
  onSelfLocationChange,
}: Props) {
  const map = useMap();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [paths, setPaths] = useState<Record<string, LocationPoint[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [localSnapshot, setLocalSnapshot] = useState<TrackerSnapshot | null>(null);
  const centeredRef = useRef(false);
  const gpsErrorShownRef = useRef(false);

  const load = useCallback(async () => {
    let sessionQuery = supabase
      .from('hiker_sessions')
      .select('id,user_id,booking_id,trail_zone_id,location_id,participant_role,tracking_phase,start_time,status,client_session_id')
      .eq('status', 'active')
      .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
      .order('start_time', { ascending: false });

    if (mode === 'self') {
      sessionQuery = sessionQuery.eq('user_id', userId) as typeof sessionQuery;
    } else if (locationId) {
      sessionQuery = sessionQuery.eq('location_id', locationId) as typeof sessionQuery;
    }

    let { data, error } = await sessionQuery;
    if (error) {
      let fallback = supabase
        .from('hiker_sessions')
        .select('id,user_id,booking_id,trail_zone_id,start_time,status,client_session_id')
        .eq('status', 'active')
        .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
        .order('start_time', { ascending: false });
      if (mode === 'self') fallback = fallback.eq('user_id', userId) as typeof fallback;
      const result = await fallback;
      data = result.data as typeof data;
      error = result.error;
    }
    if (error) return;

    const visibleSessions = ((data as ActiveSession[] | null) ?? []).filter(
      (session) => mode === 'monitor' || session.user_id === userId,
    );
    setSessions(visibleSessions);

    const ids = visibleSessions.map((session) => session.id);
    if (ids.length === 0) {
      setPaths({});
      onSelfLocationChange?.(null);
      return;
    }

    const { data: pointRows } = await supabase
      .from('hiker_locations')
      .select('session_id,latitude,longitude,altitude,accuracy,heading,timestamp')
      .in('session_id', ids)
      .order('timestamp', { ascending: true })
      .limit(mode === 'self' ? 1500 : 2500);

    const nextPaths: Record<string, LocationPoint[]> = {};
    ((pointRows as LocationPoint[] | null) ?? []).forEach((point) => {
      if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) return;
      (nextPaths[point.session_id] ??= []).push({
        ...point,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
      });
    });
    setPaths(nextPaths);

    if (mode === 'monitor') {
      const userIds = Array.from(new Set(visibleSessions.map((session) => session.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id,full_name')
        .in('user_id', userIds);
      const nextNames: Record<string, string> = {};
      (profiles ?? []).forEach((profile) => {
        nextNames[profile.user_id] = profile.full_name || 'Trail participant';
      });
      setNames(nextNames);
    }
  }, [locationId, mode, onSelfLocationChange, userId]);

  useEffect(() => {
    void load();
    const sessionChannel = supabase
      .channel(`map-live-sessions-${mode}-${userId}-${locationId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hiker_locations' }, () => void load())
      .subscribe();
    const poll = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(sessionChannel);
    };
  }, [load, locationId, mode, userId]);

  const selfSession = mode === 'self' ? sessions[0] ?? null : null;

  useEffect(() => {
    if (!selfSession || (userRole !== 'hiker' && userRole !== 'guide')) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void ensureActiveHikeTracker({
      userId,
      bookingId: selfSession.booking_id,
      trailZoneId: selfSession.trail_zone_id ?? null,
      serverSessionId: selfSession.id,
      participantRole: userRole,
      locationId: selfSession.location_id ?? locationId ?? null,
    })
      .then((tracker) => {
        if (!active) return;
        unsubscribe = tracker.subscribe(setLocalSnapshot);
      })
      .catch((error) => {
        if (!gpsErrorShownRef.current) {
          gpsErrorShownRef.current = true;
          toast.error('Location permission is required to begin trail tracking.', {
            description: error instanceof Error ? error.message : 'Enable precise location and try again.',
          });
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [locationId, selfSession, userId, userRole]);

  const renderedPaths = useMemo(() => {
    if (!selfSession || !localSnapshot?.path.length) return paths;
    return {
      ...paths,
      [selfSession.id]: localSnapshot.path.map((point) => ({
        session_id: selfSession.id,
        latitude: point.lat,
        longitude: point.lng,
        timestamp: new Date().toISOString(),
      })),
    };
  }, [localSnapshot, paths, selfSession]);

  useEffect(() => {
    if (mode !== 'self') return;
    const latestLocal = localSnapshot?.lastFix
      ? { lat: localSnapshot.lastFix.lat, lng: localSnapshot.lastFix.lng }
      : null;
    const points = selfSession ? renderedPaths[selfSession.id] ?? [] : [];
    const latestServer = points.length
      ? { lat: points[points.length - 1].latitude, lng: points[points.length - 1].longitude }
      : null;
    const location = latestLocal ?? latestServer;
    onSelfLocationChange?.(location);
    if (location && !centeredRef.current) {
      centeredRef.current = true;
      map.setView([location.lat, location.lng], Math.max(map.getZoom(), 17), { animate: true });
    }
  }, [localSnapshot, map, mode, onSelfLocationChange, renderedPaths, selfSession]);

  return (
    <>
      {sessions.map((session) => {
        const points = renderedPaths[session.id] ?? [];
        if (points.length === 0) return null;
        const latest = points[points.length - 1] as { latitude: number; longitude: number; timestamp: string; heading?: number | null; accuracy?: number | null };
        const isSelf = mode === 'self' && session.user_id === userId;
        const role = session.participant_role ?? (isSelf && userRole === 'guide' ? 'guide' : 'hiker');
        const heading = isSelf && localSnapshot?.lastFix
          ? localSnapshot.lastFix.heading
          : Number.isFinite(Number(latest.heading))
            ? Number(latest.heading)
            : null;
        const line = points.map((point) => [point.latitude, point.longitude] as [number, number]);
        return (
          <Fragment key={session.id}>
            {line.length > 1 && (
              <Polyline
                positions={line}
                pathOptions={{ color: roleColor[role] ?? '#16a34a', weight: isSelf ? 5 : 3, opacity: 0.78 }}
              />
            )}
            <Marker
              position={[latest.latitude, latest.longitude]}
              icon={liveMarkerIcon(role, heading, isSelf)}
              zIndexOffset={role === 'guide' ? 2100 : 2200}
            >
              <Popup>
                <div className="min-w-[180px] text-sm">
                  <p className="font-bold">{isSelf ? 'Your live location' : names[session.user_id] || 'Trail participant'}</p>
                  <p className="capitalize text-xs">{role} · {session.tracking_phase || 'ascent'}</p>
                  <p className="mt-1 text-xs">Last update: {new Date(latest.timestamp).toLocaleString()}</p>
                  {latest.accuracy != null && <p className="text-xs">GPS accuracy: ±{Math.round(Number(latest.accuracy))} m</p>}
                </div>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}
