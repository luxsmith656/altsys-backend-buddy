/** Drains the offline queue and uploads sessions / points to Supabase when online. */
import { supabase } from '@/integrations/supabase/client';
import { drainQueue, removeQueueItem, bumpQueueAttempt } from '@/lib/offlineDb';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pushOne(item: any) {
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

    const { error } = s.serverSessionId
      ? await supabase.from('hiker_sessions').update(row).eq('id', s.serverSessionId)
      : await supabase.from('hiker_sessions').upsert(row, { onConflict: 'client_session_id' });
    if (error) throw error;
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
      const { error } = await supabase.from('hiker_locations').insert(rows.slice(i, i + 500));
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
    if (!realSessionId) return; // Skip silently
    await supabase.from('hiker_locations').insert({
      session_id: realSessionId, latitude: lat, longitude: lng, altitude: alt,
      accuracy: accuracy ?? null,
      speed_m_s: speed ?? null,
      heading: heading ?? null,
      segment: segment ?? null,
      timestamp: new Date(ts).toISOString(),
    });
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
        if ((item.attempts ?? 0) >= 8 && item.id != null) await removeQueueItem(item.id);
      }
    }
  } finally {
    running = false;
  }
}

export function startSyncEngine() {
  if (timer) return;
  window.addEventListener('online', () => void syncOnce());
  timer = setInterval(() => void syncOnce(), 60_000);
  void syncOnce();
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer);
  timer = null;
}
