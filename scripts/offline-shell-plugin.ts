import type { Plugin } from 'vite';

export function offlineShellPlugin(): Plugin {
  return {
    name: 'offline-app-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `/${name}`);
      const version = assets.join('|').split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'mtk-shell-${version}';
const ASSETS = ${JSON.stringify(['/index.html', ...assets])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mtk-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname, { ignoreVary: true })) || fetch(request)));
  }
});` });
    },
  };
}
