import { supabase } from '@/integrations/supabase/client';

export type BackupRole = 'admin' | 'super_admin';

export type BackupPayload = {
  format: 'mt-kalisungan-operational-backup';
  version: 1;
  exportedAt: string;
  scopeRole: BackupRole;
  locationIds: string[];
  tables: Record<string, unknown[]>;
};

export type BackupSummary = {
  id: string;
  fingerprint: string;
  scope_role: BackupRole;
  location_ids: string[];
  created_at: string;
  updated_at: string;
};

const tableSpecs = [
  ['bookings', 'id,user_id,location_id,booking_date,start_time,hike_type,status,group_size,notes,contact_phone,contact_email,created_at'],
  ['booking_assignments', 'id,booking_id,guide_id,location_id,status,created_at,decided_at,reassignment_reason,replaced_by,replaces'],
  ['guides', 'id,user_id,location_id,full_name,phone,status,is_active,per_trip_fee,photo_url,referral_code,created_at'],
  ['hiker_sessions', 'id,user_id,booking_id,trail_zone_id,location_id,participant_role,tracking_phase,start_time,end_time,status,total_distance_km,encoded_path,last_synced_at,last_track_at'],
  ['hiker_locations', 'id,session_id,latitude,longitude,altitude,accuracy,speed_m_s,heading,segment,timestamp'],
  ['announcements', 'id,location_id,created_by,target,type,title,body,is_important,source,starts_at,expires_at,created_at'],
  ['daily_capacity', '*'],
] as const;

function sortRows(rows: unknown[]) {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function fingerprint(payload: Omit<BackupPayload, 'exportedAt'> & { exportedAt?: string }) {
  const body = JSON.stringify({ ...payload, exportedAt: undefined });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function fetchTable(table: string, select: string, locationIds: string[], filterByLocation: boolean) {
  let query = supabase.from(table as any).select(select);
  if (filterByLocation && locationIds.length) query = query.in('location_id', locationIds) as any;
  const { data, error } = await query;
  if (error) throw new Error(`Backup could not read ${table}: ${error.message}`);
  return sortRows((data ?? []) as unknown[]);
}

export async function createOperationalBackup(scopeRole: BackupRole, locationIds: string[]) {
  const normalizedLocationIds = [...new Set(locationIds)].sort();
  const filterByLocation = scopeRole === 'admin';
  if (filterByLocation && normalizedLocationIds.length === 0) {
    throw new Error('No assigned trailhead is available for this local-admin backup.');
  }
  const tables: Record<string, unknown[]> = {};
  for (const [table, select] of tableSpecs) {
    tables[table] = await fetchTable(table, select, normalizedLocationIds, filterByLocation && table !== 'hiker_locations');
  }

  // Location-scoped tables are filtered through their parent sessions/bookings.
  if (filterByLocation) {
    const bookingIds = new Set((tables.bookings as Array<{ id?: string }>).map((row) => row.id).filter(Boolean));
    const sessionIds = new Set((tables.hiker_sessions as Array<{ id?: string }>).map((row) => row.id).filter(Boolean));
    tables.booking_assignments = tables.booking_assignments.filter((row) => bookingIds.has((row as { booking_id?: string }).booking_id));
    tables.hiker_sessions = tables.hiker_sessions.filter((row) => bookingIds.has((row as { booking_id?: string }).booking_id) || normalizedLocationIds.includes(String((row as { location_id?: string }).location_id ?? '')));
    tables.hiker_locations = tables.hiker_locations.filter((row) => sessionIds.has((row as { session_id?: string }).session_id));
    tables.announcements = tables.announcements.filter((row) => {
      const locationId = (row as { location_id?: string | null }).location_id;
      return locationId == null || normalizedLocationIds.includes(locationId);
    });
  }

  const payload: BackupPayload = {
    format: 'mt-kalisungan-operational-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    scopeRole,
    locationIds: normalizedLocationIds,
    tables,
  };
  const digest = await fingerprint(payload);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('You must be signed in to save a backup.');
  const { error } = await supabase.from('backup_snapshots' as any).upsert({
    owner_id: userData.user.id,
    scope_role: scopeRole,
    location_ids: normalizedLocationIds,
    fingerprint: digest,
    payload,
  }, { onConflict: 'owner_id,fingerprint' });
  if (error) throw new Error(`Backup could not be saved: ${error.message}`);
  return { payload, fingerprint: digest };
}

export async function listOperationalBackups() {
  const { data, error } = await supabase.from('backup_snapshots' as any)
    .select('id,fingerprint,scope_role,location_ids,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Backups could not be loaded: ${error.message}`);
  return (data ?? []) as unknown as BackupSummary[];
}

export async function saveUploadedBackup(payload: BackupPayload, scopeRole: BackupRole, allowedLocationIds: string[]) {
  if (payload?.format !== 'mt-kalisungan-operational-backup' || payload.version !== 1 || !payload.tables) {
    throw new Error('This is not a supported Mt. Kalisungan backup file.');
  }
  if (payload.scopeRole !== scopeRole) {
    throw new Error('This backup belongs to a different operational role.');
  }
  const uploadedLocationIds = [...new Set(payload.locationIds ?? [])].sort();
  const allowed = new Set(allowedLocationIds);
  if (scopeRole === 'admin' && (uploadedLocationIds.length === 0 || uploadedLocationIds.some((id) => !allowed.has(id)))) {
    throw new Error('This backup is outside the local admin trailhead scope.');
  }
  const digest = await fingerprint(payload);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('You must be signed in to upload a backup.');
  const { error } = await supabase.from('backup_snapshots' as any).upsert({
    owner_id: userData.user.id,
    scope_role: payload.scopeRole,
    location_ids: uploadedLocationIds,
    fingerprint: digest,
    payload,
  }, { onConflict: 'owner_id,fingerprint' });
  if (error) throw new Error(`Backup could not be uploaded: ${error.message}`);
  return digest;
}

export function downloadBackup(payload: BackupPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mt-kalisungan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
