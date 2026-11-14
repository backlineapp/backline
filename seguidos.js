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
// La lista se guarda siempre en el propio móvil y funciona igual sin cuenta.
// Si la persona entra con su correo ("registro para guardar"), además se
// guarda una copia en su cuenta de Supabase (supabase/19-seguidos-cuenta.sql):
//   · la primera vez que entra en un móvil, se juntan la lista del móvil y
//     la de la cuenta (no se pierde ningún grupo);
//   · después, cada cambio (seguir, dejar, silenciar, ocultar) se sube, y al
//     abrir la app o volver a ella se baja lo que se haya cambiado desde otro
//     móvil;
//   · si no hay conexión, los cambios quedan apuntados y se suben al volver;
//   · al salir de la cuenta, la lista se queda en el móvil.
// Todo esto es solo de este archivo: el resto de la app no se entera.

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
    // Fecha (texto ISO) en que empezaste a seguir al grupo, o '' si no lo sigues.
    desde: function (id) {
      var i = posicion(id);
      return i === -1 ? '' : (lista[i].desde || '');
    },
    seguir: function (id) {
      if (!id || posicion(id) !== -1) return;
      // Seguir a un grupo oculto lo vuelve a mostrar.
      if (ocultos.indexOf(id) !== -1) {
        ocultos.splice(ocultos.indexOf(id), 1);
        escribirOcultos();
      }
      lista.push({ id: id, desde: new Date().toISOString() });
      marcar(id);
      guardarYAvisar();
    },
    dejar: function (id) {
      var i = posicion(id);
      if (i === -1) return;
      lista.splice(i, 1);
      marcar(id);
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
      marcar(id);
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
      marcar(id);
      guardarYAvisar();
    },
    mostrar: function (id) {
      var i = ocultos.indexOf(id);
      if (i === -1) return;
      ocultos.splice(i, 1);
      escribirOcultos();
      marcar(id);
      avisar();
    },
    idsOcultos: function () {
      return ocultos.slice();
    }
  };

  // ---------- Copia en la cuenta (solo si la persona ha entrado con su correo) ----------
  // pend = grupos cuyo cambio aún no se ha subido: { id: número }. El número
  // sube con cada cambio, para no dar por subido algo que se tocó mientras
  // se estaba subiendo.

  var CLAVE_CUENTA = 'backline.seguidos.cuenta'; // cuenta a la que está ligada la lista de este móvil
  var CLAVE_PEND = 'backline.seguidos.pend';

  function leerPend() {
    try {
      var d = JSON.parse(localStorage.getItem(CLAVE_PEND));
      if (d && typeof d === 'object' && !Array.isArray(d)) return d;
    } catch (e) { /* datos dañados o sin permiso */ }
    return {};
  }
  function escribirPend() {
    try { localStorage.setItem(CLAVE_PEND, JSON.stringify(pend)); } catch (e) { /* solo en memoria */ }
  }
  // La cuenta a la que está ligada la lista se guarda también en memoria, por si
  // el móvil no deja guardar (modo privado): así sigue funcionando mientras la
  // app esté abierta.
  var ligada = '';
  try { ligada = localStorage.getItem(CLAVE_CUENTA) || ''; } catch (e) { /* sin permiso */ }
  function cuentaLigada() {
    return ligada;
  }
  function ligar(id) {
    ligada = id || '';
    try {
      if (id) localStorage.setItem(CLAVE_CUENTA, id);
      else localStorage.removeItem(CLAVE_CUENTA);
    } catch (e) { /* solo en memoria */ }
  }

  var pend = leerPend();
  var sincronizando = false;
  var repetir = false;
  var temporizador = null;
  var ultimaSincronizacion = 0;

  // Apunta que hay que subir lo que ha cambiado de este grupo (si hay cuenta).
  function marcar(id) {
    if (!cuentaLigada()) return;
    pend[id] = (pend[id] || 0) + 1;
    escribirPend();
    programar();
  }

  // Espera un momento por si se tocan varios grupos seguidos.
  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, 1200);
  }

  function desligar() {
    if (!cuentaLigada()) return;
    ligar('');
    pend = {};
    escribirPend();
  }

  // Cómo está ahora este grupo en el móvil: seguido, oculto o ninguna de las dos.
  function estadoLocal(id) {
    var i = posicion(id);
    if (i !== -1) {
      return { id: id, estado: 'siguiendo', silencio: lista[i].silencio === true, desde: lista[i].desde || new Date().toISOString() };
    }
    if (ocultos.indexOf(id) !== -1) {
      return { id: id, estado: 'oculto', silencio: false, desde: new Date().toISOString() };
    }
    return null;
  }

  function firma(l, o) {
    return l.map(function (s) { return s.id + (s.silencio ? '!' : ''); }).join(',') + '|' + o.join(',');
  }

  // Junta lo que hay en la cuenta con lo del móvil. Lo que tiene un cambio
  // pendiente manda lo del móvil; lo demás, lo de la cuenta (así llegan los
  // cambios hechos desde otro móvil, incluidos los grupos que se han dejado).
  function fusionar(filas) {
    var remoto = {};
    filas.forEach(function (f) { remoto[f.grupo_id] = f; });
    var orden = lista.map(function (s) { return s.id; }).concat(ocultos, filas.map(function (f) { return f.grupo_id; }));
    var visto = {};
    var nuevaLista = [];
    var nuevosOcultos = [];
    orden.forEach(function (id) {
      if (visto[id]) return;
      visto[id] = true;
      var i = posicion(id);
      if (pend[id]) {
        if (i !== -1) nuevaLista.push(lista[i]);
        else if (ocultos.indexOf(id) !== -1) nuevosOcultos.push(id);
        return;
      }
      var r = remoto[id];
      if (!r) return;
      if (r.estado === 'oculto') { nuevosOcultos.push(id); return; }
      var s = { id: id, desde: i !== -1 ? lista[i].desde : r.desde };
      if (r.silencio) s.silencio = true;
      nuevaLista.push(s);
    });
    if (firma(nuevaLista, nuevosOcultos) === firma(lista, ocultos)) return;
    lista = nuevaLista;
    ocultos = nuevosOcultos;
    almacenLocal.escribir(lista);
    escribirOcultos();
    avisar();
  }

  function sincronizar() {
    var N = window.Nube;
    if (!N || !N.disponible) return Promise.resolve();
    if (sincronizando) { repetir = true; return Promise.resolve(); }
    sincronizando = true;
    return N.listo.then(function () {
      var cuenta = N.cuenta();
      if (!cuenta) { desligar(); return; }
      if (cuentaLigada() !== cuenta.id) {
        // Primera vez con esta cuenta en este móvil: se sube todo lo del
        // móvil y se baja lo de la cuenta, así que se juntan las dos listas.
        ligar(cuenta.id);
        pend = {};
        lista.forEach(function (s) { pend[s.id] = 1; });
        ocultos.forEach(function (id) { pend[id] = 1; });
        escribirPend();
      }
      var antes = JSON.parse(JSON.stringify(pend));
      var ids = Object.keys(antes);
      var filas = [];
      var borrar = [];
      ids.forEach(function (id) {
        var e = estadoLocal(id);
        if (e) filas.push(e); else borrar.push(id);
      });
      var subida = ids.length ? N.subirSeguidos(filas, borrar) : Promise.resolve();
      return subida.then(function () {
        ids.forEach(function (id) { if (pend[id] === antes[id]) delete pend[id]; });
        escribirPend();
        return N.leerSeguidos();
      }).then(fusionar);
    }).catch(function () {
      // Sin conexión (o la tabla aún no existe): lo pendiente se sube la próxima vez.
    }).then(function () {
      sincronizando = false;
      ultimaSincronizacion = Date.now();
      if (repetir) { repetir = false; programar(); }
    });
  }

  window.addEventListener('load', function () {
    if (!window.Nube || !window.Nube.disponible) return;
    window.Nube.listo.then(function () { sincronizar(); });
    window.Nube.alCambiarCuenta(function (cuenta) {
      if (cuenta) sincronizar(); else desligar();
    });
  });
  // Al volver a la app, se baja lo que se haya cambiado desde otro móvil.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && cuentaLigada() && Date.now() - ultimaSincronizacion > 20000) {
      sincronizar();
    }
  });

  // Si la app está abierta en dos pestañas, ambas ven la misma lista.
  window.addEventListener('storage', function (e) {
    if (e.key === CLAVE_PEND) { pend = leerPend(); return; }
    if (e.key === CLAVE_CUENTA) { ligada = e.newValue || ''; return; }
    if (e.key === CLAVE) lista = limpiar(almacenLocal.leer());
    else if (e.key === CLAVE_OCULTOS) ocultos = leerOcultos();
    else return;
    avisar();
  });

  window.Seguidos = Seguidos;
})();
