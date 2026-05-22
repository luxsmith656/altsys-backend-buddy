/** Offline tile cache for Leaflet (OpenStreetMap/OpenTopoMap). */
import L from 'leaflet';
import { getTile, putTile, tileCount } from '@/lib/offlineDb';

export const TILE_TEMPLATES = {
  street: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
};

function url(template: string, z: number, x: number, y: number) {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function lngLatToTile(lng: number, lat: number, z: number) {
  const x = Math.floor(((lng + 180) / 360) * 2 ** z);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z,
  );
  return { x, y };
}

export async function downloadArea(opts: {
  centerLat: number; centerLng: number;
  zMin: number; zMax: number;
  radiusTiles: number;
  template?: string;
  onProgress?: (done: number, total: number) => void;
}) {
  const tpl = opts.template ?? TILE_TEMPLATES.street;
  // Compute all tiles
  const jobs: { z: number; x: number; y: number }[] = [];
  for (let z = opts.zMin; z <= opts.zMax; z++) {
    const c = lngLatToTile(opts.centerLng, opts.centerLat, z);
    const r = Math.max(1, Math.floor(opts.radiusTiles * (z / opts.zMin)));
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      jobs.push({ z, x: c.x + dx, y: c.y + dy });
    }
  }
  let done = 0;
  const concurrency = 6;
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++];
      const key = `${j.z}/${j.x}/${j.y}`;
      try {
        const existing = await getTile(key);
        if (!existing) {
          const r = await fetch(url(tpl, j.z, j.x, j.y));
          if (r.ok) await putTile(key, await r.blob());
        }
      } catch { /* offline / failed; skip */ }
      done++;
      opts.onProgress?.(done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { downloaded: done, total: jobs.length };
}

export async function cachedTileCount(): Promise<number> {
  return tileCount();
}

/** Leaflet TileLayer that checks IndexedDB first, then network, write-through. */
export const OfflineTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('img');
    img.setAttribute('role', 'presentation');
    img.alt = '';
    const key = `${coords.z}/${coords.x}/${coords.y}`;
    const url = (this as any).getTileUrl(coords) as string;
    (async () => {
      try {
        const cached = await getTile(key);
        if (cached) {
          img.src = URL.createObjectURL(cached);
          done(undefined, img);
          return;
        }
      } catch { /* ignore */ }
      // Network fallback
      try {
        const r = await fetch(url);
        if (r.ok) {
          const blob = await r.blob();
          void putTile(key, blob);
          img.src = URL.createObjectURL(blob);
          done(undefined, img);
        } else {
          done(new Error(`tile ${key} ${r.status}`), img);
        }
      } catch (e) {
        done(e as Error, img);
      }
    })();
    return img;
  },
});
