// Ayudante que guarda la app en el móvil.
// Siempre intenta traer la versión más reciente de internet; si no hay
// conexión, usa la copia guardada.

var CACHE = 'backline-v2';
var ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'app.js',
  'grupos.json',
  'manifest.json',
  'logo.svg',
  'fuentes/inter-latin-wght-normal.woff2',
  'fuentes/inter-latin-ext-wght-normal.woff2',
  'fuentes/space-grotesk-latin-wght-normal.woff2',
  'fuentes/space-grotesk-latin-ext-wght-normal.woff2',
  'icono.svg',
  'icono-192.png',
  'icono-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(function (respuesta) {
        var copia = respuesta.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        return respuesta;
      })
      .catch(function () {
        return caches.match(e.request, { ignoreSearch: true });
      })
  );
});
