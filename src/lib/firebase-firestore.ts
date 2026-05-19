import {
  collection,
  DocumentData,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export type FirebaseNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: 'announcement' | 'booking' | 'system';
  createdAt: string;
  href?: string;
};

const notificationFromDoc = (doc: DocumentData): FirebaseNotification => {
  const data = doc as Record<string, any>;
  const createdAt = data.createdAt;
  const createdAtIso = createdAt instanceof Timestamp
    ? createdAt.toDate().toISOString()
    : typeof createdAt === 'string'
      ? createdAt
      : new Date(createdAt?.toMillis?.() ?? Date.now()).toISOString();

  return {
    id: doc.id,
    userId: data.userId || '',
    title: String(data.title || 'Notification'),
    body: String(data.body || ''),
    category: data.category || 'system',
    createdAt: createdAtIso,
    href: typeof data.href === 'string' ? data.href : undefined,
  };
};

export function subscribeUserNotifications(
  userId: string,
  onUpdate: (items: FirebaseNotification[]) => void,
): () => void {
  if (!isFirebaseConfigured()) return () => undefined;
  const db = getFirebaseDb();
  if (!db) return () => undefined;

  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((doc) => notificationFromDoc({ ...doc.data(), id: doc.id }));
    onUpdate(items);
  }, (error) => {
    console.warn('[Firebase Firestore] Notification subscription failed:', error);
    onUpdate([]);
  });

  return unsubscribe;
}

export async function createUserNotification(
  userId: string,
  notification: Omit<FirebaseNotification, 'id' | 'userId' | 'createdAt'>,
): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const db = getFirebaseDb();
  if (!db) return null;

  const docRef = await addDoc(collection(db, 'notifications'), {
    userId,
    title: notification.title,
    body: notification.body,
    category: notification.category,
    href: notification.href ?? null,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
