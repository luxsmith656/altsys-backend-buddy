import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from './firebase';

export type FirebaseSession = {
  id: string;
  userId: string;
  locationId?: string | null;
  status: string;
  startTime: string;
  updatedAt?: string;
};

const parseSession = (doc: any): FirebaseSession => {
  const data = doc as Record<string, any>;
  const startTime = data.startTime instanceof Timestamp
    ? data.startTime.toDate().toISOString()
    : typeof data.startTime === 'string'
      ? data.startTime
      : new Date(data.startTime?.toMillis?.() ?? Date.now()).toISOString();
  const updatedAt = data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate().toISOString()
    : typeof data.updatedAt === 'string'
      ? data.updatedAt
      : undefined;

  return {
    id: doc.id,
    userId: data.userId || '',
    locationId: data.locationId ?? null,
    status: String(data.status || 'active'),
    startTime,
    updatedAt,
  };
};

export function subscribeActiveHikerSession(
  userId: string,
  onUpdate: (session: FirebaseSession | null) => void,
): () => void {
  if (!isFirebaseConfigured()) return () => undefined;
  const db = getFirebaseDb();
  if (!db) return () => undefined;

  const q = query(
    collection(db, 'hiker_sessions'),
    where('userId', '==', userId),
    where('status', '==', 'active'),
    orderBy('startTime', 'desc'),
    limit(1),
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    if (snapshot.docs.length === 0) {
      onUpdate(null);
      return;
    }
    onUpdate(parseSession({ ...snapshot.docs[0].data(), id: snapshot.docs[0].id }));
  }, (error) => {
    console.warn('[Firebase Firestore] Session subscription failed:', error);
    onUpdate(null);
  });

  return unsubscribe;
}
