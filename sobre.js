// Backline — pantalla «Sobre Backline» (#/sobre).
//
// Quién está detrás, cómo funciona, contacto (lo piden las tiendas), enlaces a
// la privacidad y las condiciones, y un apartado discreto para apoyar el
// proyecto. Ese apartado solo se ve cuando APOYO.activo es true: hasta que
// estén listos los pagos (en la web, un enlace a una página de aportaciones;
// en las apps de las tiendas, la compra integrada de Apple o Google).
//
// Orden que usa el resto de la app:
//   Sobre.pintar(contenedor, irAlApoyo)
//   Sobre.tarjetaInicio(numeroSeguidos) -> tarjeta discreta para Inicio, o null

(function () {
  'use strict';

  var CONTACTO = 'hibackline@gmail.com';
  var APOYO = {
    activo: false,
    // Página de aportaciones para la web (Ko-fi, PayPal…). Vacío: sin enlace.
    enlace: '',
    importes: [2, 5, 10]
  };

  function crear(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function seccion(contenedor, titulo) {
    var s = crear('section', 'sobre-seccion');
    if (titulo) s.appendChild(crear('h2', 'sobre-titulo', titulo));
    contenedor.appendChild(s);
    return s;
  }

  // ---------- Tarjeta discreta en Inicio ----------
  // Solo si el apoyo está activo, si sigue al menos 3 grupos y si no ha
  // pulsado «No, gracias» en este móvil (entonces no vuelve a salir nunca).
  var CLAVE_OCULTO = 'backline.apoyo.oculto';
  var MINIMO_GRUPOS = 3;

  function oculta() {
    try { return localStorage.getItem(CLAVE_OCULTO) === '1'; } catch (e) { return false; }
  }

  function tarjetaInicio(numeroSeguidos) {
    if (!APOYO.activo || numeroSeguidos < MINIMO_GRUPOS || oculta()) return null;
    var li = crear('li', 'tarjeta-apoyo');
    var texto = crear('p', 'tarjeta-apoyo-texto');
    texto.appendChild(crear('strong', null, 'Backline es gratis y sin publicidad. '));
    texto.appendChild(document.createTextNode('Si te resulta útil, puedes apoyarla con una aportación.'));
    li.appendChild(texto);
    var botones = crear('div', 'tarjeta-apoyo-botones');
    var apoyar = crear('a', 'boton-secundario boton-pequeno', 'Apoyar');
    apoyar.href = '#/sobre/apoyo';
    var no = crear('button', 'boton-texto', 'No, gracias');
    no.type = 'button';
    no.addEventListener('click', function () {
      try { localStorage.setItem(CLAVE_OCULTO, '1'); } catch (e) { /* sin memoria: volverá a salir */ }
      if (li.parentNode) li.parentNode.removeChild(li);
    });
    botones.appendChild(apoyar);
    botones.appendChild(no);
    li.appendChild(botones);
    return li;
  }

  function pintar(contenedor, irAlApoyo) {
    contenedor.textContent = '';

    var cabecera = crear('div', 'sobre-cabecera');
    var logo = document.createElement('img');
    logo.src = 'logo.svg';
    logo.alt = 'Backline';
    logo.className = 'sobre-logo';
    cabecera.appendChild(logo);
    cabecera.appendChild(crear('p', 'sobre-lema', 'El backstage de tus grupos favoritos'));
    contenedor.appendChild(cabecera);

    var historia = seccion(contenedor, 'Por qué nace');
    historia.appendChild(crear('p', null, 'Soy Ignacio Bernaola, crítico en DPRP.net y asiduo de esta escena, en sala y en disco. Seguir a los grupos que me interesan me obligaba a ir de web en web, y más de una vez supe de un concierto cuando ya había pasado.'));
    historia.appendChild(crear('p', null, 'Backline nace de ahí: reunir la actividad de la escena independiente en un único lugar, directo y sin ruido. Lo que el grupo publica, tú lo ves. Nada más.'));

    var como = seccion(contenedor, 'Cómo funciona');
    var ul = crear('ul', 'sobre-lista');
    [
      'Sigue a los grupos que te gusten: sus conciertos, discos, vídeos y noticias te aparecen en Inicio.',
      'Activa los avisos y te llegará una notificación cuando publiquen algo. Nunca de noche.',
      'Cada disco lleva a Bandcamp, Spotify, Apple Music o la web del grupo, donde se escucha y se compra.',
      'Los grupos publican ellos mismos desde su panel. Solo lo que publican: sin publicidad y sin algoritmos.'
    ].forEach(function (t) { ul.appendChild(crear('li', null, t)); });
    como.appendChild(ul);

    if (APOYO.activo) {
      var apoyo = seccion(contenedor, 'Apoya el proyecto');
      apoyo.classList.add('sobre-apoyo');
      apoyo.appendChild(crear('p', null, 'Backline es gratis y lo seguirá siendo, para fans y para grupos. Si te resulta útil y quieres ayudar a mantenerla, puedes hacer una aportación de una sola vez.'));
      var importes = crear('div', 'sobre-importes');
      APOYO.importes.forEach(function (n) {
        var b = crear('a', 'boton-secundario sobre-importe', n + ' €');
        b.href = APOYO.enlace || '#/sobre';
        if (APOYO.enlace) { b.target = '_blank'; b.rel = 'noopener'; }
        importes.appendChild(b);
      });
      apoyo.appendChild(importes);
      apoyo.appendChild(crear('p', 'campo-nota', 'Gracias. No cambia nada en la app: es solo una forma de echar una mano.'));
    }

    if (irAlApoyo) {
      var destino = contenedor.querySelector('.sobre-apoyo');
      if (destino) setTimeout(function () { destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    }

    var contacto = seccion(contenedor, 'Contacto');
    var p = crear('p');
    p.appendChild(document.createTextNode('¿Una sugerencia, un error, un grupo que falta? Escribe a '));
    var mail = crear('a', null, CONTACTO);
    mail.href = 'mailto:' + CONTACTO;
    p.appendChild(mail);
    p.appendChild(document.createTextNode('.'));
    contacto.appendChild(p);
    contacto.appendChild(crear('p', 'campo-nota', 'Si ves algo inapropiado en una publicación, usa «Denunciar esta publicación», al final de cada concierto, disco, vídeo o noticia.'));

    var legal = crear('p', 'sobre-legal');
    var priv = crear('a', null, 'Privacidad');
    priv.href = 'privacidad.html';
    var cond = crear('a', null, 'Condiciones de uso');
    cond.href = 'condiciones.html';
    legal.appendChild(priv);
    legal.appendChild(crear('span', 'pie-separador', '·'));
    legal.appendChild(cond);
    contenedor.appendChild(legal);
  }

  window.Sobre = { pintar: pintar, tarjetaInicio: tarjetaInicio, APOYO: APOYO };
})();
