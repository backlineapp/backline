// backline — Kit para grupos (#/kit/<id-del-grupo>).
//
// Página para que cada grupo ponga Backline en su Bandcamp, su web o sus
// redes sin leer instrucciones: su enlace, las insignias de la carpeta kit/
// con su código y los textos para compartir, todo listo para copiar.
// No sale en las pestañas de abajo: se llega por enlace (o desde "Mi panel").
// Si el grupo no existe, deja elegirlo en un buscador.

(function () {
  'use strict';

  // Dirección pública de la app: los enlaces y las imágenes que se copian
  // salen siempre de aquí, se abra el kit desde donde se abra.
  var DIRECCION = 'https://backlineapp.github.io/backline/';

  // Insignias de la carpeta kit/ (los PNG funcionan en cualquier web).
  var INSIGNIAS = [
    { nombre: 'Fondo oscuro', archivo: 'backline_siguenos_oscuro.png', clase: 'kit-insignia-oscura' },
    { nombre: 'Fondo claro', archivo: 'backline_siguenos_claro.png', clase: 'kit-insignia-clara' }
  ];

  // Textos para compartir en redes. El enlace del grupo va al final.
  var TEXTOS = [
    { nombre: 'Texto corto', texto: 'Ya estamos en Backline: nuestros conciertos, discos y novedades, directos a tu móvil. Sin publicidad y sin algoritmos. → ' },
    { nombre: 'Texto largo', texto: 'Si quieres enterarte de nuestros conciertos y discos sin perderte nada entre tanto ruido, síguenos en Backline: una app gratuita, sin publicidad y sin algoritmos, hecha para la escena independiente. Te llega un aviso cuando publicamos algo. → ' }
  ];

  // Imágenes para compartir (con el logo y el nombre del grupo), hechas en el
  // propio móvil al abrir el kit.
  var FORMATOS = [
    { nombre: 'Cuadrada', archivo: 'cuadrada', ancho: 1080, alto: 1080 },
    { nombre: 'Vertical', archivo: 'vertical', ancho: 1080, alto: 1920 }
  ];

  var ayuda = null;
  var mensajeCorto = null;
  var tiempoMensaje = 0;

  function iniciar(piezas) { ayuda = piezas; }

  function crear(etiqueta, clase, texto) { return ayuda.crear(etiqueta, clase, texto); }

  function boton(texto, clase, alPulsar) {
    var b = crear('button', clase, texto);
    b.type = 'button';
    b.addEventListener('click', alPulsar);
    return b;
  }

  function enlaceFicha(grupo) {
    return DIRECCION + '#/grupo/' + encodeURIComponent(grupo.id);
  }

  function codigoInsignia(grupo, insignia) {
    return '<a href="' + enlaceFicha(grupo) + '" target="_blank" rel="noopener">' +
      '<img src="' + DIRECCION + 'kit/' + insignia.archivo + '" alt="Síguenos en Backline" width="270" height="84">' +
      '</a>';
  }

  // ---------- Copiar ----------

  // Mensaje breve que aparece abajo unos segundos ("Copiado").
  function avisoBreve(texto) {
    if (!mensajeCorto) {
      mensajeCorto = crear('p', 'aviso-breve');
      mensajeCorto.setAttribute('role', 'status');
      document.body.appendChild(mensajeCorto);
    }
    mensajeCorto.textContent = texto;
    mensajeCorto.classList.add('visible');
    clearTimeout(tiempoMensaje);
    tiempoMensaje = setTimeout(function () { mensajeCorto.classList.remove('visible'); }, 2000);
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

  function botonCopiar(texto, etiqueta) {
    return boton(etiqueta || 'Copiar', 'boton kit-boton', function () {
      copiar(texto).then(function () {
        avisoBreve('Copiado');
      }, function () {
        avisoBreve('No se ha podido copiar. Selecciona el texto y cópialo a mano.');
      });
    });
  }

  // Recuadro con el texto a la vista (se puede seleccionar a mano).
  function recuadro(texto, clase) {
    return crear('p', 'kit-texto' + (clase ? ' ' + clase : ''), texto);
  }

  function bloque(contenedor, titulo, explicacion) {
    var b = crear('section', 'kit-bloque');
    b.appendChild(crear('h2', 'kit-bloque-titulo', titulo));
    if (explicacion) b.appendChild(crear('p', 'formulario-texto', explicacion));
    contenedor.appendChild(b);
    return b;
  }

  function filaBotones(caja) {
    var fila = crear('div', 'kit-botones');
    caja.appendChild(fila);
    return fila;
  }

  // ---------- Pantalla ----------

  // grupoId: lo que viene en la dirección. desdePanel: si se llega desde "Mi panel".
  function pintar(contenedor, grupoId, desdePanel) {
    contenedor.textContent = '';
    var grupo = grupoId ? ayuda.grupoPorId(grupoId) : null;

    if (desdePanel) {
      var volver = crear('a', 'volver', '← Mi panel');
      volver.href = '#/panel';
      contenedor.appendChild(volver);
    }

    if (!grupo) {
      pintarBuscador(contenedor, grupoId);
      return grupo;
    }

    var t = crear('div', 'titular');
    t.appendChild(crear('h1', null, 'Kit de ' + grupo.nombre + ' para Backline'));
    t.appendChild(crear('p', null, 'Todo listo para copiar y pegar en vuestro Bandcamp, vuestra web y vuestras redes.'));
    contenedor.appendChild(t);

    var enlace = enlaceFicha(grupo);

    // Enlace a la ficha
    var b1 = bloque(contenedor, 'Vuestro enlace', 'Lleva directamente a la ficha de ' + grupo.nombre + ' en Backline.');
    b1.appendChild(recuadro(enlace, 'kit-enlace'));
    filaBotones(b1).appendChild(botonCopiar(enlace));

    // Bandcamp
    var b2 = bloque(contenedor, 'Bandcamp', null);
    var pasos = crear('ol', 'kit-pasos');
    [
      'Entrad en Bandcamp con la cuenta del grupo y abrid vuestra página.',
      'Entrad en la edición del perfil y buscad la zona de enlaces (links), donde ya tenéis vuestro Spotify, vuestra web, etc.',
      'Añadid uno nuevo con el nombre «Backline», pegad el enlace y guardad.'
    ].forEach(function (p) { pasos.appendChild(crear('li', null, p)); });
    b2.appendChild(pasos);
    b2.appendChild(recuadro(enlace, 'kit-enlace'));
    filaBotones(b2).appendChild(botonCopiar(enlace, 'Copiar enlace'));
    b2.appendChild(crear('p', 'formulario-texto kit-nota',
      '¿Usáis Linktree u otra página con todos vuestros enlaces? Añadid uno nuevo llamado «Backline» con este mismo enlace.'));

    // Web
    var b3 = bloque(contenedor, 'Vuestra web', 'Elegid la insignia que mejor quede con vuestra web. Descargad la imagen o copiad el código y pegadlo donde queráis que aparezca: ya lleva vuestro enlace.');
    INSIGNIAS.forEach(function (ins) {
      var caja = crear('div', 'kit-insignia ' + ins.clase);
      caja.appendChild(crear('p', 'kit-insignia-nombre', ins.nombre));
      var marco = crear('div', 'kit-insignia-marco');
      var img = crear('img');
      img.src = 'kit/' + ins.archivo;
      img.alt = 'Síguenos en Backline (' + ins.nombre.toLowerCase() + ')';
      img.width = 270;
      img.height = 84;
      marco.appendChild(img);
      caja.appendChild(marco);
      var codigo = codigoInsignia(grupo, ins);
      caja.appendChild(recuadro(codigo, 'kit-codigo'));
      var fila = filaBotones(caja);
      var descargar = crear('a', 'boton-secundario kit-boton', 'Descargar');
      descargar.href = 'kit/' + ins.archivo;
      descargar.setAttribute('download', ins.archivo);
      fila.appendChild(descargar);
      fila.appendChild(botonCopiar(codigo, 'Copiar código'));
      b3.appendChild(caja);
    });

    // Imagen para compartir
    var b5 = bloque(contenedor, 'Imagen para compartir', 'Con el logo de Backline y vuestro nombre. Descargadla y usadla donde queráis.');
    FORMATOS.forEach(function (f) {
      var caja = crear('div', 'kit-insignia kit-imagen');
      caja.appendChild(crear('p', 'kit-insignia-nombre', f.nombre));
      var marco = crear('div', 'kit-imagen-marco');
      var img = crear('img');
      img.alt = 'Imagen ' + f.nombre.toLowerCase() + ': ' + grupo.nombre + ' ya está en Backline';
      img.width = f.ancho;
      img.height = f.alto;
      marco.appendChild(img);
      caja.appendChild(marco);
      var descargar = crear('a', 'boton kit-boton', 'Descargar');
      descargar.setAttribute('download', 'backline-' + grupo.id + '-' + f.archivo + '.png');
      descargar.hidden = true;
      filaBotones(caja).appendChild(descargar);
      caja.appendChild(crear('p', 'formulario-texto kit-nota', 'Si no se descarga, mantened pulsada la imagen y guardadla.'));
      b5.appendChild(caja);
      dibujarImagen(grupo, f).then(function (url) {
        img.src = url;
        descargar.href = url;
        descargar.hidden = false;
      }, function () {
        caja.hidden = true;
      });
    });

    // Redes
    var b4 = bloque(contenedor, 'Redes', 'Dos textos para anunciarlo, ya con vuestro enlace. Copiad el que os guste y pegadlo en vuestra publicación.');
    TEXTOS.forEach(function (tx) {
      var caja = crear('div', 'kit-red');
      caja.appendChild(crear('p', 'kit-insignia-nombre', tx.nombre));
      var completo = tx.texto + enlace;
      caja.appendChild(recuadro(completo));
      filaBotones(caja).appendChild(botonCopiar(completo));
      b4.appendChild(caja);
    });

    var ficha = crear('a', 'boton-texto kit-ver-ficha', 'Ver la ficha de ' + grupo.nombre + ' →');
    ficha.href = '#/grupo/' + encodeURIComponent(grupo.id);
    contenedor.appendChild(ficha);
    return grupo;
  }

  // ---------- Imagen para compartir ----------

  function cargarLogo() {
    return new Promise(function (resolver, rechazar) {
      var logo = new Image();
      logo.onload = function () { resolver(logo); };
      logo.onerror = rechazar;
      logo.src = 'logo.svg';
    });
  }

  function cargarLetras() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 100px "Space Grotesk"'),
      document.fonts.load('600 40px "Inter"')
    ]).catch(function () {});
  }

  // Parte el nombre en líneas que quepan en el ancho (como mucho 3).
  function lineasNombre(ctx, nombre, ancho, tamano) {
    ctx.font = '700 ' + tamano + 'px "Space Grotesk", sans-serif';
    var palabras = String(nombre).split(/\s+/);
    var lineas = [];
    var actual = '';
    palabras.forEach(function (p) {
      var prueba = actual ? actual + ' ' + p : p;
      if (actual && ctx.measureText(prueba).width > ancho) {
        lineas.push(actual);
        actual = p;
      } else {
        actual = prueba;
      }
    });
    if (actual) lineas.push(actual);
    var cabe = lineas.length <= 3 && lineas.every(function (l) { return ctx.measureText(l).width <= ancho; });
    return cabe ? lineas : null;
  }

  function dibujarImagen(grupo, f) {
    return Promise.all([cargarLogo(), cargarLetras()]).then(function (r) {
      var logo = r[0];
      var lienzo = document.createElement('canvas');
      lienzo.width = f.ancho;
      lienzo.height = f.alto;
      var ctx = lienzo.getContext('2d');
      var W = f.ancho;
      var H = f.alto;
      var margen = 90;

      // Fondo de noche de concierto, con un poco de luz arriba.
      ctx.fillStyle = '#0B0E13';
      ctx.fillRect(0, 0, W, H);
      var luz = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.8);
      luz.addColorStop(0, 'rgba(232, 161, 58, 0.16)');
      luz.addColorStop(1, 'rgba(232, 161, 58, 0)');
      ctx.fillStyle = luz;
      ctx.fillRect(0, 0, W, H);

      // Nombre del grupo: lo más grande que quepa.
      var tamano = 130;
      var lineas = null;
      while (tamano >= 48 && !(lineas = lineasNombre(ctx, grupo.nombre, W - margen * 2, tamano))) tamano -= 6;
      if (!lineas) { tamano = 48; lineas = [grupo.nombre]; }
      var alturaLinea = tamano * 1.08;

      var anchoLogo = Math.min(720, W - margen * 2);
      var altoLogo = anchoLogo * 141 / 690;
      var separa = f.alto > f.ancho ? 110 : 70;

      // Altura total del bloque, para centrarlo en vertical.
      var total = lineas.length * alturaLinea + 40 + 44 + separa + altoLogo + 40 + 40;
      var y = (H - total) / 2;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#EAEEF4';
      ctx.font = '700 ' + tamano + 'px "Space Grotesk", sans-serif';
      lineas.forEach(function (l) {
        ctx.fillText(l, W / 2, y);
        y += alturaLinea;
      });

      y += 40;
      ctx.fillStyle = '#4FC4D6';
      ctx.font = '600 40px "Inter", sans-serif';
      ctx.fillText('ya está en', W / 2, y);
      y += 44 + separa;

      ctx.drawImage(logo, (W - anchoLogo) / 2, y, anchoLogo, altoLogo);
      y += altoLogo + 40;

      ctx.fillStyle = '#E8A13A';
      ctx.font = '600 40px "Inter", sans-serif';
      ctx.fillText('El backstage de tus grupos favoritos', W / 2, y);

      // Dirección abajo, discreta.
      ctx.fillStyle = 'rgba(234, 238, 244, 0.6)';
      ctx.font = '600 34px "Inter", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('backlineapp.github.io/backline', W / 2, H - 70);

      return lienzo.toDataURL('image/png');
    });
  }

  // El grupo de la dirección no existe (o no viene): se elige en un buscador.
  function pintarBuscador(contenedor, grupoId) {
    var t = crear('div', 'titular');
    t.appendChild(crear('h1', null, 'Kit para grupos'));
    t.appendChild(crear('p', null, grupoId
      ? 'No encontramos ese grupo. Búscalo por su nombre para ver su kit.'
      : 'Busca tu grupo por su nombre para ver su kit.'));
    contenedor.appendChild(t);

    var caja = crear('div', 'buscador');
    var entrada = crear('input');
    entrada.type = 'search';
    entrada.placeholder = 'Buscar grupo por nombre';
    entrada.autocomplete = 'off';
    entrada.setAttribute('aria-label', 'Buscar grupo por nombre');
    caja.appendChild(entrada);
    contenedor.appendChild(caja);

    var lista = crear('ul', 'lista kit-lista');
    contenedor.appendChild(lista);

    function sinTildes(s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }

    function pintarLista() {
      var busqueda = sinTildes(entrada.value);
      lista.textContent = '';
      var visibles = ayuda.todosLosGrupos().filter(function (g) {
        return !busqueda || sinTildes(g.nombre).indexOf(busqueda) !== -1;
      });
      if (!visibles.length) {
        lista.appendChild(crear('li', 'vacio', 'No hay grupos que coincidan.'));
        return;
      }
      visibles.forEach(function (g) {
        var li = crear('li');
        var a = crear('a', 'tarjeta ' + (g._acento || ''));
        a.href = '#/kit/' + encodeURIComponent(g.id);
        var texto = crear('div', 'tarjeta-texto');
        texto.appendChild(crear('h3', 'tarjeta-nombre', g.nombre));
        texto.appendChild(crear('p', 'tarjeta-detalle', [g.estilos, g.ciudad].filter(Boolean).join(' · ')));
        a.appendChild(texto);
        var flecha = crear('span', 'flecha', '›');
        flecha.setAttribute('aria-hidden', 'true');
        a.appendChild(flecha);
        li.appendChild(a);
        lista.appendChild(li);
      });
    }

    entrada.addEventListener('input', pintarLista);
    pintarLista();
  }

  window.Kit = {
    iniciar: iniciar,
    pintar: pintar
  };
})();
