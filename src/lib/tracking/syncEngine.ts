/** Drains the offline queue and uploads sessions / points to Supabase when online. */
import { supabase } from '@/integrations/supabase/client';
import { drainQueue, removeQueueItem, bumpQueueAttempt, saveSession } from '@/lib/offlineDb';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let onlineHandler: (() => void) | null = null;

function isSchemaCacheError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return message.includes('schema cache') || message.includes('could not find') || message.includes('column');
}

async function pushOne(item: any) {
  if (item.kind === 'sos_cancel') {
    const { error } = await supabase.rpc('cancel_own_emergency_alert' as any, { p_alert_id: item.payload.alertId });
    if (error) {
      const fallback = await supabase.from('emergency_alerts' as any)
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('id', item.payload.alertId)
        .eq('user_id', item.payload.userId)
        .in('status', ['open', 'acknowledged']);
      if (fallback.error) throw fallback.error;
    }
    return;
  }
  if (item.kind === 'sos') {
    const p = item.payload;
    let latest = { latitude: p.latitude, longitude: p.longitude };
    try {
      const saved = localStorage.getItem(`mtk-active-sos:${p.userId}`);
      const local = saved ? JSON.parse(saved) as { clientAlertId?: string; lastLocation?: { lat?: number; lng?: number } } : null;
      if (local?.clientAlertId === p.clientAlertId && Number.isFinite(local.lastLocation?.lat) && Number.isFinite(local.lastLocation?.lng)) {
        latest = { latitude: local.lastLocation!.lat, longitude: local.lastLocation!.lng };
      }
    } catch { /* local SOS state is optional during background sync */ }
    const row = {
      user_id: p.userId,
      reporter_role: p.reporterRole ?? 'hiker',
      booking_id: p.bookingId ?? null,
      session_id: p.sessionId ?? null,
      location_id: p.locationId ?? null,
      latitude: Number.isFinite(latest.latitude) ? latest.latitude : null,
      longitude: Number.isFinite(latest.longitude) ? latest.longitude : null,
      message: p.message ?? 'Emergency assistance requested',
      status: 'open',
      created_at: p.createdAt ?? new Date().toISOString(),
      client_alert_id: p.clientAlertId ?? null,
    };
    let { data, error } = await supabase.from('emergency_alerts' as any)
      .upsert(row, { onConflict: 'client_alert_id' }).select('id').single();
    if (error && isSchemaCacheError(error)) {
      const { client_alert_id: _clientAlertId, ...legacyRow } = row;
      const fallback = await supabase.from('emergency_alerts' as any).insert(legacyRow).select('id').single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    const synced = data as { id?: string } | null;
    window.dispatchEvent(new CustomEvent('sos-synced', {
      detail: { clientAlertId: p.clientAlertId, alertId: synced?.id ?? null },
    }));
    return;
  }

  if (item.kind === 'station') {
    let { error } = await supabase.from('hike_station_reports').upsert(item.payload, { onConflict: 'id', ignoreDuplicates: true });
    if (error && isSchemaCacheError(error)) {
      const { latitude: _latitude, longitude: _longitude, accuracy: _accuracy, ...legacyPayload } = item.payload;
      const fallback = await supabase.from('hike_station_reports').upsert(legacyPayload, { onConflict: 'id', ignoreDuplicates: true });
      error = fallback.error;
    }
    if (error) throw error;
    return;
  }
  if (item.kind === 'session') {
    const s = item.payload;
    const row = {
      client_session_id: s.id,
      user_id: s.userId,
      participant_role: s.participantRole ?? 'hiker',
      location_id: s.locationId ?? null,
      booking_id: s.bookingId ?? null,
      trail_zone_id: s.trailZoneId ?? null,
      start_time: new Date(s.startedAt).toISOString(),
      end_time: s.endedAt ? new Date(s.endedAt).toISOString() : null,
      status: s.status,
      tracking_phase: s.phase ?? 'ascent',
      peak_reached_at: s.peakReachedAt ? new Date(s.peakReachedAt).toISOString() : null,
      descent_started_at: s.descentStartedAt ? new Date(s.descentStartedAt).toISOString() : null,
      total_distance_km: +(s.distanceM / 1000).toFixed(3),
      moving_time_sec: s.movingSec,
      resting_time_sec: s.restingSec,
      elevation_gain_m: Math.round(s.ascentM),
      elevation_loss_m: Math.round(s.descentM),
      ascent_time_sec: s.ascentSec,
      descent_time_sec: s.descentSec,
      summit_reached: s.summitReached,
      encoded_path: s.encodedPath,
      last_synced_at: new Date().toISOString(),
      last_track_at: new Date().toISOString(),
    } as any;

    const serverUpdateRow = { ...row };
    delete serverUpdateRow.client_session_id;
    let result = s.serverSessionId
      ? await supabase.from('hiker_sessions').update(serverUpdateRow).eq('id', s.serverSessionId).select('id').maybeSingle()
      : await supabase.from('hiker_sessions').upsert(row, { onConflict: 'client_session_id' }).select('id').maybeSingle();
    let { error } = result;
    if (error && isSchemaCacheError(error)) {
      const legacyRow = {
        client_session_id: s.id,
        user_id: s.userId,
        booking_id: s.bookingId ?? null,
        trail_zone_id: s.trailZoneId ?? null,
        start_time: new Date(s.startedAt).toISOString(),
        end_time: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        status: s.status,
        total_distance_km: +(s.distanceM / 1000).toFixed(3),
        moving_time_sec: s.movingSec,
        resting_time_sec: s.restingSec,
        elevation_gain_m: Math.round(s.ascentM),
        elevation_loss_m: Math.round(s.descentM),
        ascent_time_sec: s.ascentSec,
        descent_time_sec: s.descentSec,
        summit_reached: s.summitReached,
        encoded_path: s.encodedPath,
        last_synced_at: new Date().toISOString(),
      } as any;
      const serverLegacyRow = { ...legacyRow };
      delete serverLegacyRow.client_session_id;
      const fallback = s.serverSessionId
        ? await supabase.from('hiker_sessions').update(serverLegacyRow).eq('id', s.serverSessionId).select('id').maybeSingle()
        : await supabase.from('hiker_sessions').upsert(legacyRow, { onConflict: 'client_session_id' }).select('id').maybeSingle();
      result = fallback;
      error = fallback.error;
    }
    if (error) throw error;
    const serverId = result.data?.id ?? s.serverSessionId ?? null;
    if (serverId && !s.serverSessionId) await saveSession({ ...s, serverSessionId: serverId });
    return;
  }

  if (item.kind === 'points') {
    const { sessionId, serverSessionId, points } = item.payload;
    // Resolve real session id
    let realSessionId = serverSessionId as string | undefined;
    if (!realSessionId) {
      const { data: sess } = await supabase
        .from('hiker_sessions')
        .select('id')
        .eq('client_session_id', sessionId)
        .maybeSingle();
      realSessionId = sess?.id;
    }
    if (!realSessionId) throw new Error('Session not found for points upload');
    const rows = (points as any[]).map((p) => ({
      session_id: realSessionId, latitude: p.lat, longitude: p.lng, altitude: p.alt,
      accuracy: p.accuracy ?? null,
      speed_m_s: p.speed ?? null,
      heading: p.heading ?? null,
      segment: p.segment ?? null,
      timestamp: new Date(p.ts).toISOString(),
    }));
    // Batched
    for (let i = 0; i < rows.length; i += 500) {
      let { error } = await supabase.from('hiker_locations').insert(rows.slice(i, i + 500));
      if (error && isSchemaCacheError(error)) {
        const legacyRows = rows.slice(i, i + 500).map((r) => ({
          session_id: r.session_id,
          latitude: r.latitude,
          longitude: r.longitude,
          altitude: r.altitude,
          timestamp: r.timestamp,
        }));
        const fallback = await supabase.from('hiker_locations').insert(legacyRows);
        error = fallback.error;
      }
      if (error) throw error;
    }
    return;
  }

  if (item.kind === 'ping') {
    const { sessionId, serverSessionId, lat, lng, alt, accuracy, speed, heading, segment, ts } = item.payload;
    let realSessionId = serverSessionId as string | undefined;
    if (!realSessionId) {
      const { data: sess } = await supabase
        .from('hiker_sessions').select('id').eq('client_session_id', sessionId).maybeSingle();
      realSessionId = sess?.id;
    }
    if (!realSessionId) throw new Error('Session not found for queued location ping');
    let { error } = await supabase.from('hiker_locations').insert({
      session_id: realSessionId, latitude: lat, longitude: lng, altitude: alt,
      accuracy: accuracy ?? null,
      speed_m_s: speed ?? null,
      heading: heading ?? null,
      segment: segment ?? null,
      timestamp: new Date(ts).toISOString(),
    } as any);
    if (error && isSchemaCacheError(error)) {
      const fallback = await supabase.from('hiker_locations').insert({
        session_id: realSessionId, latitude: lat, longitude: lng, altitude: alt,
        timestamp: new Date(ts).toISOString(),
      } as any);
      error = fallback.error;
    }
    if (error) throw error;
  }
}

export async function syncOnce() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const items = await drainQueue();
    for (const item of items) {
      try {
        await pushOne(item);
        if (item.id != null) await removeQueueItem(item.id);
      } catch (e) {
        console.warn('Sync failed for item', item.kind, e);
        if (item.id != null) await bumpQueueAttempt(item.id);
      }
    }
  } finally {
    running = false;
  }
}

export function startSyncEngine() {
  if (timer) return;
  onlineHandler = () => {
    // Mobile browsers can emit `online` before the network path is usable.
    // Retry shortly after the event as well as immediately, without a reload.
    void syncOnce();
    window.setTimeout(() => void syncOnce(), 1500);
    window.setTimeout(() => void syncOnce(), 5000);
  };
  window.addEventListener('online', onlineHandler);
  window.addEventListener('pageshow', () => void syncOnce());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncOnce();
  });
  timer = setInterval(() => void syncOnce(), 60_000);
  void syncOnce();
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  if (onlineHandler) window.removeEventListener('online', onlineHandler);
  onlineHandler = null;
}
