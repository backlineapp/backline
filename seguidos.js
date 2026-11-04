// backline — lista de grupos que sigue el fan.
//
// Este archivo es el ÚNICO sitio de la app que sabe dónde se guarda la lista.
// El resto de la app solo usa estas órdenes:
//   Seguidos.sigo(id)       -> ¿sigo a este grupo? (sí / no)
//   Seguidos.alternar(id)   -> sigue o deja de seguir; devuelve cómo queda
//   Seguidos.seguir(id) / Seguidos.dejar(id)
//   Seguidos.ids()          -> identificadores de los grupos seguidos
//   Seguidos.alCambiar(fn)  -> avisa cuando la lista cambia
//   Seguidos.silenciado(id) -> ¿he silenciado sus avisos? (sí / no)
//   Seguidos.alternarSilencio(id) -> silencia o vuelve a avisar; devuelve
//                              true si queda silenciado
//   Seguidos.idsConAvisos() -> grupos seguidos y no silenciados (los que
//                              mandan avisos a este móvil)
//   Seguidos.oculto(id)     -> ¿he ocultado este grupo? (sí / no)
//   Seguidos.ocultar(id)    -> deja de seguirlo y lo oculta de Explorar
//                              (lo exige Apple: poder bloquear contenido)
//   Seguidos.mostrar(id)    -> deja de ocultarlo
//   Seguidos.idsOcultos()   -> identificadores de los grupos ocultos
//
// Hoy la lista se guarda solo en el propio móvil, sin cuentas.
// Cuando lleguen las cuentas ("registro para guardar" con Supabase) solo
// cambiará este archivo: la lista del móvil seguirá funcionando igual sin
// cuenta y, al registrarse, se subirá a la cuenta para no perderla.

(function () {
  'use strict';

  var CLAVE = 'backline.seguidos';
  var CLAVE_OCULTOS = 'backline.ocultos';
  var VERSION = 1;

  // ---------- Dónde se guarda: memoria del propio móvil ----------
  // Si el navegador no deja guardar (por ejemplo, en modo privado), la lista
  // funciona igual mientras la app esté abierta.

  var almacenLocal = {
    leer: function () {
      try {
        var datos = JSON.parse(localStorage.getItem(CLAVE));
        if (datos && Array.isArray(datos.grupos)) return datos.grupos;
      } catch (e) { /* datos dañados o sin permiso: empezamos de cero */ }
      return [];
    },
    escribir: function (lista) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ version: VERSION, grupos: lista }));
      } catch (e) { /* sin permiso para guardar: se queda solo en memoria */ }
    }
  };

  // Cada elemento es { id: 'noah-histeria', desde: '2026-10-12T18:00:00.000Z' }
  // y, si se ha silenciado con la campanita, además silencio: true.
  // "desde" servirá más adelante para el feed y para subir la lista a la cuenta.
  var lista = limpiar(almacenLocal.leer());
  var oyentes = [];

  // Grupos ocultos: una lista aparte de identificadores, en el propio móvil.
  function leerOcultos() {
    try {
      var d = JSON.parse(localStorage.getItem(CLAVE_OCULTOS));
      if (Array.isArray(d)) return d.filter(function (x) { return typeof x === 'string' && x; });
    } catch (e) { /* datos dañados o sin permiso */ }
    return [];
  }
  function escribirOcultos() {
    try { localStorage.setItem(CLAVE_OCULTOS, JSON.stringify(ocultos)); } catch (e) { /* solo en memoria */ }
  }
  var ocultos = leerOcultos();

  function limpiar(elementos) {
    var vistos = {};
    return elementos.filter(function (s) {
      if (!s || typeof s.id !== 'string' || !s.id || vistos[s.id]) return false;
      vistos[s.id] = true;
      return true;
    });
  }

  function posicion(id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return i;
    return -1;
  }

  function guardarYAvisar() {
    almacenLocal.escribir(lista);
    // Aquí, con cuentas, también se enviará el cambio a Supabase.
    avisar();
  }

  function avisar() {
    oyentes.forEach(function (fn) {
      try { fn(); } catch (e) { /* un fallo en una pantalla no rompe las demás */ }
    });
  }

  var Seguidos = {
    ids: function () {
      return lista.map(function (s) { return s.id; });
    },
    sigo: function (id) {
      return posicion(id) !== -1;
    },
    seguir: function (id) {
      if (!id || posicion(id) !== -1) return;
      // Seguir a un grupo oculto lo vuelve a mostrar.
      if (ocultos.indexOf(id) !== -1) {
        ocultos.splice(ocultos.indexOf(id), 1);
        escribirOcultos();
      }
      lista.push({ id: id, desde: new Date().toISOString() });
      guardarYAvisar();
    },
    dejar: function (id) {
      var i = posicion(id);
      if (i === -1) return;
      lista.splice(i, 1);
      guardarYAvisar();
    },
    alternar: function (id) {
      if (Seguidos.sigo(id)) Seguidos.dejar(id);
      else Seguidos.seguir(id);
      return Seguidos.sigo(id);
    },
    alCambiar: function (fn) {
      oyentes.push(fn);
    },
    silenciado: function (id) {
      var i = posicion(id);
      return i !== -1 && lista[i].silencio === true;
    },
    alternarSilencio: function (id) {
      var i = posicion(id);
      if (i === -1) return false;
      if (lista[i].silencio) delete lista[i].silencio;
      else lista[i].silencio = true;
      guardarYAvisar();
      return Seguidos.silenciado(id);
    },
    idsConAvisos: function () {
      return lista.filter(function (s) { return !s.silencio; }).map(function (s) { return s.id; });
    },
    oculto: function (id) {
      return ocultos.indexOf(id) !== -1;
    },
    ocultar: function (id) {
      if (!id) return;
      if (ocultos.indexOf(id) === -1) {
        ocultos.push(id);
        escribirOcultos();
      }
      var i = posicion(id);
      if (i !== -1) lista.splice(i, 1);
      guardarYAvisar();
    },
    mostrar: function (id) {
      var i = ocultos.indexOf(id);
      if (i === -1) return;
      ocultos.splice(i, 1);
      escribirOcultos();
      avisar();
    },
    idsOcultos: function () {
      return ocultos.slice();
    }
  };

  // Si la app está abierta en dos pestañas, ambas ven la misma lista.
  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE) lista = limpiar(almacenLocal.leer());
    else if (e.key === CLAVE_OCULTOS) ocultos = leerOcultos();
    else return;
    avisar();
  });

  window.Seguidos = Seguidos;
})();
