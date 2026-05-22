import { openDB, type IDBPDatabase } from 'idb';

export interface OfflineSession {
  id: string;                 // client UUID
  bookingId?: string | null;
  userId: string;
  startedAt: number;
  endedAt?: number | null;
  status: 'active' | 'paused' | 'completed' | 'synced';
  // Stats
  distanceM: number;
  movingSec: number;
  restingSec: number;
  ascentM: number;
  descentM: number;
  ascentSec: number;
  descentSec: number;
  summitReached: boolean;
  encodedPath: string;        // Google polyline of simplified track
  lastSyncedAt?: number | null;
  trailZoneId?: string | null;
}

export interface OfflinePoint {
  id?: number;
  sessionId: string;
  lat: number;
  lng: number;
  alt: number;
  accuracy: number;
  speed: number;
  ts: number;
  segment: 'ascent' | 'descent' | 'flat';
}

export interface TileRecord {
  key: string;   // `${z}/${x}/${y}`
  blob: Blob;
  cachedAt: number;
}

export interface QueueItem {
  id?: number;
  kind: 'session' | 'points' | 'ping';
  payload: any;
  createdAt: number;
  attempts: number;
}

const DB_NAME = 'mtk-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('points')) {
          const s = db.createObjectStore('points', { keyPath: 'id', autoIncrement: true });
          s.createIndex('by_session', 'sessionId');
        }
        if (!db.objectStoreNames.contains('tiles')) {
          db.createObjectStore('tiles', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSession(s: OfflineSession) {
  const db = await getDb();
  await db.put('sessions', s);
}

export async function getSession(id: string): Promise<OfflineSession | undefined> {
  const db = await getDb();
  return db.get('sessions', id);
}

export async function listSessions(userId: string): Promise<OfflineSession[]> {
  const db = await getDb();
  const all = (await db.getAll('sessions')) as OfflineSession[];
  return all.filter((s) => s.userId === userId).sort((a, b) => b.startedAt - a.startedAt);
}

export async function appendPoint(p: OfflinePoint) {
  const db = await getDb();
  await db.add('points', p);
}

export async function getSessionPoints(sessionId: string): Promise<OfflinePoint[]> {
  const db = await getDb();
  const idx = db.transaction('points').store.index('by_session');
  const items: OfflinePoint[] = [];
  for await (const cur of idx.iterate(sessionId)) items.push(cur.value as OfflinePoint);
  return items.sort((a, b) => a.ts - b.ts);
}

export async function getTile(key: string): Promise<Blob | null> {
  const db = await getDb();
  const r = (await db.get('tiles', key)) as TileRecord | undefined;
  return r?.blob ?? null;
}

export async function putTile(key: string, blob: Blob) {
  const db = await getDb();
  await db.put('tiles', { key, blob, cachedAt: Date.now() } as TileRecord);
}

export async function tileCount(): Promise<number> {
  const db = await getDb();
  return db.count('tiles');
}

export async function enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts'>) {
  const db = await getDb();
  await db.add('queue', { ...item, createdAt: Date.now(), attempts: 0 });
}

export async function drainQueue(): Promise<QueueItem[]> {
  const db = await getDb();
  return (await db.getAll('queue')) as QueueItem[];
}

export async function removeQueueItem(id: number) {
  const db = await getDb();
  await db.delete('queue', id);
}

export async function bumpQueueAttempt(id: number) {
  const db = await getDb();
  const it = (await db.get('queue', id)) as QueueItem | undefined;
  if (it) { it.attempts += 1; await db.put('queue', it); }
}
