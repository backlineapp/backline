// Backline — instalar la app en la pantalla de inicio del móvil.
//
// Este archivo hace dos cosas:
//   1. El recuadro "Instala Backline en tu móvil", que sale al entrar si la
//      app no se ha abierto desde el icono. Cambia según dónde se abra:
//        - Android: si el navegador ofrece instalar, un botón que lo abre.
//          Si no, los pasos de cada navegador: Chrome, Samsung Internet y
//          Firefox tienen los suyos; para los demás sale un texto general.
//        - iPhone/Safari: los pasos de Compartir > Añadir a pantalla de inicio.
//        - Dentro de otra app (WhatsApp, Instagram, Telegram…): cómo abrirla
//          en Safari o Chrome y un botón para copiar el enlace.
//        - Ordenador: al entrar no sale nada.
//      Si se cierra, no vuelve a salir solo en 7 días. Si ya está instalada,
//      nunca.
//   2. El enlace "Instalar la app" del pie de Mis grupos, que lo vuelve a abrir.
//
// Lo único que se guarda (en el propio móvil) es cuándo se cerró el recuadro.
//
// Órdenes que usa el resto de la app:
//   Instalar.alEntrar()   -> muestra el recuadro si toca (lo llama app.js)
//   Instalar.mostrar()    -> lo muestra siempre (enlace del pie, avisos.js)
//   Instalar.instalada()  -> true si la app se ha abierto desde el icono

