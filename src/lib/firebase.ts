import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

// Firebase web config is public by design; env vars override these defaults.
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || 'AIzaSyB-3Ed1WSh9DCnjP2UhoWmZSjlKYPD4ZZw',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || 'altsys-backend-buddy.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'altsys-backend-buddy',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || 'altsys-backend-buddy.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '606679403261',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || '1:606679403261:web:c44fccbbddff4fcdce8c94',
};

export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

export function getFirebaseStorageClient(): FirebaseStorage | null {
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}
