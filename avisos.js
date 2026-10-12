// Backline — avisos al móvil (notificaciones), sin cuentas ni datos personales.
//
// Este archivo hace tres cosas:
//   1. El recuadro de arriba de Mis grupos: activar o desactivar los avisos
//      (el permiso se pide solo al pulsar el botón, nunca al abrir la app).
//      En un iPhone sin la app instalada dice que hay que instalarla (si no,
//      iOS no deja recibir avisos) y abre el recuadro de instalar.js, que es
//      el único sitio donde se explican los pasos.
//   2. La campanita de cada ficha, para silenciar un grupo sin dejar de seguirlo.
//   3. Mantener al día lo que sabe Supabase de este móvil: solo su
//      "dirección de avisos" y la lista de grupos que sigue sin silenciar.
//      Ni correo ni nombre.
//
// Los avisos los manda Supabase (supabase/functions/enviar-avisos) y los
// muestra sw.js. Al tocar uno, sw.js abre la app en ese concierto.
//
// Órdenes que usa el resto de la app:
//   Avisos.pintar(contenedor)  -> pinta el recuadro de Mis grupos
//   Avisos.campanita(grupo)    -> botón de la campanita para la ficha

(function () {
  'use strict';

  // Lo último que se envió a Supabase, para no repetirlo en cada cambio.
  var CLAVE = 'backline.avisos';
  // Aunque nada cambie, se vuelve a enviar de vez en cuando, por si el
  // móvil ha cambiado su dirección de avisos sin decir nada.
  var REPASO = 7 * 24 * 3600 * 1000;

  var ocupado = false;
  var turno = 0;
  var contenedorActual = null;
  var espera = null;

  // ---------- Qué permite este móvil ----------

  function soportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function esIphone() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function instalada() {
    return navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // El ayudante de la app (sw.js), ya activo. Si no llega en 10 s, error.
  function registro() {
    return new Promise(function (resolver, rechazar) {
      var t = setTimeout(function () { rechazar(new Error('La app aún se está preparando. Vuelve a intentarlo en un momento.')); }, 10000);
      navigator.serviceWorker.ready.then(function (r) { clearTimeout(t); resolver(r); }, rechazar);
    });
  }

  function suscripcionActual() {
    if (!soportado() || Notification.permission !== 'granted') return Promise.resolve(null);
    return registro().then(function (r) { return r.pushManager.getSubscription(); }).catch(function () { return null; });
  }

  // ---------- Memoria del móvil ----------

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
  }

  function escribir(datos) {
    try {
      if (datos) localStorage.setItem(CLAVE, JSON.stringify(datos));
      else localStorage.removeItem(CLAVE);
    } catch (e) { /* sin permiso para guardar: se enviará otra vez la próxima */ }
  }

  // ---------- Hablar con Supabase ----------

  // Texto en base64url -> bytes (así viene la clave pública).
  function bytes(texto) {
    var b = String(texto).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var crudo = atob(b);
    var salida = new Uint8Array(crudo.length);
    for (var i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
    return salida;
  }

  function mismaClave(sus, clave) {
    var actual = sus.options && sus.options.applicationServerKey;
    if (!actual) return true;
    var a = new Uint8Array(actual);
    var b = bytes(clave);
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Envía a Supabase la lista de grupos de este móvil (si ha cambiado).
  function enviarLista(sus, forzar) {
    var json = sus.toJSON();
    var grupos = Seguidos.idsConAvisos();
    var firma = json.endpoint + '|' + grupos.slice().sort().join(',');
    var ultimo = leer();
    if (!forzar && ultimo.firma === firma && Date.now() - (ultimo.enviado || 0) < REPASO) return Promise.resolve();
    return Nube.apuntarAvisos(json, grupos).then(function () {
      escribir({ firma: firma, enviado: Date.now() });
    });
  }

  // Al seguir, dejar de seguir o silenciar: se envía la lista nueva al poco
  // rato (si se tocan varios grupos seguidos, se envía una sola vez).
  function alCambiarSeguidos() {
    clearTimeout(espera);
    espera = setTimeout(function () {
      suscripcionActual().then(function (sus) {
        if (sus) return enviarLista(sus, false);
      }).catch(function () { /* sin conexión: se reintenta al abrir la app */ });
    }, 1500);
  }

  function pedirPermiso() {
    // Safari antiguo usa un aviso de vuelta en lugar de una promesa.
    return new Promise(function (resolver) {
      var r = Notification.requestPermission(resolver);
      if (r && r.then) r.then(resolver);
    });
  }

  function activar() {
    if (ocupado) return;
    ocupado = true;
    pintarDeNuevo('Activando avisos…');
    // El permiso se pide lo primero, justo al pulsar (iPhone lo exige así).
    pedirPermiso()
      .then(function (permiso) {
        if (permiso !== 'granted') throw new Error('sin-permiso');
        return Promise.all([registro(), Nube.claveAvisos()]);
      })
      .then(function (r) {
        var reg = r[0];
        var clave = r[1];
        return reg.pushManager.getSubscription().then(function (sus) {
          // Si la suscripción es de una clave antigua, se cambia por una nueva.
          if (sus && !mismaClave(sus, clave)) return sus.unsubscribe().then(function () { return null; });
          return sus;
        }).then(function (sus) {
          return sus || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(clave) });
        });
      })
      .then(function (sus) { return enviarLista(sus, true); })
      .then(function () {
        ocupado = false;
        pintarDeNuevo('');
      }, function (e) {
        ocupado = false;
        var texto = e && e.message === 'sin-permiso'
          ? 'No has dado permiso para los avisos.'
          : (e && e.message) || 'No se han podido activar los avisos.';
        pintarDeNuevo(texto, true);
      });
  }

  function desactivar() {
    if (ocupado) return;
    ocupado = true;
    pintarDeNuevo('Desactivando avisos…');
    suscripcionActual()
      .then(function (sus) {
        if (!sus) return;
        // Primero se borra de Supabase; aunque falle, se cancela en el móvil
        // (y Supabase lo borrará solo la próxima vez que intente avisar).
        return Nube.borrarAvisos(sus.toJSON()).catch(function () {})
          .then(function () { return sus.unsubscribe(); });
      })
      .then(function () {
        escribir(null);
        ocupado = false;
        pintarDeNuevo('');
      }, function () {
        ocupado = false;
        pintarDeNuevo('No se han podido desactivar los avisos. Vuelve a intentarlo.', true);
      });
  }

  // ---------- Recuadro de Mis grupos ----------

  function crear(etiqueta, clase, texto) {
    var nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function boton(texto, clase, alPulsar) {
    var b = crear('button', clase, texto);
    b.type = 'button';
    b.disabled = ocupado;
    b.addEventListener('click', alPulsar);
    return b;
  }

  var ICONO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.8 6 1.8 6H4.2S6 14.5 6 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M10 19.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  var ICONO_SILENCIO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.8 6 1.8 6H4.2S6 14.5 6 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M10 19.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M4 3.5l16 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function caja(titulo, texto) {
    var c = crear('div', 'avisos-caja');
    var cabecera = crear('div', 'avisos-cabecera');
    var icono = crear('span', 'avisos-icono');
    icono.innerHTML = ICONO;
    cabecera.appendChild(icono);
    cabecera.appendChild(crear('p', 'avisos-titulo', titulo));
    c.appendChild(cabecera);
    if (texto) c.appendChild(crear('p', 'avisos-texto', texto));
    return c;
  }

  function instalarPrimero() {
    var c = caja('Recibe un aviso cuando tus grupos publiquen algo',
      'En iPhone, los avisos solo llegan si Backline está instalada en la pantalla de inicio. Instálala, ábrela desde su icono y vuelve aquí para activarlos.');
    c.appendChild(boton('Cómo instalarla', 'boton', function () { Instalar.mostrar(); }));
    c.appendChild(crear('p', 'avisos-nota', 'Si al abrirla desde el icono no ves tus grupos, síguelos otra vez desde allí.'));
    return c;
  }

  function pintarEstado(contenedor, sus, texto, esError) {
    contenedor.textContent = '';
    var c;
    if (sus) {
      c = caja('Avisos activados',
        'Te avisaremos cuando tus grupos publiquen un concierto o una gira. Nunca de noche. Para silenciar un grupo, toca la campanita de su ficha.');
      c.classList.add('activos');
      c.appendChild(boton('Desactivar avisos', 'boton-texto', desactivar));
    } else if (Notification.permission === 'denied') {
      c = caja('Avisos bloqueados',
        'Has bloqueado los avisos de Backline en este móvil. Para recibirlos, permítelos en los ajustes del navegador o del móvil y vuelve aquí.');
    } else {
      c = caja('Recibe un aviso cuando tus grupos publiquen algo',
        'Solo conciertos y giras de los grupos que sigues. Sin cuenta y nunca de noche.');
      c.appendChild(boton('Activar avisos', 'boton', activar));
    }
    if (texto) c.appendChild(crear('p', 'avisos-mensaje' + (esError ? ' error' : ''), texto));
    contenedor.appendChild(c);
  }

  function pintar(contenedor, texto, esError) {
    contenedorActual = contenedor;
    var mio = ++turno;
    if (!soportado()) {
      contenedor.textContent = '';
      // iPhone sin instalar: se explica cómo instalarla. Otros navegadores sin
      // avisos: no se muestra nada.
      if (esIphone() && !instalada()) contenedor.appendChild(instalarPrimero());
      return;
    }
    suscripcionActual().then(function (sus) {
      if (mio !== turno) return;
      pintarEstado(contenedor, sus, texto, esError);
    });
  }

  function pintarDeNuevo(texto, esError) {
    if (contenedorActual && contenedorActual.isConnected) pintar(contenedorActual, texto, esError);
  }

  // ---------- Campanita de la ficha ----------

  var mensajeCorto = null;
  var tiempoMensaje = null;

  function avisoBreve(texto) {
    if (!mensajeCorto) {
      mensajeCorto = crear('p', 'aviso-breve');
      mensajeCorto.setAttribute('role', 'status');
      document.body.appendChild(mensajeCorto);
    }
    mensajeCorto.textContent = texto;
    mensajeCorto.classList.add('visible');
    clearTimeout(tiempoMensaje);
    tiempoMensaje = setTimeout(function () { mensajeCorto.classList.remove('visible'); }, 2600);
  }

  // Solo se ve si sigues al grupo.
  function campanita(grupo) {
    var b = crear('button', 'campanita');
    b.type = 'button';
    function actualizar() {
      var sigo = Seguidos.sigo(grupo.id);
      var callado = Seguidos.silenciado(grupo.id);
      b.hidden = !sigo;
      b.innerHTML = callado ? ICONO_SILENCIO : ICONO;
      b.setAttribute('aria-pressed', String(callado));
      b.setAttribute('aria-label', callado ? 'Volver a recibir avisos de ' + grupo.nombre : 'Silenciar los avisos de ' + grupo.nombre);
      b.title = callado ? 'Avisos silenciados' : 'Silenciar avisos';
    }
    b.addEventListener('click', function () {
      var callado = Seguidos.alternarSilencio(grupo.id);
      actualizar();
      avisoBreve(callado
        ? 'No recibirás avisos de ' + grupo.nombre + '. Lo sigues siguiendo.'
        : 'Volverás a recibir avisos de ' + grupo.nombre + '.');
    });
    Seguidos.alCambiar(function () { if (b.isConnected) actualizar(); });
    actualizar();
    return b;
  }

  // ---------- Arranque ----------

  Seguidos.alCambiar(alCambiarSeguidos);

  // Al abrir la app, se repasa que Supabase tenga la lista al día.
  suscripcionActual().then(function (sus) {
    if (sus) return enviarLista(sus, false);
  }).catch(function () { /* sin conexión: ya se enviará */ });

  // Al tocar un aviso con la app ya abierta, sw.js pide ir a ese concierto.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.tipo === 'abrir' && typeof d.ruta === 'string' && /^#\/[a-z0-9/_-]*$/i.test(d.ruta)) {
        location.hash = d.ruta;
      }
    });
  }

  window.Avisos = {
    pintar: function (contenedor) { pintar(contenedor, '', false); },
    campanita: campanita
  };
})();
