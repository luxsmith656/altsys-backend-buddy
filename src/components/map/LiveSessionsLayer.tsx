import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { completeActiveHikeTracker, ensureActiveHikeTracker } from '@/lib/tracking/activeTrackerManager';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import type { HikeTracker, TrackerSnapshot } from '@/lib/tracking/HikeTracker';
import { getActiveSession, getSessionPoints } from '@/lib/offlineDb';
import { splitTrackAtGaps, guideFixToTrail } from '@/lib/tracking/geo';
import StationReportControl from './StationReportControl';
import SOSPanel from '@/components/core/SOSPanel';

type SessionRole = 'hiker' | 'guide' | 'ranger' | 'admin';

type ActiveSession = {
  id: string;
  local_session_id?: string;
  user_id: string;
  booking_id: string | null;
  trail_zone_id?: string | null;
  location_id?: string | null;
  participant_role?: SessionRole;
  tracking_phase?: string;
  start_time: string;
  status: string;
  client_session_id?: string | null;
};

type ParticipantProfile = { name: string; avatarUrl: string | null };

type LocationPoint = {
  session_id: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  timestamp: string;
};

type CompanionLocation = {
  id: string;
  booking_id: string;
  companion_index: number;
  companion_name: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  timestamp: string;
};

function SelfMapSosControl() {
  const map = useMap();
  const container = useMemo(() => document.createElement('div'), []);

  useEffect(() => {
    const control = new L.Control({ position: 'bottomright' });
    control.onAdd = () => container;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    control.addTo(map);
    return () => { control.remove(); };
  }, [container, map]);

  return createPortal(<SOSPanel compact />, container);
}

type Props = {
  routePaths?: { id?: string; path: [number, number, number?][] }[];
  mode: 'self' | 'monitor';
  userId: string;
  userRole: string | null;
  locationId?: string | null;
  /** Monitor mode can be mounted beside self mode for guides without drawing their own marker twice. */
  excludeUserId?: string | null;
  onSelfLocationChange?: (location: { lat: number; lng: number; timestamp?: string } | null) => void;
};

function mergeLocationPoints(...collections: LocationPoint[][]): LocationPoint[] {
  const byFix = new Map<string, LocationPoint>();
  collections.flat().forEach((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    const timestamp = new Date(point.timestamp).getTime();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestamp)) return;
    // A timestamp plus coordinates is the client-owned point identity. This
    // prevents reconnect retries from drawing duplicate trail segments.
    byFix.set(String(timestamp), {
      ...point, latitude, longitude,
    });
  });
  return Array.from(byFix.values()).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const roleColor: Record<string, string> = {
  hiker: '#16a34a',
  guide: '#2563eb',
  ranger: '#9333ea',
  admin: '#ea580c',
};

