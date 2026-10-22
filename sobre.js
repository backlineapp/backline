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

(function () {
  'use strict';

  var CONTACTO = 'hibackline@gmail.com';
  var APOYO = {
    activo: false,
    // Página de aportaciones para la web. En Ko-fi cada uno elige el importe
    // y paga con tarjeta, PayPal, Apple Pay o Google Pay. (En las apps de las
    // tiendas no se usará: Apple y Google obligan a usar su propio pago.)
    enlace: 'https://ko-fi.com/backlineapp'
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
      var b = crear('a', 'boton boton-ancho', 'Apoyar en Ko-fi ↗');
      b.href = APOYO.enlace;
      b.target = '_blank';
      b.rel = 'noopener';
      apoyo.appendChild(b);
      apoyo.appendChild(crear('p', 'campo-nota', 'Eliges el importe y pagas con tarjeta, PayPal, Apple Pay o Google Pay en Ko-fi. Backline no ve tus datos de pago. Gracias: no cambia nada en la app, es solo una forma de echar una mano.'));
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

  window.Sobre = { pintar: pintar, APOYO: APOYO };
})();
