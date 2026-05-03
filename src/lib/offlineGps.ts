/**
 * Offline-first GPS storage queue.
 *
 * Strategy:
 *  - Primary: IndexedDB (works in browser + Capacitor WebView).
 *  - If running inside Capacitor and `@capacitor-community/sqlite` is
 *    installed, transparently use SQLite for durability.
 *  - On online + auth, flush queued points to Supabase `hiker_locations`.
 *
 * Each queued row carries (session_id, lat, lng, alt, accuracy, speed,
 * heading, timestamp, client_id). client_id de-dupes if a flush retries.
 */

import { supabase } from '@/integrations/supabase/client';

export interface QueuedPoint {
  client_id: string;          // uuid generated client-side
  session_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;          // ISO
}

const DB_NAME = 'mtkalisungan-gps';
const STORE = 'queue';
const SENT_STORE = 'sent';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_id' });
      }
      if (!db.objectStoreNames.contains(SENT_STORE)) {
        db.createObjectStore(SENT_STORE, { keyPath: 'client_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

/* ───── Capacitor SQLite (optional, dynamic) ───── */
let sqliteReady: Promise<any> | null = null;
async function getSqlite(): Promise<any | null> {
  if (typeof (window as any).Capacitor === 'undefined') return null;
  if (!(window as any).Capacitor?.isNativePlatform?.()) return null;
  try {
    if (!sqliteReady) {
      sqliteReady = import(/* @vite-ignore */ '@capacitor-community/sqlite')
        .then(async (mod: any) => {
          const sqlite = new mod.SQLiteConnection(mod.CapacitorSQLite);
          const db = await sqlite.createConnection('mtk_gps', false, 'no-encryption', 1, false);
          await db.open();
          await db.execute(`CREATE TABLE IF NOT EXISTS queue (
            client_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            altitude REAL,
            accuracy REAL,
            speed REAL,
            heading REAL,
            timestamp TEXT NOT NULL
          );`);
          return db;
        })
        .catch(() => null);
    }
    return await sqliteReady;
  } catch {
    return null;
  }
}

/* ───── public API ───── */

export async function enqueuePoint(p: Omit<QueuedPoint, 'client_id'>): Promise<void> {
  const row: QueuedPoint = { ...p, client_id: uuid() };

  // Try SQLite first if available
  const sqliteDb = await getSqlite();
  if (sqliteDb) {
    try {
      await sqliteDb.run(
        `INSERT OR REPLACE INTO queue VALUES (?,?,?,?,?,?,?,?,?)`,
        [row.client_id, row.session_id, row.latitude, row.longitude, row.altitude,
          row.accuracy, row.speed, row.heading, row.timestamp],
      );
      return;
    } catch (e) {
      console.warn('[gps] sqlite enqueue failed, fallback to IDB', e);
    }
  }

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueSize(): Promise<number> {
  const sqliteDb = await getSqlite();
  if (sqliteDb) {
    try {
      const r = await sqliteDb.query('SELECT COUNT(*) as c FROM queue');
      return r.values?.[0]?.c ?? 0;
    } catch { /* fall through */ }
  }
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(0);
  });
}

async function readBatch(limit = 100): Promise<QueuedPoint[]> {
  const sqliteDb = await getSqlite();
  if (sqliteDb) {
    try {
      const r = await sqliteDb.query(`SELECT * FROM queue ORDER BY timestamp ASC LIMIT ${limit}`);
      return (r.values ?? []) as QueuedPoint[];
    } catch { /* fall through */ }
  }
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll(undefined, limit);
    req.onsuccess = () => resolve((req.result as QueuedPoint[]) ?? []);
    req.onerror = () => resolve([]);
  });
}

async function deleteIds(ids: string[]) {
  if (ids.length === 0) return;
  const sqliteDb = await getSqlite();
  if (sqliteDb) {
    try {
      await sqliteDb.run(
        `DELETE FROM queue WHERE client_id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      return;
    } catch { /* fall through */ }
  }
  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

let flushing = false;

/**
 * Push queued points to Supabase. Safe to call repeatedly.
 * Returns number of points sent.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  flushing = true;
  let totalSent = 0;
  try {
    while (true) {
      const batch = await readBatch(80);
      if (batch.length === 0) break;

      const rows = batch.map((b) => ({
        session_id: b.session_id,
        latitude: b.latitude,
        longitude: b.longitude,
        altitude: b.altitude ?? 0,
        timestamp: b.timestamp,
      }));

      const { error } = await supabase
        .from('hiker_locations' as any)
        .insert(rows as any);

      if (error) {
        console.warn('[gps] flush failed', error.message);
        break;
      }
      await deleteIds(batch.map((b) => b.client_id));
      totalSent += batch.length;
      if (batch.length < 80) break;
    }
  } finally {
    flushing = false;
  }
  return totalSent;
}

/** Auto-flush whenever the browser comes back online. */
let listenerAttached = false;
export function attachAutoFlush() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('online', () => { void flushQueue(); });
  // periodic (every 30s) in case "online" event missed
  setInterval(() => { void flushQueue(); }, 30000);
}
