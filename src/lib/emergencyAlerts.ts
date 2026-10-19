import { supabase } from '@/integrations/supabase/client';
import { notifyUser } from '@/lib/firestoreNotifications';

export type EmergencyAlertInput = {
  userId: string;
  reporterRole?: string | null;
  bookingId?: string | null;
  sessionId?: string | null;
  locationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  message?: string;
  clientAlertId?: string | null;
};

export async function createEmergencyAlert(input: EmergencyAlertInput) {
  const payload = {
    user_id: input.userId,
    reporter_role: input.reporterRole || 'hiker',
    booking_id: input.bookingId || null,
    session_id: input.sessionId || null,
    location_id: input.locationId || null,
    latitude: Number.isFinite(input.latitude) ? input.latitude : null,
    longitude: Number.isFinite(input.longitude) ? input.longitude : null,
    pushed_latitude: Number.isFinite(input.latitude) ? input.latitude : null,
    pushed_longitude: Number.isFinite(input.longitude) ? input.longitude : null,
    last_location_at: new Date().toISOString(),
    message: input.message?.trim() || 'Emergency assistance requested',
    status: 'open',
    ...(input.clientAlertId ? { client_alert_id: input.clientAlertId } : {}),
  };
  let { data, error } = await supabase
    .from('emergency_alerts' as any)
    .insert(payload)
    .select('id,created_at')
    .single();

  // Older deployments may not have the client id column yet. Preserve SOS
  // delivery while the migration is being applied.
  if (error && input.clientAlertId && String(error.message).toLowerCase().includes('schema cache')) {
    const {
      client_alert_id: _clientAlertId,
      pushed_latitude: _pushedLatitude,
      pushed_longitude: _pushedLongitude,
      last_location_at: _lastLocationAt,
      ...legacyPayload
    } = payload;
    const fallback = await supabase.from('emergency_alerts' as any).insert(legacyPayload)
      .select('id,created_at').single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(`Emergency alert could not be saved: ${error.message}`);

  // Firebase notifications are best-effort; the durable Supabase row is the
  // source of truth that the admin map can acknowledge and resolve.
  const [roleResult, scopedResult] = await Promise.all([
    supabase.from('user_roles').select('user_id,role').in('role', ['super_admin', 'mdrrmo']),
    input.locationId
      ? supabase.from('user_locations').select('user_id').eq('location_id', input.locationId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const recipients = new Set<string>();
  ((roleResult.data as any[]) || []).forEach((row) => recipients.add(row.user_id));
  const scopedAdminIds = ((scopedResult.data as any[]) || []).map((row) => row.user_id).filter(Boolean);
  if (scopedAdminIds.length) {
    const { data: scopedRoles } = await supabase.from('user_roles').select('user_id,role')
      .in('user_id', scopedAdminIds).in('role', ['admin', 'ranger', 'super_admin', 'mdrrmo']);
    ((scopedRoles as any[]) || []).forEach((row) => recipients.add(row.user_id));
  }
  await Promise.all([...recipients].filter((id) => id !== input.userId).map((id) => notifyUser(id, {
    title: 'Emergency SOS alert',
    body: `${input.reporterRole === 'guide' ? 'A guide' : 'A hiker'} requested emergency assistance${input.locationId ? ' at the assigned trailhead' : ''}. Open the live map now.`,
    category: 'alert',
    link: input.bookingId ? `/admin?tab=operations&bookingId=${input.bookingId}` : '/admin?tab=live-map',
    bookingId: input.bookingId,
  }).catch(() => null)));

  return data as unknown as { id: string; created_at: string };
}

export async function updateEmergencyAlertLocation(alertId: string, coords: { latitude: number; longitude: number }) {
  const { error } = await supabase.rpc('update_own_emergency_alert_location' as any, {
    p_alert_id: alertId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
  });
  if (error) throw error;
}

export async function cancelEmergencyAlert(alertId: string) {
  const { error } = await supabase.rpc('cancel_own_emergency_alert' as any, { p_alert_id: alertId });
  if (!error) return;
  // Keep cancellation usable while a project has an older function cache. The
  // migration also grants reporters a status-only update policy.
  const fallback = await supabase.from('emergency_alerts' as any)
    .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .in('status', ['open', 'acknowledged'])
    .select('id')
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw error;
}

export async function loadEmergencyAlerts(locationId?: string | null) {
  let query = supabase.from('emergency_alerts' as any)
    .select('id,booking_id,session_id,user_id,reporter_role,location_id,latitude,longitude,pushed_latitude,pushed_longitude,last_location_at,message,status,created_at,acknowledged_at')
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(25);
  if (locationId) query = query.eq('location_id', locationId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]) || [];
}
