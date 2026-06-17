/**
 * EletroGo Service Worker
 * Estratégia: Cache-First para assets estáticos, Network-First para dados dinâmicos
 * Versão: 1.0.0
 */

const CACHE_NAME = 'eletrogo-v1';
const RUNTIME_CACHE = 'eletrogo-runtime-v1';

// Assets que vão para cache imediatamente na instalação
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Domínios externos que usam Network-First (sem cache agressivo)
const NETWORK_FIRST_ORIGINS = [
  'supabase.co',
  'maps.googleapis.com',
  'maps.gstatic.com',
];

// ── Install: pré-cacheia assets essenciais ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: roteamento de cache ──────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Ignora extensões de browser e devtools
  if (url.protocol === 'chrome-extension:') return;

  // Network-First para APIs externas (Supabase, Google Maps)
  const isNetworkFirst = NETWORK_FIRST_ORIGINS.some(origin =>
    url.hostname.includes(origin)
  );
  if (isNetworkFirst) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Network-First para navegação HTML (sempre pega versão mais recente)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-First para CDN (React, Tailwind, Supabase SDK)
  if (url.hostname.includes('cdn.') || url.hostname.includes('cdnjs.') || url.hostname.includes('jsdelivr.')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache-First para assets locais estáticos
  event.respondWith(cacheFirst(request));
});

// ── Estratégia: Cache-First ─────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback
    return new Response('Sem conexão. Verifique sua internet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ── Estratégia: Network-First ───────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback para navegação offline → retorna index.html do cache
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }

    return new Response('Sem conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ── Push Notifications (futuro) ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'EletroGo', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: data.url || '/',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
