export interface GuideDirectoryEntry {
  name: string;
  photoUrl: string;
  emailSlug: string;
}

const guideImages = import.meta.glob('/src/assets/MtKaliGuides/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const toName = (path: string) => decodeURIComponent(path.split('/').pop() ?? '').replace(/\.(png|jpe?g|webp)$/i, '').trim();
const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

export const GUIDE_DIRECTORY: GuideDirectoryEntry[] = Object.entries(guideImages)
  .map(([path, photoUrl]) => {
    const name = toName(path);
    return { name, photoUrl, emailSlug: toSlug(name) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function guidePhotoForName(name?: string | null, storedPhotoUrl?: string | null): string | null {
  if (storedPhotoUrl && /^(https?:|data:|blob:|\/)/i.test(storedPhotoUrl)) return storedPhotoUrl;
  const match = GUIDE_DIRECTORY.find((guide) => guide.name.toLowerCase() === String(name ?? '').trim().toLowerCase());
  return match?.photoUrl ?? null;
}

export function guideDirectoryEntry(name?: string | null): GuideDirectoryEntry | null {
  return GUIDE_DIRECTORY.find((guide) => guide.name.toLowerCase() === String(name ?? '').trim().toLowerCase()) ?? null;
}
