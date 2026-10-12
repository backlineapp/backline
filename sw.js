// Ayudante que guarda la app en el móvil.
//
// Cada versión de la app se guarda ENTERA o no se guarda:
//  1. Cuando hay una versión nueva, se descargan todos los archivos de golpe,
//     directamente de internet (sin copias viejas por el camino).
//  2. Si falta alguno, la versión nueva se descarta y se sigue usando la
//     anterior, que está completa.
//  3. Si llegan todos, la versión nueva se activa toda junta, se borra la
//     anterior y la app recarga la pantalla una sola vez (ver app.js).
// Mientras tanto, la app siempre se sirve desde la versión guardada, así que
// nunca se mezclan archivos de dos versiones.
//
// IMPORTANTE: cada vez que cambie CUALQUIER archivo de la app (también
// grupos.json), hay que subir este número. Es el único número de versión.
var VERSION = 4;

var CACHE = 'backline-v' + VERSION;
var ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'seguidos.js',
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
    // Primero se descargan todos; solo si llegan todos bien se guardan.
    Promise.all(ARCHIVOS.map(function (archivo) {
      return fetch(new Request(archivo, { cache: 'reload' })).then(function (respuesta) {
        if (!respuesta.ok) throw new Error(archivo + ': ' + respuesta.status);
        return [archivo, respuesta];
      });
    }))
      .then(function (descargados) {
        return caches.open(CACHE).then(function (c) {
          return Promise.all(descargados.map(function (d) { return c.put(d[0], d[1]); }));
        });
      })
      .catch(function (error) {
        // Versión incompleta: se borra lo que hubiera y la instalación falla.
        return caches.delete(CACHE).then(function () { throw error; });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (guardado) {
        return guardado || fetch(e.request);
      });
    })
  );
});