(function () {
  'use strict';

  var CLAVE = 'backline.instalar';
  var ESPERA = 7 * 24 * 3600 * 1000;

  // La instalación que ofrece Chrome. Se guarda para lanzarla con el botón
  // (y así Chrome no muestra a la vez su propia barrita de instalar).
  var ofertaChrome = null;
  // Si Chrome dice que ya está instalada en este móvil.
  var yaInstalada = false;
  var fondo = null;

  // ---------- Dónde se está abriendo ----------

  var ua = navigator.userAgent || '';

  function instalada() {
    // La app de App Store / Google Play ya está instalada (nativa.js).
    if (window.Nativa && Nativa.es) return true;
    return navigator.standalone === true ||
      (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches));
  }

  function esIphone() {
    return /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function esAndroid() {
    return /Android/i.test(ua);
  }

  // Samsung Internet, el navegador de los móviles Samsung.
  function esSamsung() {
    return /SamsungBrowser/i.test(ua);
  }

  function esFirefox() {
    return /Firefox\//i.test(ua);
  }

  // Chrome de verdad: otros navegadores también dicen "Chrome/" en su
  // identificación, pero añaden su propio nombre.
  function esChrome() {
    return /Chrome\//.test(ua) &&
      !/SamsungBrowser|OPR\/|Opera|EdgA\/|Edg\/|YaBrowser|UCBrowser|MiuiBrowser|XiaoMi|HuaweiBrowser|HeyTapBrowser|VivoBrowser|DuckDuckGo|Brave|Vivaldi/i.test(ua);
  }

  function esMovil() {
    return esIphone() || esAndroid();
  }

  // Navegadores que llevan dentro otras apps: desde ahí no se puede instalar.
  function dentroDeOtraApp() {
    if (/FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Telegram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|Bytedance|GSA\//i.test(ua)) return true;
    // En iPhone, Safari y los demás navegadores dicen "Safari/"; las apps, no.
    if (esIphone()) return !/Safari\//.test(ua);
    // En Android, las apps que muestran webs dentro añaden "; wv)".
    if (esAndroid()) return /; wv\)/.test(ua);
    return false;
  }

  // Dirección de la app, sin la pantalla concreta, para copiar y compartir.
  function enlaceApp() {
    return location.origin + location.pathname;
  }

  // ---------- Memoria del móvil ----------

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
  }

  function escribir(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* sin permiso: no pasa nada */ }
  }

  function descartadoHacePoco() {
    var cuando = leer().descartado || 0;
    return Date.now() - cuando < ESPERA;
  }

  // ---------- Avisos del navegador ----------

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    ofertaChrome = e;
    // Si el recuadro está abierto con los pasos a mano, se cambia por el botón.
    if (fondo) pintar();
  });

  window.addEventListener('appinstalled', function () {
    ofertaChrome = null;
    yaInstalada = true;
    escribir({ instalada: Date.now() });
    if (fondo) pintar();
  });

  // Chrome en Android puede decir si la app ya está instalada (ver
  // related_applications en manifest.json).
  if (navigator.getInstalledRelatedApps) {
    navigator.getInstalledRelatedApps().then(function (apps) {
      if (apps && apps.length) yaInstalada = true;
    }).catch(function () {});
  }

  // ---------- Piezas ----------

  function crear(etiqueta, clase, texto) {
    var nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function boton(texto, clase, alPulsar) {
    var b = crear('button', clase, texto);
    b.type = 'button';
    b.addEventListener('click', alPulsar);
    return b;
  }

  var ICONO_COMPARTIR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 9H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M12 3v11M8.5 6.5L12 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICONO_ANADIR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  var ICONO_LISTO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M5.5 12.5l4 4 9-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICONO_MENU = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<circle cx="12" cy="5.5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="18.5" r="1.8" fill="currentColor"/></svg>';

  // El menú de Samsung Internet: tres rayas, abajo a la derecha.
  var ICONO_MENU_RAYAS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // Lista de pasos numerados, cada uno con su dibujito.
  function pasos(lista) {
    var ol = crear('ol', 'instalar-pasos');
    lista.forEach(function (p) {
      var li = crear('li');
      var icono = crear('span', 'instalar-paso-icono');
      icono.innerHTML = p.icono;
      li.appendChild(icono);
      var texto = crear('span', 'instalar-paso-texto');
      p.texto.forEach(function (trozo) {
        texto.appendChild(trozo.fuerte ? crear('strong', null, trozo.fuerte) : document.createTextNode(trozo));
      });
      li.appendChild(texto);
      ol.appendChild(li);
    });
    return ol;
  }

  // Botón "Copiar enlace" con su mensaje de confirmación.
  function copiarEnlace(caja, navegador) {
    var mensaje = crear('p', 'instalar-mensaje');
    mensaje.setAttribute('role', 'status');
    var b = boton('Copiar enlace', 'boton', function () {
      copiar(enlaceApp()).then(function () {
        mensaje.textContent = 'Enlace copiado. Abre ' + navegador + ', pégalo en la barra de direcciones y vuelve a ver este recuadro.';
      }, function () {
        mensaje.textContent = 'No se ha podido copiar. Escribe esta dirección en ' + navegador + ': ' + enlaceApp();
      });
    });
    caja.appendChild(b);
    caja.appendChild(mensaje);
  }

  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(function () { return copiarAntiguo(texto); });
    }
    return copiarAntiguo(texto);
  }

  // Para navegadores que no dejan usar el portapapeles moderno.
  function copiarAntiguo(texto) {
    return new Promise(function (resolver, rechazar) {
      var t = crear('textarea');
      t.value = texto;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      var bien = false;
      try { bien = document.execCommand('copy'); } catch (e) { bien = false; }
      document.body.removeChild(t);
      if (bien) resolver(); else rechazar();
    });
  }

  // ---------- Contenido según dónde se abra ----------

  function contenidoInstalada(caja) {
    caja.appendChild(crear('p', 'instalar-texto', 'Backline ya está en tu pantalla de inicio. Ábrela desde su icono para usarla como una app más.'));
  }

  function contenidoOtraApp(caja) {
    var iphone = esIphone();
    var navegador = iphone ? 'Safari' : 'Chrome';
    caja.appendChild(crear('p', 'instalar-texto',
      'Estás viendo Backline dentro de otra app (WhatsApp, Instagram, Telegram…). Desde aquí no se puede instalar: hay que abrirla en ' + navegador + '.'));
    caja.appendChild(pasos(iphone ? [
      { icono: ICONO_MENU, texto: ['Toca el menú de esta pantalla (', { fuerte: '···' }, ' o el icono de compartir) y elige ', { fuerte: 'Abrir en Safari' }, '.'] },
      { icono: ICONO_LISTO, texto: ['Si no aparece, copia el enlace con el botón de abajo y pégalo en Safari.'] }
    ] : [
      { icono: ICONO_MENU, texto: ['Toca el menú ', { fuerte: '⋮' }, ' de arriba a la derecha y elige ', { fuerte: 'Abrir en Chrome' }, ' (o «Abrir en el navegador»).'] },
      { icono: ICONO_LISTO, texto: ['Si no aparece, copia el enlace con el botón de abajo y pégalo en Chrome.'] }
    ]));
    copiarEnlace(caja, navegador);
  }

  function contenidoIphone(caja) {
    caja.appendChild(crear('p', 'instalar-texto', 'Tendrás Backline en tu pantalla de inicio, como una app más. Son tres toques:'));
    caja.appendChild(pasos([
      { icono: ICONO_COMPARTIR, texto: ['Toca el botón ', { fuerte: 'Compartir' }, '. Si no lo ves, toca antes ', { fuerte: '···' }, '.'] },
      { icono: ICONO_ANADIR, texto: ['Desliza hacia abajo y elige ', { fuerte: 'Añadir a pantalla de inicio' }, '.'] },
      { icono: ICONO_LISTO, texto: ['Pulsa ', { fuerte: 'Añadir' }, '. Ya puedes abrir Backline desde su icono.'] }
    ]));
    caja.appendChild(crear('p', 'instalar-nota', 'Si no aparece «Añadir a pantalla de inicio», abre esta página en Safari.'));
  }

  function contenidoAndroid(caja) {
    caja.appendChild(crear('p', 'instalar-texto', 'Tendrás Backline en tu pantalla de inicio, como una app más: se abre a pantalla completa y sin barras del navegador.'));
    if (ofertaChrome) {
      caja.appendChild(boton('Instalar Backline', 'boton', instalarConChrome));
      return;
    }
    if (esSamsung()) {
      caja.appendChild(pasos([
        { icono: ICONO_MENU_RAYAS, texto: ['Toca el menú ', { fuerte: '≡' }, ' de abajo a la derecha.'] },
        { icono: ICONO_ANADIR, texto: ['Elige ', { fuerte: 'Añadir página a' }, '.'] },
        { icono: ICONO_LISTO, texto: ['Elige ', { fuerte: 'Pantalla de inicio' }, '.'] }
      ]));
    } else if (esFirefox()) {
      caja.appendChild(pasos([
        { icono: ICONO_MENU, texto: ['Toca el menú ', { fuerte: '⋮' }, ' del navegador.'] },
        { icono: ICONO_ANADIR, texto: ['Elige ', { fuerte: 'Instalar' }, ' o ', { fuerte: 'Añadir a pantalla de inicio' }, '.'] },
        { icono: ICONO_LISTO, texto: ['Confirma con ', { fuerte: 'Añadir' }, '.'] }
      ]));
    } else if (esChrome()) {
      caja.appendChild(pasos([
        { icono: ICONO_MENU, texto: ['Toca el menú ', { fuerte: '⋮' }, ' del navegador, arriba a la derecha.'] },
        { icono: ICONO_ANADIR, texto: ['Elige ', { fuerte: 'Instalar aplicación' }, ' o ', { fuerte: 'Añadir a pantalla de inicio' }, '.'] },
        { icono: ICONO_LISTO, texto: ['Confirma con ', { fuerte: 'Instalar' }, '.'] }
      ]));
    } else {
      caja.appendChild(crear('p', 'instalar-texto', 'Busca en el menú del navegador la opción Instalar o Añadir a pantalla de inicio.'));
    }
  }

  function contenidoOrdenador(caja) {
    if (ofertaChrome) {
      caja.appendChild(crear('p', 'instalar-texto', 'Backline está pensada para el móvil, pero también puedes instalarla en este ordenador.'));
      caja.appendChild(boton('Instalar Backline', 'boton', instalarConChrome));
      return;
    }
    caja.appendChild(crear('p', 'instalar-texto', 'Backline está pensada para el móvil. Abre este enlace en tu móvil y desde allí podrás instalarla.'));
    copiarEnlace(caja, 'el navegador del móvil');
  }

  function instalarConChrome() {
    var oferta = ofertaChrome;
    if (!oferta) return;
    // Chrome solo deja usar la oferta una vez.
    ofertaChrome = null;
    oferta.prompt();
    oferta.userChoice.then(function (r) {
      if (r && r.outcome === 'accepted') {
        yaInstalada = true;
        escribir({ instalada: Date.now() });
      }
      if (fondo) pintar();
    }).catch(function () { if (fondo) pintar(); });
  }

  // ---------- El recuadro ----------

  function pintar() {
    var hoja = fondo.querySelector('.instalar-hoja');
    var cuerpo = hoja.querySelector('.instalar-cuerpo');
    cuerpo.textContent = '';
    if (instalada() || yaInstalada) contenidoInstalada(cuerpo);
    else if (dentroDeOtraApp()) contenidoOtraApp(cuerpo);
    else if (esIphone()) contenidoIphone(cuerpo);
    else if (esAndroid()) contenidoAndroid(cuerpo);
    else contenidoOrdenador(cuerpo);
  }

  function alPulsarTecla(e) {
    if (e.key === 'Escape') cerrar();
  }

  function mostrar() {
    if (fondo) return;
    fondo = crear('div', 'instalar-fondo');
    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });

    var hoja = crear('div', 'instalar-hoja');
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', 'instalar-titulo');
    hoja.tabIndex = -1;

    var cerrarX = boton('×', 'instalar-cerrar', cerrar);
    cerrarX.setAttribute('aria-label', 'Cerrar');
    hoja.appendChild(cerrarX);

    var cabecera = crear('div', 'instalar-cabecera');
    var icono = crear('img', 'instalar-icono');
    icono.src = 'icono-192.png';
    icono.alt = '';
    icono.width = 56;
    icono.height = 56;
    cabecera.appendChild(icono);
    var titulo = crear('h2', 'instalar-titulo', 'Instala Backline en tu móvil');
    titulo.id = 'instalar-titulo';
    cabecera.appendChild(titulo);
    hoja.appendChild(cabecera);

    hoja.appendChild(crear('div', 'instalar-cuerpo'));
    hoja.appendChild(boton('Ahora no', 'boton-texto instalar-ahora-no', cerrar));

    fondo.appendChild(hoja);
    document.body.appendChild(fondo);
    document.addEventListener('keydown', alPulsarTecla);
    pintar();
    // Se deja un instante para que se vea la animación de entrada.
    requestAnimationFrame(function () {
      fondo.classList.add('visible');
      hoja.focus();
    });
  }

  function cerrar() {
    if (!fondo) return;
    var f = fondo;
    fondo = null;
    document.removeEventListener('keydown', alPulsarTecla);
    var datos = leer();
    if (!datos.instalada) escribir({ descartado: Date.now() });
    f.classList.remove('visible');
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 250);
  }

  // Al entrar: solo en el móvil, si no está instalada y no se cerró hace poco.
  function alEntrar() {
    if (!esMovil() || instalada() || yaInstalada) return;
    var datos = leer();
    if (datos.instalada || descartadoHacePoco()) return;
    mostrar();
  }

  window.Instalar = {
    alEntrar: alEntrar,
    mostrar: mostrar,
    instalada: function () { return instalada(); }
  };
})();
