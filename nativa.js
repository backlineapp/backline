// Backline — ¿se está usando como app de App Store / Google Play?
//
// La app de las tiendas lleva dentro esta misma web (con Capacitor). Este
// archivo, que se carga el primero, dice si estamos dentro de esa app y
// arregla lo poco que cambia:
//   · Los datos de los grupos se piden siempre a la web publicada (así se
//     ven los grupos nuevos sin actualizar la app). Si no hay conexión, se
//     usa la copia que va dentro de la app.
//   · No se usa el «ayudante» sw.js ni el aviso de «Instalar la app»: la
//     app ya está instalada.
//
// Órdenes que usa el resto de la app:
//   Nativa.es                -> true dentro de la app de las tiendas
//   Nativa.plataforma        -> 'ios', 'android' o 'web'
//   Nativa.datos(ruta)       -> fetch de un archivo de datos (grupos.json)

(function () {
  'use strict';

  var WEB = 'https://backlineapp.github.io/backline/';
  var cap = window.Capacitor;
  var es = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var plataforma = es && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';

  if (es) document.documentElement.classList.add('nativa', 'nativa-' + plataforma);

  function datos(ruta) {
    if (!es) return fetch(ruta);
    // Primero la web publicada (siempre al día); si falla, la copia de dentro.
    return fetch(WEB + ruta, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }).catch(function () { return fetch(ruta); });
  }

  window.Nativa = { es: es, plataforma: plataforma, datos: datos, WEB: WEB };
})();
