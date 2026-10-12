import { supabase } from '@/integrations/supabase/client';

export type BackupRole = 'super_admin';

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
const restoreOrder = ['bookings', 'guides', 'booking_assignments', 'hiker_sessions', 'hiker_locations', 'announcements', 'daily_capacity'] as const;

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
  if (scopeRole !== 'super_admin') throw new Error('Only Central Admin can create operational backups.');
  const tables: Record<string, unknown[]> = {};
  for (const table of tableSpecs) {
    tables[table] = await fetchTable(table, normalizedLocationIds, false);
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
  if (scopeRole !== 'super_admin' || payload.scopeRole !== 'super_admin') {
    throw new Error('This backup belongs to a different operational role.');
  }
  const uploadedLocationIds = [...new Set(payload.locationIds ?? [])].sort();
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

type StoredBackupPayload = {
  format: BackupPayload['format'];
  version: BackupPayload['version'];
  exportedAt: string;
  scopeRole: BackupRole;
  locationIds: string[];
  encoding?: 'json' | 'gzip+base64';
  data?: string;
  tables?: Record<string, unknown[]>;
};

async function decodeStoredPayload(value: unknown): Promise<BackupPayload> {
  const stored = value as StoredBackupPayload | null;
  if (!stored || stored.format !== 'mt-kalisungan-operational-backup' || stored.version !== 1) {
    throw new Error('Stored backup format is not supported.');
  }
  if (stored.tables) return stored as unknown as BackupPayload;
  if (!stored.data) throw new Error('Stored backup has no data.');
  if (stored.encoding === 'json') return JSON.parse(stored.data) as BackupPayload;
  if (stored.encoding !== 'gzip+base64' || typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot restore the compressed backup.');
  }
  const binary = atob(stored.data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as BackupPayload;
}

export async function restoreLatestOperationalBackup() {
  const { data, error } = await supabase.from('backup_snapshots' as any)
    .select('payload')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Backup could not be loaded for restore: ${error.message}`);
  if (!data) throw new Error('No stored backup is available to restore.');
  const payload = await decodeStoredPayload((data as unknown as { payload: unknown }).payload);
  await restoreOperationalBackup(payload);
  return payload;
}

export async function restoreOperationalBackup(payload: BackupPayload) {
  if (payload?.format !== 'mt-kalisungan-operational-backup' || payload.version !== 1 || payload.scopeRole !== 'super_admin') {
    throw new Error('Only a valid Central Admin backup can be restored.');
  }
  for (const table of restoreOrder) {
    const rows = payload.tables[table] ?? [];
    if (!rows.length) continue;
    const { error } = await supabase.from(table as any).upsert(rows as any, { onConflict: 'id' });
    if (error) throw new Error(`Backup restore could not update ${table}: ${error.message}`);
  }
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
