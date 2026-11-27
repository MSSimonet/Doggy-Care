// Service worker mínimo de Doggy-Care: guarda sólo la carcasa de la app
// (index.html, JS, CSS, íconos y manifest del propio sitio) para que se pueda
// instalar y abrir rápido.
//
// NO guarda datos: nunca toca pedidos a otros dominios (Supabase, fuentes),
// ni pedidos que no sean GET, ni nada con encabezado Authorization.

const CACHE = 'doggy-care-carcasa-v3';
const CARCASA = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CARCASA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Sólo archivos de la carcasa: misma app, GET, sin credenciales
function esCarcasa(request, origen) {
  if (request.method !== 'GET') return false;
  if (request.headers && request.headers.get && request.headers.get('Authorization')) return false;
  const url = new URL(request.url);
  if (url.origin !== origen) return false;
  if (request.mode === 'navigate') return true;
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!esCarcasa(request, self.location.origin)) return; // el navegador lo maneja como siempre

  if (request.mode === 'navigate') {
    // Red primero: siempre la última versión; sin conexión, la carcasa guardada
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) caches.open(CACHE).then(cache => cache.put('/', resp.clone()));
          return resp;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // JS, CSS e íconos tienen nombre con hash: caché primero
  event.respondWith(
    caches.match(request).then(guardado => guardado || fetch(request).then(resp => {
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE).then(cache => cache.put(request, copia));
      }
      return resp;
    }))
  );
});
