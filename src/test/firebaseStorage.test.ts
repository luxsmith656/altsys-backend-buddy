import { describe, expect, it } from 'vitest';
import { validateImageFile } from '@/lib/firebase-storage';

describe('review image validation', () => {
  it('accepts browser-supported image MIME types, including less common formats', () => {
    expect(validateImageFile(new File(['image'], 'photo.avif', { type: 'image/avif' })).valid).toBe(true);
    expect(validateImageFile(new File(['image'], 'photo.heic', { type: 'image/heic' })).valid).toBe(true);
    expect(validateImageFile(new File(['image'], 'photo.svg', { type: 'image/svg+xml' })).valid).toBe(true);
  });

  it('accepts a known image extension when a mobile browser omits the MIME type', () => {
    expect(validateImageFile(new File(['image'], 'photo.webp')).valid).toBe(true);
  });

  it('rejects videos and documents before upload', () => {
    const video = validateImageFile(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    const document = validateImageFile(new File(['document'], 'notes.pdf', { type: 'application/pdf' }));

    expect(video.valid).toBe(false);
    expect(video.message).toContain('Videos');
    expect(document.valid).toBe(false);
  });

  it('rejects oversized source images before decoding', () => {
    const oversized = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(oversized).valid).toBe(false);
  });
});
