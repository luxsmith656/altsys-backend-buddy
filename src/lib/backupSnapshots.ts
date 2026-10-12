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

const tableSpecs = ['bookings', 'booking_assignments', 'guides', 'hiker_sessions', 'hiker_locations', 'announcements', 'daily_capacity'] as const;

function sortRows(rows: unknown[]) {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function fingerprint(payload: Omit<BackupPayload, 'exportedAt'> & { exportedAt?: string }) {
  const body = JSON.stringify({ ...payload, exportedAt: undefined });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function fetchTable(table: string, locationIds: string[], filterByLocation: boolean) {
  // Use '*' because deployed projects can have different optional columns.
  // Scope is applied after reading, avoiding a failed query when one column is absent.
  const query = supabase.from(table as any).select('*');
  const { data, error } = await query;
  if (error) throw new Error(`Backup could not read ${table}: ${error.message}`);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return sortRows(filterByLocation && locationIds.length
    ? rows.filter((row) => locationIds.includes(String(row.location_id ?? '')))
    : rows);
}

async function compressForStorage(payload: BackupPayload) {
  const text = JSON.stringify(payload);
  if (typeof CompressionStream === 'undefined') return { encoding: 'json' as const, data: text };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { encoding: 'gzip+base64' as const, data: btoa(binary) };
}

function storedPayload(payload: BackupPayload, compressed: { encoding: 'json' | 'gzip+base64'; data: string }) {
  return {
    format: payload.format,
    version: payload.version,
    exportedAt: payload.exportedAt,
    scopeRole: payload.scopeRole,
    locationIds: payload.locationIds,
    encoding: compressed.encoding,
    data: compressed.data,
  };
}

export async function createOperationalBackup(scopeRole: BackupRole, locationIds: string[]) {
  const normalizedLocationIds = [...new Set(locationIds)].sort();
  const filterByLocation = scopeRole === 'admin';
  if (filterByLocation && normalizedLocationIds.length === 0) {
    throw new Error('No assigned trailhead is available for this local-admin backup.');
  }
  const tables: Record<string, unknown[]> = {};
  for (const table of tableSpecs) {
    tables[table] = await fetchTable(table, normalizedLocationIds, filterByLocation && table !== 'hiker_locations');
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
  const compressed = await compressForStorage(payload);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('You must be signed in to save a backup.');
  const { error } = await supabase.from('backup_snapshots' as any).upsert({
    owner_id: userData.user.id,
    scope_role: scopeRole,
    location_ids: normalizedLocationIds,
    fingerprint: digest,
    payload: storedPayload(payload, compressed),
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
  const compressed = await compressForStorage(payload);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('You must be signed in to upload a backup.');
  const { error } = await supabase.from('backup_snapshots' as any).upsert({
    owner_id: userData.user.id,
    scope_role: payload.scopeRole,
    location_ids: uploadedLocationIds,
    fingerprint: digest,
    payload: storedPayload(payload, compressed),
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
