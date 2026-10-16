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
import { supabase } from '@/integrations/supabase/client';
export { isFirebaseConfigured } from './firebase';

let storage: ReturnType<typeof getStorage> | null = null;

const MAX_REVIEW_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;

export type ImageValidationResult = {
  valid: boolean;
  message?: string;
};

/**
 * Validate the input before decoding it. `accept="image/*"` is only a browser
 * hint, so this check also protects the upload path from videos and documents.
 * MIME-less files from some mobile browsers are accepted when their extension
 * is a known image type; the decoder remains the final validity check.
 */
export function validateImageFile(file: File | null | undefined): ImageValidationResult {
  if (!file) {
    return { valid: false, message: 'Please choose an image.' };
  }

  const hasImageMime = file.type.toLowerCase().startsWith('image/');
  const hasImageExtension = !file.type && IMAGE_EXTENSION_PATTERN.test(file.name);
  if (!hasImageMime && !hasImageExtension) {
    return { valid: false, message: 'Please choose an image file. Videos and documents are not accepted.' };
  }

  if (file.size > MAX_REVIEW_IMAGE_BYTES) {
    return { valid: false, message: 'That image is larger than 25 MB. Please choose a smaller image.' };
  }

  return { valid: true };
}

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
 * The browser may provide any supported image format; all successful uploads
 * are normalized to a broadly displayable JPEG with a bounded dimension.
 */
export async function compressImage(
  file: File,
  maxWidthPx = 1200,
  quality = 0.75,
  targetBytes = MAX_COMPRESSED_IMAGE_BYTES,
): Promise<Blob> {
  const validation = validateImageFile(file);
  if (!validation.valid) throw new Error(validation.message || 'Invalid image file.');

  let source: CanvasImageSource;
  let closeSource: (() => void) | undefined;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bitmap;
      closeSource = () => bitmap.close();
    } catch {
      source = await loadImageElement(file);
    }
  } else {
    source = await loadImageElement(file);
  }

  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) {
    closeSource?.();
    throw new Error('This image format could not be decoded by the browser.');
  }

  const scale = Math.min(1, maxWidthPx / sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    closeSource?.();
    throw new Error('Canvas context unavailable.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  closeSource?.();

  const encode = (jpegQuality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Image compression failed.')),
      'image/jpeg',
      Math.min(1, Math.max(0.1, jpegQuality)),
    );
  });

  // Keep review uploads small enough to send quickly on mountain/mobile
  // connections. Re-encode only when needed so normal photos take one pass.
  let compressed = await encode(quality);
  for (let attempt = 1; attempt < 4 && compressed.size > targetBytes; attempt += 1) {
    compressed = await encode(Math.max(0.42, quality - attempt * 0.1));
  }
  return compressed;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    img.decoding = 'async';
    img.onload = () => { cleanup(); resolve(img); };
    img.onerror = () => { cleanup(); reject(new Error('This image format could not be decoded by the browser.')); };
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
 * Upload a compressed post-hike trail photo to Supabase Storage.
 * Keeping this asset beside the review database avoids Firebase bucket/CORS
 * failures on the public Vercel origin. The binary is still stored outside
 * the database; only its public URL is saved on the review row.
 */
export async function uploadTrailReviewPhoto(
  file: File,
  bookingId: string,
): Promise<{ url: string; path: string } | null> {
  const compressed = await compressImage(file, 960, 0.7, 1.5 * 1024 * 1024);
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${bookingId}/${id}.jpg`;
  const { data, error } = await supabase.storage.from('trail-reviews').upload(path, compressed, {
    cacheControl: '31536000',
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data: publicUrl } = supabase.storage.from('trail-reviews').getPublicUrl(data.path);
  if (!publicUrl.publicUrl) throw new Error('Trail photo URL could not be created.');
  return { url: publicUrl.publicUrl, path: data.path };
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

