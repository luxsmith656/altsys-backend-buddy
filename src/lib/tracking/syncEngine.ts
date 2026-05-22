/** Drains the offline queue and uploads sessions / points to Supabase when online. */
import { supabase } from '@/integrations/supabase/client';
import { drainQueue, removeQueueItem, bumpQueueAttempt } from '@/lib/offlineDb';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pushOne(item: any) {
  if (item.kind === 'session') {
    const s = item.payload;
    const { error } = await supabase.from('hiker_sessions').upsert({
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
    } as any, { onConflict: 'client_session_id' });
    if (error) throw error;
    return;
  }

  if (item.kind === 'points') {
    const { sessionId, points } = item.payload;
    // Resolve real session id
    const { data: sess } = await supabase
      .from('hiker_sessions')
      .select('id')
      .eq('client_session_id', sessionId)
      .maybeSingle();
    if (!sess?.id) throw new Error('Session not found for points upload');
    const rows = (points as any[]).map((p) => ({
      session_id: sess.id, latitude: p.lat, longitude: p.lng, altitude: p.alt,
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
    const { sessionId, lat, lng, alt, ts } = item.payload;
    const { data: sess } = await supabase
      .from('hiker_sessions').select('id').eq('client_session_id', sessionId).maybeSingle();
    if (!sess?.id) return; // Skip silently
    await supabase.from('hiker_locations').insert({
      session_id: sess.id, latitude: lat, longitude: lng, altitude: alt,
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
