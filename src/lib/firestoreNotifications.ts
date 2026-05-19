import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

export type FsNotificationCategory = 'announcement' | 'booking' | 'system' | 'alert';

export type FsNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: FsNotificationCategory;
  link?: string | null;
  read: boolean;
  createdAt: string; // ISO
};

const COLLECTION = 'notifications';

type RawDoc = {
  userId: string;
  title: string;
  body: string;
  category?: FsNotificationCategory;
  link?: string | null;
  read?: boolean;
  createdAt?: Timestamp | null;
};

function toIso(ts?: Timestamp | null): string {
  return ts ? ts.toDate().toISOString() : new Date().toISOString();
}

/**
 * Subscribe to a user's notifications. Returns an unsubscribe function.
 * Safe no-op if Firebase isn't configured.
 */
export function subscribeUserNotifications(
  userId: string,
  cb: (items: FsNotification[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: FsNotification[] = snap.docs.map((d) => {
        const data = d.data() as RawDoc;
        return {
          id: d.id,
          userId: data.userId,
          title: data.title,
          body: data.body,
          category: data.category ?? 'system',
          link: data.link ?? null,
          read: Boolean(data.read),
          createdAt: toIso(data.createdAt ?? null),
        };
      });
      cb(items);
    },
    (err) => onError?.(err),
  );
}

/**
 * Create a notification for a user. Returns the new doc id, or null if Firebase
 * isn't configured.
 */
export async function notifyUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    category?: FsNotificationCategory;
    link?: string | null;
  },
): Promise<string | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  const ref = await addDoc(collection(db, COLLECTION), {
    userId,
    title: payload.title,
    body: payload.body,
    category: payload.category ?? 'system',
    link: payload.link ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function markFsNotificationRead(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await updateDoc(doc(db, COLLECTION, id), { read: true });
}

export async function deleteFsNotification(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION, id));
}
