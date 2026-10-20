// Ayudante que guarda la app en el móvil.
//
// Los archivos de la app se guardan por versiones, y cada versión se guarda
// ENTERA o no se guarda:
//  1. Cuando hay una versión nueva, se descargan todos los archivos de golpe,
//     directamente de internet (sin copias viejas por el camino).
//  2. Si falta alguno, la versión nueva se descarta y se sigue usando la
//     anterior, que está completa.
//  3. Si llegan todos, la versión nueva se activa toda junta, se borra la
//     anterior y la app recarga la pantalla una sola vez (ver app.js).
// Mientras tanto, la app siempre se sirve desde la versión guardada, así que
// nunca se mezclan archivos de dos versiones.
//
// Los datos de los grupos (grupos.json) van aparte y NO dependen de la
// versión: se piden siempre a internet al abrir la app y, si no hay
// conexión, se usa la última copia guardada.
//
// Los conciertos, discos, vídeos y noticias, las cuentas y las imágenes
// vienen de Supabase (otra dirección): este ayudante no los toca ni los guarda.
//
// También muestra los avisos al móvil que manda Supabase y, al tocar uno,
// abre la app en ese concierto, disco, vídeo o noticia (ver avisos.js).
//
// IMPORTANTE: cada vez que cambie un archivo de la app (pantallas, estilos,
// código, iconos, tipografías), hay que subir este número. Es el único número
// de versión. Para cambiar grupos.json NO hace falta tocarlo.
var VERSION = 12;

var CACHE = 'backline-v' + VERSION;
var ARCHIVOS = [
  './',
  'index.html',
  'estilos.css',
  'seguidos.js',
  'libs/supabase.js',
  'nube.js',
  'conciertos.js',
  'novedades.js',
  'panel.js',
  'instalar.js',
  'avisos.js',
  'app.js',
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

// Última copia de los datos de los grupos. Se conserva al cambiar de versión.
var DATOS = 'backline-datos';
var GRUPOS = 'grupos.json';

// Pide grupos.json a internet (comprobando siempre que sea el último) y
// guarda la copia para usarla sin conexión.
function gruposDeInternet() {
  return fetch(new Request(GRUPOS, { cache: 'no-cache' })).then(function (respuesta) {
    if (!respuesta.ok) throw new Error(GRUPOS + ': ' + respuesta.status);
    var copia = respuesta.clone();
    return caches.open(DATOS)
      .then(function (c) { return c.put(GRUPOS, copia); })
      .then(function () { return respuesta; });
  });
}

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
      // Se deja ya guardada una copia de los datos para poder usar la app sin
      // conexión. Si falla, no pasa nada: se guardará la próxima vez.
      .then(function () { return gruposDeInternet().catch(function () {}); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.filter(function (k) { return k !== CACHE && k !== DATOS; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Datos de los grupos: primero internet; sin conexión, la última copia.
  if (url.pathname === new URL(GRUPOS, self.registration.scope).pathname) {
    e.respondWith(
      gruposDeInternet().catch(function () {
        return caches.open(DATOS).then(function (c) { return c.match(GRUPOS); })
          .then(function (guardado) { return guardado || Response.error(); });
      })
    );
    return;
  }

  // Archivos de la app: siempre de la versión guardada.
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (guardado) {
        return guardado || fetch(e.request);
      });
    })
  );
});

// ---------- Avisos al móvil ----------

// Llega un aviso: { titulo, texto, ruta: '#/concierto/...' o '#/novedad/...', etiqueta }.
self.addEventListener('push', function (e) {
  var datos = {};
  try { datos = e.data ? e.data.json() : {}; } catch (error) { datos = {}; }
  var titulo = datos.titulo || 'Backline';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: datos.texto || '',
    icon: 'icono-192.png',
    lang: 'es',
    // Un aviso nuevo de la misma publicación sustituye al anterior.
    tag: datos.etiqueta || undefined,
    data: { ruta: typeof datos.ruta === 'string' ? datos.ruta : '' }
  }));
});

// Se toca un aviso: si la app está abierta, va a esa pantalla; si no, la abre ahí.
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var ruta = (e.notification.data && e.notification.data.ruta) || '';
  if (!/^#\/[a-z0-9\/_-]*$/i.test(ruta)) ruta = '';
  var url = self.registration.scope + ruta;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
      for (var i = 0; i < ventanas.length; i++) {
        var v = ventanas[i];
        if (v.url.indexOf(self.registration.scope) === 0 && 'focus' in v) {
          if (ruta) v.postMessage({ tipo: 'abrir', ruta: ruta });
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
