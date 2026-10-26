// backline — conciertos y giras: pestaña Conciertos, apartado de la ficha y
// pantalla de un concierto (cartel, datos, entradas, mapa y calendario).
// Los datos los trae nube.js; las piezas comunes (crear, enlaces...) las pasa
// app.js al arrancar con Conciertos.iniciar(...).
//
// La hora de cada concierto es SIEMPRE la hora local del lugar (la del cartel).
// Cada fecha guarda su zona horaria: península, Baleares, Ceuta y Melilla van
// con la hora de Madrid; Canarias, una hora menos. Fuera de España, cada país
// con la suya (Portugal y Reino Unido, una hora menos que Madrid).

(function () {
  'use strict';

  var CANARIAS = 'Atlantic/Canary';
  var PENINSULA = 'Europe/Madrid';
  var ESPANA = 'España';

  // Provincias (y ciudades autónomas) en el orden en que se muestran.
  var PROVINCIAS = [
    'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila',
    'Badajoz', 'Baleares', 'Barcelona', 'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz',
    'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca',
    'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Jaén',
    'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga',
    'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra',
    'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria',
    'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza'
  ];

  // Países que se sugieren al escribir (se puede escribir cualquier otro).
  var PAISES = [
    'Alemania', 'Andorra', 'Austria', 'Bélgica', 'Dinamarca', 'Eslovenia', 'Finlandia',
    'Francia', 'Grecia', 'Irlanda', 'Islandia', 'Italia', 'Luxemburgo', 'Noruega',
    'Países Bajos', 'Polonia', 'Portugal', 'Reino Unido', 'República Checa', 'Suecia', 'Suiza'
  ];

  // Países con una hora distinta de la de Madrid (escritos sin mayúsculas ni
  // tildes). Cualquier otro país va con la hora de Madrid, que es la de casi
  // toda Europa (Francia, Italia, Alemania...).
  var ZONAS_PAIS = {
    'portugal': 'Europe/Lisbon',
    'reino unido': 'Europe/London',
    'inglaterra': 'Europe/London',
    'escocia': 'Europe/London',
    'gales': 'Europe/London',
    'irlanda del norte': 'Europe/London',
    'irlanda': 'Europe/Dublin',
    'islandia': 'Atlantic/Reykjavik',
    'grecia': 'Europe/Athens',
    'chipre': 'Europe/Athens',
    'bulgaria': 'Europe/Athens',
    'rumania': 'Europe/Athens',
    'finlandia': 'Europe/Helsinki',
    'estonia': 'Europe/Helsinki',
    'letonia': 'Europe/Helsinki',
    'lituania': 'Europe/Helsinki'
  };

  // Duración que se apunta en el calendario.
  var HORAS_EN_CALENDARIO = 3;

  var ayuda = null;

  function iniciar(piezas) { ayuda = piezas; }

  // Sin mayúsculas ni tildes: "España" -> "espana".
  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function esEspana(pais) {
    return !pais || normalizar(pais) === 'espana';
  }

  // País tal como se guarda: con la forma de la lista si coincide
  // ("portugal" -> "Portugal") y, si no, con la primera letra en mayúscula.
  function paisCanonico(texto) {
    texto = String(texto || '').trim().replace(/\s+/g, ' ');
    if (esEspana(texto)) return ESPANA;
    var n = normalizar(texto);
    for (var i = 0; i < PAISES.length; i++) if (normalizar(PAISES[i]) === n) return PAISES[i];
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // País de una fecha. Las fechas antiguas no tenían país y algunas llevaban
  // el país en la provincia ("Francia"): se leen bien igualmente.
  function paisDe(f) {
    if (f && f.pais) return f.pais;
    if (f && f.provincia && PROVINCIAS.indexOf(f.provincia) === -1) return paisCanonico(f.provincia);
    return ESPANA;
  }

  function provinciaDe(f) {
    return f && f.provincia && PROVINCIAS.indexOf(f.provincia) !== -1 ? f.provincia : '';
  }

  function zonaDe(provincia, pais) {
    if (!esEspana(pais)) return ZONAS_PAIS[normalizar(pais)] || PENINSULA;
    return provincia === 'Las Palmas' || provincia === 'Santa Cruz de Tenerife' ? CANARIAS : PENINSULA;
  }

  // ---------- Fechas y horas ----------

  // "2026-10-24" -> Date a mediodía UTC (solo para escribir el día; sin
  // líos de zonas horarias).
  function dia(fecha) {
    var p = fecha.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  }

  function formato(fecha, opciones) {
    opciones.timeZone = 'UTC';
    return new Intl.DateTimeFormat('es-ES', opciones).format(dia(fecha));
  }

  // "sáb 24 oct"
  function fechaCorta(fecha) {
    return formato(fecha, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  }

  // "sábado, 24 de octubre de 2026"
  function fechaLarga(fecha) {
    return formato(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // "Octubre 2026"
  function mes(fecha) {
    var t = formato(fecha, { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // "21:30:00" -> "21:30"
  function hora(h) { return h ? String(h).slice(0, 5) : ''; }

  // "sáb 24 oct · 21:30"
  function cuando(f) {
    return [fechaCorta(f.fecha), hora(f.hora)].filter(Boolean).join(' · ');
  }

  // Minutos que una zona va por delante de UTC en un instante dado.
  function desfase(zona, instante) {
    var partes = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(instante)).forEach(function (p) { partes[p.type] = +p.value; });
    var comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour % 24, partes.minute, partes.second);
    return Math.round((comoUtc - instante) / 60000);
  }

  // Fecha y hora locales de un lugar -> instante exacto (milisegundos UTC).
  // Tiene en cuenta el cambio de hora de verano/invierno de esa fecha.
  function instante(fecha, h, zona) {
    var d = fecha.split('-');
    var t = String(h).split(':');
    var aproximado = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1] || 0);
    var resultado = aproximado - desfase(zona, aproximado) * 60000;
    return aproximado - desfase(zona, resultado) * 60000;
  }

  // ---------- Añadir al calendario (archivo .ics) ----------

  function dosCifras(n) { return (n < 10 ? '0' : '') + n; }

  function utcIcs(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + dosCifras(d.getUTCMonth() + 1) + dosCifras(d.getUTCDate()) + 'T' +
      dosCifras(d.getUTCHours()) + dosCifras(d.getUTCMinutes()) + '00Z';
  }

  function textoIcs(t) {
    return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // "Sala Totem, Calle Mayor 5, Villava, Navarra, España" (para el calendario).
  function lugar(f) {
    var pais = paisDe(f);
    var provincia = provinciaDe(f);
    return [f.sala, f.direccion, f.ciudad, provincia !== f.ciudad ? provincia : '', pais].filter(Boolean).join(', ');
  }

  // Texto para el mapa. Con dirección: "Calle Mayor 5, Villava, Navarra,
  // España", sin el nombre de la sala (mezclado con la calle, a veces confunde
  // al mapa). Sin dirección: "Sala Totem, Villava, Navarra, España".
  function destino(f) {
    var pais = paisDe(f);
    var provincia = provinciaDe(f);
    return [f.direccion || f.sala, f.ciudad, provincia !== f.ciudad ? provincia : '', pais].filter(Boolean).join(', ');
  }

  // "Castellón" o, fuera de España, "Lisboa (Portugal)".
  function ciudadConPais(f) {
    var pais = paisDe(f);
    return esEspana(pais) ? f.ciudad : f.ciudad + ' (' + pais + ')';
  }

  // Aclaración de la hora cuando no es la de Madrid: "(hora de Portugal)".
  function notaHora(f) {
    if (f.zona === CANARIAS) return ' (hora de Canarias)';
    var pais = paisDe(f);
    if (!esEspana(pais) && f.zona && f.zona !== PENINSULA) return ' (hora de ' + pais + ')';
    return '';
  }

  function crearIcs(f, grupo) {
    var pub = f.publicacion;
    var lineas = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//backline//conciertos//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + f.id + '@backline',
      'DTSTAMP:' + utcIcs(Date.now())
    ];
    if (f.hora) {
      // Se apunta el instante exacto: el calendario lo muestra en la hora de
      // quien lo mira (un concierto en Canarias a las 21:00 sale a las 22:00
      // en un móvil con hora peninsular, que es la misma hora real).
      var inicio = instante(f.fecha, f.hora, f.zona);
      lineas.push('DTSTART:' + utcIcs(inicio));
      lineas.push('DTEND:' + utcIcs(inicio + HORAS_EN_CALENDARIO * 3600000));
    } else {
      var siguiente = new Date(dia(f.fecha).getTime() + 86400000).toISOString().slice(0, 10);
      lineas.push('DTSTART;VALUE=DATE:' + f.fecha.replace(/-/g, ''));
      lineas.push('DTEND;VALUE=DATE:' + siguiente.replace(/-/g, ''));
    }
    var descripcion = [
      pub.tipo === 'gira' && pub.titulo ? pub.titulo : '',
      f.precio ? 'Precio: ' + f.precio : '',
      f.entradas ? 'Entradas: ' + f.entradas : ''
    ].filter(Boolean).join('\n');
    lineas.push('SUMMARY:' + textoIcs(grupo.nombre + ' en ' + f.sala));
    lineas.push('LOCATION:' + textoIcs(lugar(f)));
    if (descripcion) lineas.push('DESCRIPTION:' + textoIcs(descripcion));
    if (f.entradas) lineas.push('URL:' + f.entradas);
    lineas.push('END:VEVENT', 'END:VCALENDAR');
    return lineas.join('\r\n') + '\r\n';
  }

  function descargarIcs(f, grupo) {
    var archivo = new Blob([crearIcs(f, grupo)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(archivo);
    var a = document.createElement('a');
    a.href = url;
    a.download = (grupo.id + '-' + f.fecha) + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // ---------- Cómo llegar ----------

  function esIphone() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // Abre el mapa con el concierto como DESTINO (la ruta desde donde esté la
  // persona), no como una búsqueda: así el mapa no busca salas con ese nombre
  // cerca de quien mira, sino el sitio del texto completo.
  function urlMapa(f) {
    var d = encodeURIComponent(destino(f));
    return esIphone() ? 'https://maps.apple.com/?daddr=' + d : 'https://www.google.com/maps/dir/?api=1&destination=' + d;
  }

  // ---------- Piezas de pantalla ----------

  function miniatura(f, grupo) {
    var url = Nube.urlCartel(f.publicacion.cartel);
    if (!url) return ayuda.cuadroIniciales(grupo);
    var img = document.createElement('img');
    img.className = 'portada cartel-mini';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = url;
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.replaceChild(ayuda.cuadroIniciales(grupo), img);
    });
    return img;
  }

  // Fila de un concierto: cartel, grupo (si conGrupo), día y hora, sala y ciudad.
  function filaConcierto(f, conGrupo) {
    var grupo = ayuda.grupoPorId(f.publicacion.grupo_id);
    if (!grupo) return null;
    var li = document.createElement('li');
    var a = ayuda.crear('a', 'tarjeta concierto ' + grupo._acento);
    a.href = '#/concierto/' + encodeURIComponent(f.id);
    a.appendChild(miniatura(f, grupo));
    var texto = ayuda.crear('div', 'tarjeta-texto');
    if (conGrupo) texto.appendChild(ayuda.crear('h3', 'tarjeta-nombre', grupo.nombre));
    texto.appendChild(ayuda.crear('p', 'concierto-cuando', cuando(f)));
    texto.appendChild(ayuda.crear('p', 'concierto-donde', f.sala + ' · ' + ciudadConPais(f)));
    if (f.publicacion.tipo === 'gira' && f.publicacion.titulo) {
      texto.appendChild(ayuda.crear('p', 'concierto-gira', f.publicacion.titulo));
    }
    a.appendChild(texto);
    var flecha = ayuda.crear('span', 'flecha', '›');
    flecha.setAttribute('aria-hidden', 'true');
    a.appendChild(flecha);
    li.appendChild(a);
    return li;
  }

  // Lista de conciertos separada por meses.
  function listaPorMeses(fechas, conGrupo) {
    var trozo = document.createDocumentFragment();
    var mesActual = '';
    var ul = null;
    fechas.forEach(function (f) {
      var fila = filaConcierto(f, conGrupo);
      if (!fila) return;
      var m = mes(f.fecha);
      if (m !== mesActual) {
        mesActual = m;
        trozo.appendChild(ayuda.crear('p', 'etiqueta-seccion', m));
        ul = ayuda.crear('ul', 'lista');
        trozo.appendChild(ul);
      }
      ul.appendChild(fila);
    });
    return trozo;
  }

  // ---------- Casilla de la cuadrícula de Inicio ----------
  // Un concierto (o una gira, con su próxima fecha) como los discos: el cartel
  // (o una tarjeta con la sala, si no tiene) y el título llevan al concierto;
  // el nombre, a la ficha del grupo. "cuantas" son las fechas que le quedan.
  function casilla(f, cuantas) {
    var grupo = ayuda.grupoPorId(f.publicacion.grupo_id);
    if (!grupo) return null;
    var gira = f.publicacion.tipo === 'gira';
    var href = '#/concierto/' + encodeURIComponent(f.id);
    var titulo = gira && f.publicacion.titulo ? f.publicacion.titulo : f.sala + ' · ' + ciudadConPais(f);
    var li = ayuda.crear('li', 'lanzamiento ' + grupo._acento);

    var marco = ayuda.crear('a', 'lanzamiento-portada');
    marco.href = href;
    marco.setAttribute('aria-label', (gira ? 'Gira' : 'Concierto') + ': ' + titulo + ', de ' + grupo.nombre);
    var sinCartel = function () {
      var caja = ayuda.crear('div', 'portada novedad-tarjeta');
      caja.appendChild(ayuda.crear('span', 'novedad-tarjeta-marca', gira ? 'Gira' : 'Concierto'));
      caja.appendChild(ayuda.crear('span', 'novedad-tarjeta-texto', f.sala + ' · ' + f.ciudad));
      caja.setAttribute('aria-hidden', 'true');
      return caja;
    };
    var url = Nube.urlCartel(f.publicacion.cartel);
    if (url) {
      var img = document.createElement('img');
      img.className = 'portada cartel-mini';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = url;
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.replaceChild(sinCartel(), img);
      });
      marco.appendChild(img);
    } else {
      marco.appendChild(sinCartel());
    }
    li.appendChild(marco);

    li.appendChild(ayuda.crear('div', 'lanzamiento-titulo', titulo));
    var g = ayuda.crear('a', 'lanzamiento-grupo', grupo.nombre);
    g.href = '#/grupo/' + encodeURIComponent(grupo.id);
    li.appendChild(g);
    // "Concierto · sáb 24 oct" o "Gira · 5 fechas · desde sáb 24 oct"
    li.appendChild(ayuda.crear('div', 'lanzamiento-anio', cuantas > 1
      ? (gira ? 'Gira' : 'Conciertos') + ' · ' + cuantas + ' fechas · desde ' + fechaCorta(f.fecha)
      : (gira ? 'Gira' : 'Concierto') + ' · ' + fechaCorta(f.fecha)));
    return li;
  }

  function cajaMensaje(titulo, texto, boton) {
    var caja = ayuda.crear('div', 'sin-grupos');
    caja.appendChild(ayuda.crear('p', 'sin-grupos-titulo', titulo));
    caja.appendChild(ayuda.crear('p', 'sin-grupos-texto', texto));
    if (boton) {
      var a = ayuda.crear('a', 'boton', boton.texto);
      a.href = boton.href;
      caja.appendChild(a);
    }
    return caja;
  }

  // Cada pintado lleva un número; si llega tarde una respuesta de un pintado
  // anterior (porque se cambió de pantalla), se ignora.
  var turno = 0;

  // ---------- Pestaña Conciertos ----------

  function pintarPestana(contenedor) {
    var mio = ++turno;
    contenedor.textContent = '';
    var ids = ayuda.gruposSeguidos().map(function (g) { return g.id; });

    if (!ids.length) {
      contenedor.appendChild(cajaMensaje(
        'Aquí verás los conciertos de tus grupos',
        'Sigue a tus grupos favoritos y te diremos cuándo y dónde tocan.',
        { texto: 'Ir a Explorar', href: '#/explorar' }));
      return;
    }

    contenedor.appendChild(ayuda.crear('p', 'vacio', 'Cargando conciertos…'));
    Nube.proximasFechas(ids).then(function (fechas) {
      if (mio !== turno) return;
      contenedor.textContent = '';
      if (!fechas.length) {
        contenedor.appendChild(cajaMensaje(
          'De momento no hay fechas',
          'Tus grupos no tienen conciertos anunciados. En cuanto publiquen uno, aparecerá aquí.',
          { texto: 'Descubrir más grupos', href: '#/explorar' }));
        return;
      }
      contenedor.appendChild(listaPorMeses(fechas, true));
    }, function () {
      if (mio !== turno) return;
      contenedor.textContent = '';
      contenedor.appendChild(ayuda.crear('p', 'aviso', 'No se han podido cargar los conciertos. Revisa la conexión y vuelve a intentarlo.'));
    });
  }

  // ---------- Apartado "Próximos conciertos" de la ficha ----------
  // Solo aparece si el grupo tiene alguna fecha próxima.

  function rellenarFicha(contenedor, grupo) {
    var mio = ++turno;
    contenedor.textContent = '';
    Nube.proximasFechas([grupo.id]).then(function (fechas) {
      if (mio !== turno || !fechas.length) return;
      contenedor.appendChild(ayuda.crear('h2', null, 'Próximos conciertos · ' + fechas.length));
      var ul = ayuda.crear('ul', 'lista');
      fechas.forEach(function (f) {
        var fila = filaConcierto(f, false);
        if (fila) ul.appendChild(fila);
      });
      contenedor.appendChild(ul);
    }, function () { /* sin conexión: la ficha se ve igual, sin conciertos */ });
  }

  // ---------- Pantalla de un concierto ----------

  function dato(lista, nombre, valor) {
    if (!valor) return;
    lista.appendChild(ayuda.crear('dt', null, nombre));
    lista.appendChild(ayuda.crear('dd', null, valor));
  }

  function pintarDetalle(contenedor, id, alTitular) {
    var mio = ++turno;
    contenedor.textContent = '';
    contenedor.className = 'detalle-concierto';
    contenedor.appendChild(ayuda.crear('p', 'vacio', 'Cargando concierto…'));

    Nube.fecha(id).then(function (f) {
      if (mio !== turno) return;
      contenedor.textContent = '';
      var grupo = f && ayuda.grupoPorId(f.publicacion.grupo_id);
      if (!f || !grupo) {
        contenedor.appendChild(ayuda.crear('p', 'aviso', 'Este concierto ya no está publicado.'));
        return;
      }
      contenedor.className = 'detalle-concierto ' + grupo._acento;
      alTitular(grupo.nombre + ' en ' + f.sala);

      var url = Nube.urlCartel(f.publicacion.cartel);
      if (url) {
        var marco = ayuda.enlaceExterno(url, 'cartel-grande');
        marco.setAttribute('aria-label', 'Ver el cartel a tamaño completo');
        var img = document.createElement('img');
        img.src = url;
        img.alt = 'Cartel del concierto de ' + grupo.nombre;
        img.decoding = 'async';
        marco.appendChild(img);
        contenedor.appendChild(marco);
      }

      var cabecera = ayuda.crear('div', 'concierto-cabecera');
      var nombre = ayuda.crear('a', 'concierto-grupo', grupo.nombre);
      nombre.href = '#/grupo/' + encodeURIComponent(grupo.id);
      var h1 = ayuda.crear('h1');
      h1.appendChild(nombre);
      cabecera.appendChild(h1);
      if (f.publicacion.tipo === 'gira' && f.publicacion.titulo) {
        cabecera.appendChild(ayuda.crear('p', 'concierto-gira', f.publicacion.titulo));
      }
      contenedor.appendChild(cabecera);

      var datos = ayuda.crear('dl', 'datos-concierto');
      var textoFecha = fechaLarga(f.fecha);
      dato(datos, 'Fecha', textoFecha.charAt(0).toUpperCase() + textoFecha.slice(1));
      dato(datos, 'Hora', f.hora ? hora(f.hora) + notaHora(f) : 'Por confirmar');
      dato(datos, 'Sala', f.sala);
      dato(datos, 'Dirección', f.direccion);
      var provincia = provinciaDe(f);
      dato(datos, 'Ciudad', provincia && provincia !== f.ciudad ? f.ciudad + ' (' + provincia + ')' : ciudadConPais(f));
      dato(datos, 'Precio', f.precio);
      contenedor.appendChild(datos);

      var acciones = ayuda.crear('div', 'acciones');
      if (f.entradas && ayuda.urlPermitida(f.entradas)) {
        var entradas = ayuda.enlaceExterno(f.entradas, 'boton boton-ancho');
        entradas.textContent = 'Comprar entradas ↗';
        acciones.appendChild(entradas);
      }
      var mapa = ayuda.enlaceExterno(urlMapa(f), 'boton-secundario');
      mapa.textContent = 'Cómo llegar';
      acciones.appendChild(mapa);
      var calendario = ayuda.crear('button', 'boton-secundario', 'Añadir al calendario');
      calendario.type = 'button';
      calendario.addEventListener('click', function () { descargarIcs(f, grupo); });
      acciones.appendChild(calendario);
      contenedor.appendChild(acciones);
      if (window.Denuncias) contenedor.appendChild(Denuncias.enlace(f.publicacion.id));
      if (grupo) {
        var pieOcultar = ayuda.crear('p', 'ocultar-pie');
        pieOcultar.appendChild(ayuda.botonOcultar(grupo, function () { location.hash = '#/inicio'; }));
        contenedor.appendChild(pieOcultar);
      }
    }, function () {
      if (mio !== turno) return;
      contenedor.textContent = '';
      contenedor.appendChild(ayuda.crear('p', 'aviso', 'No se ha podido cargar el concierto. Revisa la conexión y vuelve a intentarlo.'));
    });
  }

  window.Conciertos = {
    iniciar: iniciar,
    PROVINCIAS: PROVINCIAS,
    PAISES: PAISES,
    ESPANA: ESPANA,
    zonaDe: zonaDe,
    esEspana: esEspana,
    paisCanonico: paisCanonico,
    paisDe: paisDe,
    provinciaDe: provinciaDe,
    fechaCorta: fechaCorta,
    hora: hora,
    pintarPestana: pintarPestana,
    casilla: casilla,
    rellenarFicha: rellenarFicha,
    pintarDetalle: pintarDetalle,
    // Para las pruebas
    crearIcs: crearIcs,
    urlMapa: urlMapa,
    instante: instante
  };
})();
