// backline — discos, vídeos y noticias que publican los grupos desde "Mi panel".
// Casillas para Inicio y la ficha, apartado "Novedades" de la ficha y
// pantalla de una novedad (se ve completa dentro de la app; el enlace
// externo va en un botón).
// Los datos los trae nube.js; las piezas comunes (crear, enlaces...) las pasa
// app.js al arrancar con Novedades.iniciar(...).
//
// Vídeos: de YouTube se saca la miniatura sola y se ven con el reproductor
// sin cookies (youtube-nocookie.com); de Vimeo, una tarjeta con el título
// (Vimeo no da la miniatura sin preguntar a su servidor) y su reproductor
// sin seguimiento (dnt=1).

(function () {
  'use strict';

  // Límites de texto (los mismos que comprueba supabase/6-novedades.sql).
  var MAX_TEXTO_NOTICIA = 1000;
  var MAX_TEXTO_CORTO = 300;
  var MAX_TITULO = 200;

  // Servicios para escuchar un disco, por el nombre del sitio del enlace.
  var SERVICIOS = [
    { nombre: 'Bandcamp', patron: /(^|\.)bandcamp\.com$/ },
    { nombre: 'Spotify', patron: /(^|\.)(spotify\.com|spotify\.link)$/ },
    { nombre: 'Apple Music', patron: /(^|\.)music\.apple\.com$/ },
    { nombre: 'YouTube', patron: /(^|\.)(youtube\.com|youtu\.be)$/ }
  ];

  var TIPOS = { disco: 'Disco', single: 'Single', video: 'Vídeo', noticia: 'Noticia' };

  var ayuda = null;

  function iniciar(piezas) { ayuda = piezas; }

  function crear(etiqueta, clase, texto) { return ayuda.crear(etiqueta, clase, texto); }

  function sitio(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
  }

  // ---------- Enlaces ----------

  // Si se pega "grupo.bandcamp.com/album/x" sin "https://", se le pone.
  function completarEnlace(texto) {
    var t = String(texto || '').trim();
    if (t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(t)) t = 'https://' + t;
    return t;
  }

  // "Bandcamp", "Spotify"... o '' si es otra web.
  function servicioMusica(url) {
    var s = sitio(url);
    for (var i = 0; i < SERVICIOS.length; i++) if (SERVICIOS[i].patron.test(s)) return SERVICIOS[i].nombre;
    return '';
  }

  // Datos de un vídeo de YouTube o Vimeo, o null si el enlace no es de ninguno.
  // { servicio, id, miniatura, reproductor, enlace }
  function datosVideo(url) {
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    var s = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    var partes = u.pathname.split('/').filter(Boolean);
    var id = '';

    if (s === 'youtu.be') id = partes[0] || '';
    else if (s === 'youtube.com' || s === 'music.youtube.com' || s === 'youtube-nocookie.com') {
      if (partes[0] === 'watch') id = u.searchParams.get('v') || '';
      else if (/^(shorts|embed|live|v)$/.test(partes[0] || '')) id = partes[1] || '';
    }
    if (id) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
      return {
        servicio: 'YouTube',
        id: id,
        miniatura: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        reproductor: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0',
        enlace: 'https://www.youtube.com/watch?v=' + id
      };
    }

    if (s === 'vimeo.com' || s === 'player.vimeo.com') {
      // vimeo.com/123, vimeo.com/123/abcdef (oculto), vimeo.com/channels/x/123,
      // player.vimeo.com/video/123?h=abcdef
      var numero = '';
      var clave = u.searchParams.get('h') || '';
      for (var i = 0; i < partes.length; i++) {
        if (/^\d{4,12}$/.test(partes[i])) {
          numero = partes[i];
          if (!clave && /^[0-9a-f]{6,20}$/i.test(partes[i + 1] || '')) clave = partes[i + 1];
          break;
        }
      }
      if (!numero) return null;
      return {
        servicio: 'Vimeo',
        id: numero,
        miniatura: '',
        reproductor: 'https://player.vimeo.com/video/' + numero + '?dnt=1' + (/^[0-9a-f]+$/i.test(clave) ? '&h=' + clave : ''),
        enlace: 'https://vimeo.com/' + numero + (/^[0-9a-f]+$/i.test(clave) ? '/' + clave : '')
      };
    }
    return null;
  }

  // ---------- Fechas ----------

  // Día de Madrid de un instante ("2026-10-19T08:00:00+00:00" -> "2026-10-19").
  function diaMadrid(iso) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(iso));
  }

  function hoy() { return diaMadrid(new Date().toISOString()); }

  function formatoDia(dia, opciones) {
    var p = dia.split('-');
    opciones.timeZone = 'UTC';
    return new Intl.DateTimeFormat('es-ES', opciones).format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)));
  }

  // "19 oct 2026"
  function diaCorto(dia) {
    return formatoDia(dia, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/ de /g, ' ');
  }

  // Día que cuenta de cada publicación: la fecha de salida de un disco; el
  // día en que se publicó un vídeo o una noticia.
  function diaDe(pub) {
    return pub.tipo === 'disco' ? (pub.salida || '') : (pub.creado ? diaMadrid(pub.creado) : '');
  }

  // Para ordenar con lo más reciente arriba: la fecha de salida de un disco;
  // el momento exacto en que se publicó un vídeo o una noticia.
  function claveOrden(pub) {
    return pub.tipo === 'disco' ? (pub.salida || '') : (pub.creado || '');
  }

  // "Disco", "Single", "Vídeo" o "Noticia"
  function nombreTipo(pub) {
    return pub.tipo === 'disco' ? TIPOS[pub.formato === 'single' ? 'single' : 'disco'] : TIPOS[pub.tipo] || '';
  }

  // "Disco · 14 nov 2026" (o "Sale el 14 nov 2026" si aún no ha salido).
  function resumen(pub) {
    var dia = diaDe(pub);
    if (!dia) return nombreTipo(pub);
    if (pub.tipo === 'disco' && dia > hoy()) return nombreTipo(pub) + ' · sale el ' + diaCorto(dia);
    return nombreTipo(pub) + ' · ' + diaCorto(dia);
  }

  // ---------- Imágenes ----------

  function img(src, clase, alt, alFallar) {
    var i = document.createElement('img');
    i.className = clase || '';
    i.alt = alt || '';
    i.decoding = 'async';
    i.loading = 'lazy';
    i.referrerPolicy = 'no-referrer';
    i.src = src;
    if (alFallar) i.addEventListener('error', function () {
      if (i.parentNode) i.parentNode.replaceChild(alFallar(), i);
    });
    return i;
  }

  // Tarjeta oscura con un texto (vídeo de Vimeo o noticia sin imagen).
  function tarjetaTexto(clase, marca, texto) {
    var caja = crear('div', 'portada novedad-tarjeta ' + clase);
    if (marca) caja.appendChild(crear('span', 'novedad-tarjeta-marca', marca));
    caja.appendChild(crear('span', 'novedad-tarjeta-texto', texto));
    caja.setAttribute('aria-hidden', 'true');
    return caja;
  }

  function nota() {
    var n = crear('div', 'portada iniciales nota', '♪');
    n.setAttribute('aria-hidden', 'true');
    return n;
  }

  // Imagen cuadrada de una novedad para las cuadrículas.
  function portada(pub) {
    var url = Nube.urlCartel(pub.cartel);
    if (pub.tipo === 'video') {
      var v = datosVideo(pub.enlace);
      var marco = crear('div', 'novedad-video');
      // Sin miniatura (Vimeo, o si no carga): tarjeta con el título.
      var sinMiniatura = function () {
        return tarjetaTexto('novedad-vimeo', v && v.servicio === 'Vimeo' ? 'Vimeo' : 'Vídeo', pub.titulo);
      };
      marco.appendChild(url ? img(url, 'portada', '', sinMiniatura)
        : v && v.miniatura ? img(v.miniatura, 'portada', '', sinMiniatura)
        : sinMiniatura());
      var play = crear('span', 'novedad-play', '▶');
      play.setAttribute('aria-hidden', 'true');
      marco.appendChild(play);
      return marco;
    }
    if (pub.tipo === 'noticia') {
      var sinImagen = function () { return tarjetaTexto('novedad-noticia', 'Noticia', pub.texto || pub.titulo); };
      return url ? img(url, 'portada', '', sinImagen) : sinImagen();
    }
    return url ? img(url, 'portada', '', nota) : nota();
  }

  // ---------- Casilla de la cuadrícula (Inicio y ficha) ----------
  // Igual que las de los discos de Bandcamp. Lleva a la pantalla de la novedad.
  // En Inicio (conGrupo) la imagen y el título llevan a la novedad y el nombre
  // del grupo, a su ficha; en la ficha, toda la casilla lleva a la novedad.
  function tarjeta(pub, conGrupo) {
    var grupo = ayuda.grupoPorId(pub.grupo_id);
    if (!grupo) return null;
    var href = '#/novedad/' + encodeURIComponent(pub.id);
    var li = crear('li', 'lanzamiento novedad ' + grupo._acento);
    var caja = li;
    if (!conGrupo) {
      caja = crear('a', 'lanzamiento-enlace');
      caja.href = href;
      li.appendChild(caja);
    }

    var marco = crear(conGrupo ? 'a' : 'div', 'lanzamiento-portada');
    if (conGrupo) {
      marco.href = href;
      marco.setAttribute('aria-label', nombreTipo(pub) + ': ' + pub.titulo + ', de ' + grupo.nombre);
    }
    marco.appendChild(portada(pub));
    caja.appendChild(marco);

    caja.appendChild(crear('div', 'lanzamiento-titulo', pub.titulo));
    if (conGrupo) {
      var g = crear('a', 'lanzamiento-grupo', grupo.nombre);
      g.href = '#/grupo/' + encodeURIComponent(grupo.id);
      caja.appendChild(g);
    }
    caja.appendChild(crear('div', 'lanzamiento-anio', resumen(pub)));
    return li;
  }

  // ---------- Apartado "Novedades" de la ficha (vídeos y noticias) ----------

  function rellenarFicha(contenedor, pubs) {
    contenedor.textContent = '';
    var lista = pubs.filter(function (p) { return p.tipo === 'video' || p.tipo === 'noticia'; })
      .sort(function (a, b) { return claveOrden(b) < claveOrden(a) ? -1 : claveOrden(b) > claveOrden(a) ? 1 : 0; });
    if (!lista.length) return;
    contenedor.appendChild(crear('h2', null, 'Novedades · ' + lista.length));
    var rejilla = crear('ul', 'rejilla');
    lista.forEach(function (p) {
      var t = tarjeta(p, false);
      if (t) rejilla.appendChild(t);
    });
    contenedor.appendChild(rejilla);
  }

  // ---------- Pantalla de una novedad ----------

  var turno = 0;

  function reproductor(v, titulo) {
    var marco = crear('div', 'video-marco');
    var iframe = document.createElement('iframe');
    iframe.src = v.reproductor;
    iframe.title = titulo;
    iframe.loading = 'lazy';
    // YouTube necesita saber desde qué web se ve (si no, da el "error 153").
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    marco.appendChild(iframe);
    return marco;
  }

  function imagenGrande(url, alt, cuadrada) {
    var marco = ayuda.enlaceExterno(url, 'cartel-grande' + (cuadrada ? ' portada-grande' : ''));
    marco.setAttribute('aria-label', 'Ver la imagen a tamaño completo');
    var i = document.createElement('img');
    i.src = url;
    i.alt = alt;
    i.decoding = 'async';
    marco.appendChild(i);
    return marco;
  }

  function pintarDetalle(contenedor, id, alTitular) {
    var mio = ++turno;
    contenedor.textContent = '';
    contenedor.className = 'detalle-novedad';
    contenedor.appendChild(crear('p', 'vacio', 'Cargando…'));

    Nube.novedad(id).then(function (pub) {
      if (mio !== turno) return;
      contenedor.textContent = '';
      var grupo = pub && ayuda.grupoPorId(pub.grupo_id);
      if (!pub || !grupo) {
        contenedor.appendChild(crear('p', 'aviso', 'Esto ya no está publicado.'));
        return;
      }
      contenedor.className = 'detalle-novedad ' + grupo._acento;
      alTitular(grupo.nombre + ' · ' + pub.titulo);

      var url = Nube.urlCartel(pub.cartel);
      var video = pub.tipo === 'video' ? datosVideo(pub.enlace) : null;
      if (video) contenedor.appendChild(reproductor(video, pub.titulo));
      else if (url) contenedor.appendChild(imagenGrande(url, pub.tipo === 'disco' ? 'Portada de ' + pub.titulo : '', pub.tipo === 'disco'));

      var cabecera = ayuda.crear('div', 'concierto-cabecera');
      cabecera.appendChild(crear('p', 'novedad-tipo', resumen(pub)));
      cabecera.appendChild(crear('h1', null, pub.titulo));
      var nombre = crear('a', 'concierto-grupo novedad-grupo', grupo.nombre);
      nombre.href = '#/grupo/' + encodeURIComponent(grupo.id);
      cabecera.appendChild(nombre);
      contenedor.appendChild(cabecera);

      if (pub.texto) contenedor.appendChild(crear('p', 'novedad-texto', pub.texto));

      var acciones = crear('div', 'acciones');
      if (pub.enlace && ayuda.urlPermitida(pub.enlace)) {
        var boton = ayuda.enlaceExterno(video ? video.enlace : pub.enlace, 'boton boton-ancho');
        if (pub.tipo === 'disco') {
          var servicio = servicioMusica(pub.enlace);
          boton.textContent = (servicio ? 'Escuchar en ' + servicio : 'Escuchar en su web') + ' ↗';
        } else if (video) {
          boton.textContent = 'Ver en ' + video.servicio + ' ↗';
          boton.className = 'boton-secundario';
        } else {
          boton.textContent = 'Abrir enlace ↗';
        }
        acciones.appendChild(boton);
        if (pub.tipo === 'noticia') acciones.appendChild(crear('p', 'campo-nota novedad-sitio', sitio(pub.enlace)));
      }
      if (acciones.childNodes.length) contenedor.appendChild(acciones);
      if (window.Denuncias) contenedor.appendChild(Denuncias.enlace(pub.id));
    }, function () {
      if (mio !== turno) return;
      contenedor.textContent = '';
      contenedor.appendChild(crear('p', 'aviso', 'No se ha podido cargar. Revisa la conexión y vuelve a intentarlo.'));
    });
  }

  window.Novedades = {
    iniciar: iniciar,
    MAX_TEXTO_NOTICIA: MAX_TEXTO_NOTICIA,
    MAX_TEXTO_CORTO: MAX_TEXTO_CORTO,
    MAX_TITULO: MAX_TITULO,
    completarEnlace: completarEnlace,
    servicioMusica: servicioMusica,
    datosVideo: datosVideo,
    diaCorto: diaCorto,
    diaDe: diaDe,
    claveOrden: claveOrden,
    nombreTipo: nombreTipo,
    resumen: resumen,
    hoy: hoy,
    tarjeta: tarjeta,
    rellenarFicha: rellenarFicha,
    pintarDetalle: pintarDetalle
  };
})();
