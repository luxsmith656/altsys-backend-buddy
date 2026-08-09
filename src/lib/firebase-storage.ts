/**
 * Firebase Storage for payment screenshots.
 * 
 * Add these env vars to your .env:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_FIREBASE_PROJECT_ID=...
 *   VITE_FIREBASE_STORAGE_BUCKET=...
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 */

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
export { isFirebaseConfigured } from './firebase';

let storage: ReturnType<typeof getStorage> | null = null;

function getFirebaseStorage() {
  const app = getFirebaseApp();
  if (!app) {
    return null; // Firebase not configured yet
  }
  if (storage) return storage;
  storage = getStorage(app);
  return storage;
}

/**
 * Compress an image file using canvas to reduce storage costs.
 * Target: ≤ 80% quality JPEG, max 1200px width.
 */
export async function compressImage(file: File, maxWidthPx = 1200, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidthPx / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

/**
 * Upload a payment screenshot to Firebase Storage.
 * Returns the download URL or null if Firebase is not configured.
 */
export async function uploadPaymentScreenshot(
  file: File,
  bookingId: string,
): Promise<{ url: string; path: string } | null> {
  const store = getFirebaseStorage();
  if (!store) {
    console.warn('[Firebase] Storage not configured. Add VITE_FIREBASE_* env vars.');
    return null;
  }

  try {
    // Compress before upload
    const compressed = await compressImage(file);
    const ext = 'jpg'; // always JPEG after compression
    const path = `payment-screenshots/${bookingId}_${Date.now()}.${ext}`;
    const storageRef = ref(store, path);

    await uploadBytes(storageRef, compressed, {
      contentType: 'image/jpeg',
      customMetadata: { bookingId, originalName: file.name },
    });

    const url = await getDownloadURL(storageRef);
    return { url, path };
  } catch (err) {
    console.error('[Firebase] Upload error:', err);
    throw err;
  }
}

/** Upload a compact guide profile image for the public guide card. */
export async function uploadGuideProfilePhoto(
  file: File,
  guideId: string,
): Promise<{ url: string; path: string } | null> {
  const store = getFirebaseStorage();
  if (!store) return null;
  const compressed = await compressImage(file, 900, 0.8);
  const path = `guide-profiles/${guideId}_${Date.now()}.jpg`;
  const storageRef = ref(store, path);
  await uploadBytes(storageRef, compressed, {
    contentType: 'image/jpeg',
    customMetadata: { guideId, originalName: file.name },
  });
  return { url: await getDownloadURL(storageRef), path };
}

/**
 * Delete a payment screenshot from Firebase Storage by its path.
 */
export async function deletePaymentScreenshot(path: string): Promise<void> {
  const store = getFirebaseStorage();
  if (!store) return;
  try {
    await deleteObject(ref(store, path));
  } catch (err) {
    console.error('[Firebase] Delete error:', err);
  }
}

