// Only content-versioned WebP thumbnails enter persistent storage.
const CACHE = 'nogifura-thumbnails-v1';
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ENTRIES = 800;
const indexUrl = new URL('__thumbnail_cache_index__', self.registration.scope).href;
let writes = Promise.resolve();
const pending = new Map();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function store(url, response) {
  writes = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(indexUrl);
    let entries = saved ? await saved.json() : [];
    const bytes = (await response.clone().arrayBuffer()).byteLength;
    if (bytes > MAX_BYTES) return;
    entries = entries.filter(entry => entry.url !== url);
    entries.push({url, bytes});
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    while (entries.length > MAX_ENTRIES || total > MAX_BYTES) {
      const oldest = entries.shift();
      total -= oldest.bytes;
      await cache.delete(oldest.url);
    }
    await cache.put(url, response);
    try {
      await cache.put(indexUrl, new Response(JSON.stringify(entries), {headers: {'Content-Type': 'application/json'}}));
    } catch (error) {
      await cache.delete(url); // Avoid uncounted entries if the index exceeds storage quota.
      throw error;
    }
  }).catch(() => {});
  return writes;
}
async function thumbnail(request) {
  try {
    const cached = await (await caches.open(CACHE)).match(request);
    if (cached) return cached;
  } catch (_) {}
  if (!pending.has(request.url)) {
    const task = fetch(request).then(async response => {
      if (response.ok && response.type !== 'opaque') await store(request.url, response.clone());
      return response;
    }).finally(() => pending.delete(request.url));
    pending.set(request.url, task);
  }
  return (await pending.get(request.url)).clone();
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL('assets/webthumbs/', self.registration.scope).pathname) ||
      !url.pathname.endsWith('.webp')) return;
  const response = thumbnail(event.request);
  event.respondWith(response);
  event.waitUntil(response.then(() => writes).catch(() => {}));
});
