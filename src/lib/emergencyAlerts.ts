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
};

export async function createEmergencyAlert(input: EmergencyAlertInput) {
  const { data, error } = await supabase
    .from('emergency_alerts' as any)
    .insert({
      user_id: input.userId,
      reporter_role: input.reporterRole || 'hiker',
      booking_id: input.bookingId || null,
      session_id: input.sessionId || null,
      location_id: input.locationId || null,
      latitude: Number.isFinite(input.latitude) ? input.latitude : null,
      longitude: Number.isFinite(input.longitude) ? input.longitude : null,
      message: input.message?.trim() || 'Emergency assistance requested',
      status: 'open',
    })
    .select('id,created_at')
    .single();

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
    link: '/admin?tab=live-map',
  }).catch(() => null)));

  return data as unknown as { id: string; created_at: string };
}

export async function loadEmergencyAlerts(locationId?: string | null) {
  let query = supabase.from('emergency_alerts' as any)
    .select('id,booking_id,session_id,user_id,reporter_role,location_id,latitude,longitude,message,status,created_at,acknowledged_at')
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(25);
  if (locationId) query = query.eq('location_id', locationId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]) || [];
}