function liveMarkerIcon(role: string, heading: number | null, isSelf: boolean, avatarUrl: string | null, bookingColor: string) {
  const color = bookingColor || roleColor[role] || '#16a34a';
  const rotation = Number.isFinite(heading) ? Number(heading) : 0;
  const label = isSelf ? 'YOU' : role === 'guide' ? 'G' : role === 'ranger' ? 'R' : 'H';
  const shape = role === 'guide' ? 'clip-path:polygon(50% 0%, 92% 18%, 84% 76%, 50% 100%, 16% 76%, 8% 18%)' : 'border-radius:50%';
  const image = avatarUrl ? `<img src="${avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />` : `<span style="position:relative;color:white;font:800 ${isSelf ? '8px' : '11px'} system-ui">${label}</span>`;
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:38px;height:38px;display:grid;place-items:center">
        <div style="position:absolute;inset:3px;${shape};overflow:hidden;background:${color};border:3px solid ${color};box-shadow:0 3px 10px rgba(15,23,42,.4);display:grid;place-items:center">${image}</div>
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
  excludeUserId = null,
  onSelfLocationChange,
  routePaths = [],
}: Props) {
  const map = useMap();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [paths, setPaths] = useState<Record<string, LocationPoint[]>>({});
  const [profiles, setProfiles] = useState<Record<string, ParticipantProfile>>({});
  const [companionLocations, setCompanionLocations] = useState<CompanionLocation[]>([]);
  const [localSnapshot, setLocalSnapshot] = useState<TrackerSnapshot | null>(null);
  const [stationReports, setStationReports] = useState<Record<string, { station: number; reported_at: string }>>({});
  const centeredRef = useRef(false);
  const gpsErrorShownRef = useRef(false);
  const hadSelfSessionRef = useRef(false);

  const loadLocalSelfSession = useCallback(async () => {
    if (mode !== 'self') return null;
    const local = await getActiveSession(userId);
    if (!local) return null;
    const localPoints = await getSessionPoints(local.id);
    const points: LocationPoint[] = localPoints.map((point) => ({
      session_id: local.id,
      latitude: point.lat,
      longitude: point.lng,
      altitude: point.alt,
      accuracy: point.accuracy,
      heading: point.heading,
      timestamp: new Date(point.ts).toISOString(),
    }));
    return {
      session: {
        id: local.serverSessionId ?? local.id,
        local_session_id: local.id,
        user_id: local.userId,
        booking_id: local.bookingId ?? null,
        trail_zone_id: local.trailZoneId ?? null,
        location_id: local.locationId ?? null,
        participant_role: local.participantRole,
        tracking_phase: local.phase,
        start_time: new Date(local.startedAt).toISOString(),
        status: 'active',
        client_session_id: local.id,
      } satisfies ActiveSession,
      points,
    };
  }, [mode, userId]);

  const load = useCallback(async () => {
    const localSelf = mode === 'self' ? await loadLocalSelfSession() : null;
    if (localSelf) {
      if (navigator.onLine === false) setSessions([localSelf.session]);
      setPaths({ [localSelf.session.id]: localSelf.points });
      const latest = localSelf.points[localSelf.points.length - 1];
      onSelfLocationChange?.(latest ? { lat: latest.latitude, lng: latest.longitude, timestamp: latest.timestamp } : null);
    }
    if (mode === 'self' && navigator.onLine === false) {
      // IndexedDB is the source of truth until the connection returns.
      setCompanionLocations([]);
      return;
    }
    let sessionQuery = supabase
      .from('hiker_sessions')
      .select('id,user_id,booking_id,trail_zone_id,location_id,participant_role,tracking_phase,start_time,status,client_session_id')
      .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
      .order('start_time', { ascending: false });

    if (mode === 'self') {
      sessionQuery = sessionQuery.eq('user_id', userId).limit(1) as typeof sessionQuery;
    } else if (locationId) {
      sessionQuery = sessionQuery.eq('status', 'active').eq('location_id', locationId) as typeof sessionQuery;
    } else {
      sessionQuery = sessionQuery.eq('status', 'active') as typeof sessionQuery;
    }

    let { data, error } = await sessionQuery;
    if (error) {
      let fallback = supabase
        .from('hiker_sessions')
        .select('id,user_id,booking_id,trail_zone_id,start_time,status,client_session_id')
        .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
        .order('start_time', { ascending: false });
      if (mode === 'self') fallback = fallback.eq('user_id', userId).limit(1) as typeof fallback;
      else fallback = fallback.eq('status', 'active') as typeof fallback;
      const result = await fallback;
      data = result.data as typeof data;
      error = result.error;
    }
    if (error) {
      const local = await loadLocalSelfSession();
      if (local) {
        setSessions([local.session]);
        setPaths({ [local.session.id]: local.points });
        const latest = local.points[local.points.length - 1];
        onSelfLocationChange?.(latest ? { lat: latest.latitude, lng: latest.longitude, timestamp: latest.timestamp } : null);
      }
      return;
    }

    const latestSelfSession = mode === 'self' ? (data as ActiveSession[] | null)?.[0] : null;
    if (latestSelfSession && latestSelfSession.status !== 'active') {
      await completeActiveHikeTracker().catch((completionError) => console.warn('Could not close completed local hike tracker', completionError));
      setSessions([]);
      setPaths({});
      onSelfLocationChange?.(null);
      return;
    }

    let visibleSessions = ((data as ActiveSession[] | null) ?? []).filter(
      (session) => session.status === 'active'
        && (mode === 'monitor' || session.user_id === userId)
        && (!excludeUserId || session.user_id !== excludeUserId),
    );
    if (mode === 'self' && visibleSessions.length === 0) {
      const local = await loadLocalSelfSession();
      if (local) {
        visibleSessions = [local.session];
        setSessions(visibleSessions);
        setPaths({ [local.session.id]: local.points });
        const latest = local.points[local.points.length - 1];
        onSelfLocationChange?.(latest ? { lat: latest.latitude, lng: latest.longitude, timestamp: latest.timestamp } : null);
        return;
      }
    }
    setSessions(visibleSessions);

    // QR companions are temporary, unauthenticated participants. Their latest
    // beacon is kept in a separate table and RLS returns only this guide's
    // assigned booking rows (or the staff rows for monitor accounts).
    if (mode === 'monitor') {
      const { data: companionRows } = await (supabase as any)
        .from('booking_companion_locations')
        .select('id,booking_id,companion_index,companion_name,latitude,longitude,accuracy,heading,timestamp')
        .eq('status', 'active')
        .order('timestamp', { ascending: false });
      setCompanionLocations((companionRows as CompanionLocation[] | null) ?? []);
    } else {
      setCompanionLocations([]);
    }

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
    if (mode === 'self' && localSelf && visibleSessions[0]) {
      const serverId = visibleSessions[0].id;
      const localPoints = localSelf.points.map((point) => ({ ...point, session_id: serverId }));
      nextPaths[serverId] = mergeLocationPoints(nextPaths[serverId] ?? [], localPoints);
    }
    setPaths(nextPaths);
    const { data: reports } = await supabase.from('hike_station_reports')
      .select('session_id,station,reported_at').in('session_id', ids)
      .order('reported_at', { ascending: false }).limit(500);
    const latestReports: typeof stationReports = {};
    for (const report of reports ?? []) latestReports[report.session_id] ??= report;
    setStationReports(latestReports);

    if (mode === 'monitor') {
      const userIds = Array.from(new Set(visibleSessions.map((session) => session.user_id)));
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id,full_name,avatar_url')
        .in('user_id', userIds);
      const nextProfiles: Record<string, ParticipantProfile> = {};
      (profileRows ?? []).forEach((profile) => {
        nextProfiles[profile.user_id] = { name: profile.full_name || 'Trail participant', avatarUrl: profile.avatar_url || null };
      });
      const { data: guideRows } = await supabase
        .from('guides' as any)
        .select('user_id,full_name,photo_url')
        .in('user_id', userIds);
      (guideRows as any[] | null ?? []).forEach((guide) => {
        const current = nextProfiles[guide.user_id];
        nextProfiles[guide.user_id] = {
          name: current?.name || guide.full_name || 'Mountain guide',
          avatarUrl: current?.avatarUrl || guide.photo_url || null,
        };
      });
      setProfiles(nextProfiles);
    }
  }, [excludeUserId, loadLocalSelfSession, locationId, mode, onSelfLocationChange, userId]);

  useEffect(() => {
    void load();
    const sessionChannel = supabase
      .channel(`map-live-sessions-${mode}-${userId}-${locationId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hike_station_reports' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hiker_locations' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_companion_locations' }, () => void load())
      .subscribe();
    const poll = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(sessionChannel);
    };
  }, [load, locationId, mode, userId]);

  const selfSession = mode === 'self' ? sessions[0] ?? null : null;

  useEffect(() => {
    if (mode !== 'self') return;
    if (selfSession) {
      hadSelfSessionRef.current = true;
      return;
    }
    // A missing server snapshot is often a temporary offline/RLS state. Keep
    // the local tracker alive until staff explicitly completes the hike.
    if (hadSelfSessionRef.current) return;
  }, [mode, selfSession]);

  useEffect(() => {
    if (!selfSession || (userRole !== 'hiker' && userRole !== 'guide')) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    void ensureActiveHikeTracker({
      userId,
      bookingId: selfSession.booking_id,
      trailZoneId: selfSession.trail_zone_id ?? null,
      serverSessionId: selfSession.local_session_id === selfSession.id ? null : selfSession.id,
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
      ? { lat: localSnapshot.lastFix.lat, lng: localSnapshot.lastFix.lng, timestamp: new Date(localSnapshot.lastFix.ts).toISOString() }
      : null;
    const points = selfSession ? renderedPaths[selfSession.id] ?? [] : [];
    const latestServer = points.length
      ? { lat: points[points.length - 1].latitude, lng: points[points.length - 1].longitude, timestamp: points[points.length - 1].timestamp }
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
      {selfSession && (userRole === 'hiker' || userRole === 'guide') && <SelfMapSosControl />}
      {selfSession && (userRole === 'hiker' || userRole === 'guide') && selfSession.id !== selfSession.local_session_id && <StationReportControl sessionId={selfSession.id} userId={userId} />}
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
        const linePoints = points.map((point) => ({ lat: point.latitude, lng: point.longitude, ts: point.timestamp }));
        const lines = isSelf && localSnapshot?.pathSegments?.length
          ? localSnapshot.pathSegments.map((segment) => segment.map((point) => [point.lat, point.lng] as [number, number]))
          : splitTrackAtGaps(linePoints).map((segment) => segment.map((point) => [point.lat, point.lng] as [number, number]));
        const bookingColor = session.booking_id
          ? ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2'][Array.from(session.booking_id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5]
          : roleColor[role] ?? '#16a34a';
        const profile = profiles[session.user_id];
        const measuredFix = { lat: latest.latitude, lng: latest.longitude };
        const route = routePaths.find(route => route.id === session.trail_zone_id);
        const displayFix = route ? guideFixToTrail(measuredFix, Number(latest.accuracy ?? localSnapshot?.lastFix?.accuracy), route.path) : measuredFix;
        return (
          <Fragment key={session.id}>
            {lines.map((line, index) => line.length > 1 && (
              <Polyline key={`${session.id}-segment-${index}`} positions={line}
                pathOptions={{ color: bookingColor, weight: isSelf ? 5 : 3, opacity: 0.78 }} />
            ))}
            <Marker
              position={[displayFix.lat, displayFix.lng]}
              icon={liveMarkerIcon(role, heading, isSelf, profile?.avatarUrl ?? null, bookingColor)}
              zIndexOffset={role === 'guide' ? 2100 : 2200}
            >
              <Popup>
                <div className="min-w-[180px] text-sm">
                  <p className="font-bold">{isSelf ? 'Your live location' : profile?.name || 'Trail participant'}</p>
                  {displayFix !== measuredFix && <p className="text-xs">Position aligned to the nearby trail within GPS uncertainty.</p>}
                  <p className="capitalize text-xs">{role} · {session.tracking_phase || 'ascent'}</p>
                  <p className="mt-1 text-xs">Last update: {new Date(latest.timestamp).toLocaleString()}</p>
                  {stationReports[session.id] && <p className="text-xs">Reported: {stationReports[session.id].station === 6 ? 'Peak' : `Station ${stationReports[session.id].station}`} at {new Date(stationReports[session.id].reported_at).toLocaleString()} (manual)</p>}
                  {latest.accuracy != null && <p className="text-xs">GPS accuracy: ±{Math.round(Number(latest.accuracy))} m</p>}
                </div>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
      {mode === 'monitor' && companionLocations.map((companion) => {
        const bookingColor = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2'][
          Array.from(companion.booking_id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5
        ];
        const position = { lat: Number(companion.latitude), lng: Number(companion.longitude) };
        if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
        return (
          <Marker
            key={`companion-${companion.id}`}
            position={[position.lat, position.lng]}
            icon={liveMarkerIcon('hiker', Number(companion.heading), false, null, bookingColor)}
            zIndexOffset={2200}
          >
            <Popup>
              <div className="min-w-[180px] text-sm">
                <p className="font-bold">{companion.companion_name}</p>
                <p className="capitalize text-xs">Companion · temporary account</p>
                <p className="mt-1 text-xs">Last update: {new Date(companion.timestamp).toLocaleString()}</p>
                {companion.accuracy != null && <p className="text-xs">GPS accuracy: ±{Math.round(Number(companion.accuracy))} m</p>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
