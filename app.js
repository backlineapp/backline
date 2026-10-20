// backline — el backstage de tus grupos favoritos.
// Lee grupos.json y muestra las pantallas: Inicio, Explorar, Conciertos,
// Mis grupos, Ficha de grupo, Concierto, Novedad, ¿Es tu grupo?, Acceso, Panel
// y Kit para grupos.
// La lista de grupos seguidos la gestiona seguidos.js; los conciertos,
// conciertos.js; los discos, vídeos y noticias publicados, novedades.js; el acceso, "¿Es tu grupo?" y el panel, panel.js; los avisos al móvil,
// avisos.js; instalar la app en el móvil, instalar.js; el kit para grupos, kit.js; Supabase, nube.js.

(function () {
  'use strict';

  // Familias de estilo del filtro. Cada grupo aparece en todas las familias
  // cuyo patrón encaje con su texto de estilos (sin mayúsculas ni tildes).
  var FAMILIAS = [
    { nombre: 'Post-rock', patron: /post-?rock/ },
    { nombre: 'Prog', patron: /prog|canterbury/ },
    { nombre: 'Post-metal', patron: /post-?metal/ },
    { nombre: 'Math rock', patron: /math/ },
    { nombre: 'Stoner', patron: /stoner|desert rock/ },
    { nombre: 'Psicodelia', patron: /psicodel|psych|kraut|space rock|acid/ },
    { nombre: 'Shoegaze', patron: /shoegaze|blackgaze|dream pop/ },
    { nombre: 'Doom', patron: /doom/ },
    { nombre: 'Sludge', patron: /sludge/ },
    // "Post-metal" y "post-black" tienen su propia familia; aquí no cuentan.
    { nombre: 'Heavy/Metal', patron: /metal|heavy|djent|black|death|hard rock/, quitar: /post-?(metal|black)/g },
    { nombre: 'Post-hardcore / Screamo', patron: /post-?hardcore|screamo/ }
  ];

  // Enlaces permitidos, en el orden en que se muestran.
  var ENLACES = [
    { campo: 'bandcamp', texto: 'Bandcamp' },
    { campo: 'spotify', texto: 'Spotify' },
    { campo: 'apple_music', texto: 'Apple Music' },
    { campo: 'youtube', texto: 'YouTube' },
    { campo: 'web', texto: 'Web' }
  ];

  // Icono de cada enlace en la ficha.
  var ICONOS = { bandcamp: '♪', spotify: '♫', apple_music: '♬', youtube: '▷', web: '◎' };

  // Palabras que no cuentan para las iniciales: "El Altar del Holocausto" -> "AH".
  var PALABRAS_VACIAS = /^(el|la|los|las|lo|de|del|y|the|of|and|a)$/i;

  // Nunca se enlaza a redes sociales, aunque llegaran en los datos. Al
  // publicar, la app avisa y no deja usar estos enlaces. La misma lista está
  // en supabase/6-novedades.sql: si se cambia aquí, cambiarla allí.
  var REDES_SOCIALES = [
    { nombre: 'Facebook', patron: /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$/ },
    { nombre: 'Instagram', patron: /(^|\.)(instagram\.com|instagr\.am)$/ },
    { nombre: 'X', patron: /(^|\.)(x\.com|twitter\.com|t\.co)$/ },
    { nombre: 'TikTok', patron: /(^|\.)tiktok\.com$/ },
    { nombre: 'Threads', patron: /(^|\.)threads\.(net|com)$/ },
    { nombre: 'Snapchat', patron: /(^|\.)snapchat\.com$/ },
    { nombre: 'Bluesky', patron: /(^|\.)bsky\.app$/ },
    { nombre: 'LinkedIn', patron: /(^|\.)linkedin\.com$/ },
    { nombre: 'Pinterest', patron: /(^|\.)pinterest\.com$/ },
    { nombre: 'VK', patron: /(^|\.)vk\.com$/ }
  ];

  // Lanzamientos que muestra Inicio de una vez; "Ver más" añade otros tantos.
  var POR_TANDA = 30;

  // Filtros de Inicio y lo que dice cada uno cuando no hay nada que enseñar.
  var FILTROS_INICIO = [
    { valor: 'todo', nombre: 'Todo', vacio: 'Tus grupos aún no han publicado nada' },
    { valor: 'disco', nombre: 'Discos', vacio: 'Tus grupos aún no han publicado discos' },
    { valor: 'video', nombre: 'Vídeos', vacio: 'Tus grupos aún no han publicado vídeos' },
    { valor: 'noticia', nombre: 'Noticias', vacio: 'Tus grupos aún no han publicado noticias' },
    { valor: 'concierto', nombre: 'Conciertos', vacio: 'Tus grupos no tienen conciertos anunciados' }
  ];
  // Donde se guarda en el móvil el último filtro elegido en Inicio.
  var CLAVE_INICIO = 'backline-inicio';

  // Nombre de cada pantalla, para el botón de volver desde la ficha, un concierto o una novedad.
  var NOMBRES = {
    inicio: 'Inicio', explorar: 'Explorar', conciertos: 'Conciertos', 'mis-grupos': 'Mis grupos',
    acceso: 'Acceso', panel: 'Mi panel'
  };

  // Pantallas de detalle (se vuelve de ellas a la pantalla de origen) y
  // pestaña de la barra que se ilumina en las que no son pestaña.
  var DETALLES = { ficha: true, concierto: true, novedad: true };
  var PESTANA_DE = { acceso: 'mis-grupos', panel: 'mis-grupos' };
  // "¿Es tu grupo?" cuelga de la ficha: no cambia la pantalla de origen.
  var DE_LA_FICHA = { gestionar: true };

  var grupos = [];
  var estado = { texto: '', familia: null };
  // Cuántos lanzamientos se ven ahora mismo en Inicio.
  var visiblesInicio = POR_TANDA;
  // Posición de la lista en cada pantalla, para volver al mismo sitio.
  var scrolls = { inicio: 0, explorar: 0, conciertos: 0, 'mis-grupos': 0 };
  // Pantalla desde la que se abrió la ficha o el concierto ('inicio', 'explorar'... o null).
  var origen = null;
  var pantallaActual = null;
  // Discos, vídeos, noticias y próximos conciertos publicados por los grupos
  // que sigo (la última respuesta de Supabase), para pintar Inicio al momento
  // al volver. "listas" y "fechasListas": si ya ha respondido Supabase.
  var datosInicio = { grupos: '', novedades: [], fechas: [], listas: false, fechasListas: false };
  // Filtro elegido en Inicio y si se ocultan los discos de Bandcamp. Se
  // recuerda en el móvil; la primera vez: Todo, con el interruptor apagado.
  var filtroInicio = leerFiltroInicio();
  var turnoInicio = 0;
  var turnoFicha = 0;

  var el = {
    inicio: document.getElementById('pantalla-inicio'),
    listaInicio: document.getElementById('lista-inicio'),
    controlesInicio: document.getElementById('controles-inicio'),
    filtrosInicio: document.getElementById('filtros-inicio'),
    soloGrupos: document.getElementById('solo-grupos'),
    verMas: document.getElementById('ver-mas'),
    sinGruposInicio: document.getElementById('sin-grupos-inicio'),
    pestanaInicio: document.getElementById('pestana-inicio'),
    explorar: document.getElementById('pantalla-explorar'),
    conciertos: document.getElementById('pantalla-conciertos'),
    listaConciertos: document.getElementById('lista-conciertos'),
    concierto: document.getElementById('pantalla-concierto'),
    contenidoConcierto: document.getElementById('concierto'),
    novedad: document.getElementById('pantalla-novedad'),
    contenidoNovedad: document.getElementById('novedad'),
    acceso: document.getElementById('pantalla-acceso'),
    contenidoAcceso: document.getElementById('acceso'),
    panel: document.getElementById('pantalla-panel'),
    contenidoPanel: document.getElementById('panel'),
    kit: document.getElementById('pantalla-kit'),
    contenidoKit: document.getElementById('kit'),
    gestionar: document.getElementById('pantalla-gestionar'),
    contenidoGestionar: document.getElementById('gestionar'),
    pestanaConciertos: document.getElementById('pestana-conciertos'),
    enlaceAcceso: document.getElementById('enlace-acceso'),
    pieInstalar: document.getElementById('pie-instalar'),
    enlaceInstalar: document.getElementById('enlace-instalar'),
    misGrupos: document.getElementById('pantalla-mis-grupos'),
    ficha: document.getElementById('pantalla-ficha'),
    buscador: document.getElementById('buscador'),
    filtros: document.getElementById('filtros'),
    contador: document.getElementById('contador'),
    lista: document.getElementById('lista'),
    contadorMios: document.getElementById('contador-mis-grupos'),
    listaMios: document.getElementById('lista-mis-grupos'),
    sinGrupos: document.getElementById('sin-grupos'),
    avisosMios: document.getElementById('avisos-mis-grupos'),
    pestanaExplorar: document.getElementById('pestana-explorar'),
    pestanaMisGrupos: document.getElementById('pestana-mis-grupos'),
    puntoMisGrupos: document.getElementById('punto-mis-grupos'),
    contenidoFicha: document.getElementById('ficha'),
    volver: document.querySelectorAll('.volver'),
    aviso: document.getElementById('aviso'),
    arranque: document.getElementById('arranque')
  };

  // ---------- Utilidades ----------

  // Pasa a minúsculas y quita tildes: "Canción" -> "cancion".
  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function crear(etiqueta, clase, texto) {
    var nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function familiasDe(estilos) {
    var base = normalizar(estilos);
    return FAMILIAS.filter(function (f) {
      var texto = f.quitar ? base.replace(f.quitar, '') : base;
      return f.patron.test(texto);
    }).map(function (f) { return f.nombre; });
  }

  // Separa "Disco A (2020), Disco B (2018, directo)" en una lista.
  // Solo corta en comas o punto y coma que van justo después de un paréntesis
  // cerrado, para no partir títulos que llevan comas.
  function separarDiscos(texto) {
    var discos = [];
    var actual = '';
    var nivel = 0;
    texto = String(texto || '');
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (c === '(') nivel++;
      if (c === ')') nivel = Math.max(0, nivel - 1);
      if ((c === ',' || c === ';') && nivel === 0 && /\)\s*$/.test(actual)) {
        discos.push(actual.trim());
        actual = '';
        continue;
      }
      actual += c;
    }
    if (actual.trim()) discos.push(actual.trim());
    return discos;
  }

  // Nombre de la red social de un enlace ("Instagram"...) o '' si no es de ninguna.
  function redSocial(url) {
    var sitio;
    try { sitio = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch (e) { return ''; }
    for (var i = 0; i < REDES_SOCIALES.length; i++) {
      if (REDES_SOCIALES[i].patron.test(sitio)) return REDES_SOCIALES[i].nombre;
    }
    return '';
  }

  function urlPermitida(url) {
    try {
      var u = new URL(url);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !redSocial(url);
    } catch (e) {
      return false;
    }
  }

  // Forma de comparar dos enlaces al mismo disco ("https://www.x.com/a/" = "http://x.com/a").
  function mismoEnlace(url) {
    try {
      var u = new URL(url);
      return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function iniciales(nombre) {
    var palabras = String(nombre || '')
      .split(/\s+/)
      .map(function (p) { return p.replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ]/g, ''); })
      .filter(Boolean);
    var utiles = palabras.filter(function (p) { return !PALABRAS_VACIAS.test(p); });
    if (!utiles.length) utiles = palabras;
    return utiles.slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase() || '?';
  }

  // Bandcamp sirve la misma portada en varios tamaños según el número final
  // de la dirección: _16 es la grande (700 px), _2 una mediana (350 px)
  // y _7 una pequeña (160 px).
  function portadaTamano(url, numero) {
    return /bcbits\.com\/img\/a\d+_\d+\.jpg$/.test(url) ? url.replace(/_\d+\.jpg$/, '_' + numero + '.jpg') : url;
  }

  function cuadroIniciales(grupo, clase) {
    var caja = crear('div', 'portada iniciales' + (clase ? ' ' + clase : ''), iniciales(grupo.nombre));
    caja.setAttribute('aria-hidden', 'true');
    return caja;
  }

  // Portada enlazada directamente desde Bandcamp (no se guarda en la app).
  // Si no carga, se prueba el tamaño grande y, si tampoco, la alternativa
  // (iniciales del grupo o una nota musical).
  function imagenPortada(grupo, opciones) {
    return imagen(grupo.portada, opciones);
  }

  function imagen(original, opciones) {
    if (!original || !urlPermitida(original)) return opciones.alternativa();
    var img = document.createElement('img');
    img.className = opciones.clase || '';
    img.alt = opciones.alt || '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    if (opciones.perezosa) img.loading = 'lazy';
    img.src = opciones.pequena ? portadaTamano(original, 7)
      : opciones.mediana ? portadaTamano(original, 2)
      : original;
    img.addEventListener('error', function () {
      if (img.src !== original) {
        img.src = original;
      } else if (img.parentNode) {
        img.parentNode.replaceChild(opciones.alternativa(), img);
      }
    });
    return img;
  }

  // "ECOS (2026)" -> { titulo: "ECOS", detalle: "2026" }
  function partirDisco(texto) {
    var m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(texto);
    return m ? { titulo: m[1], detalle: m[2] } : { titulo: texto, detalle: '' };
  }

  function anioDe(texto) {
    var m = /(\d{4})/.exec(texto);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ¿Tiene el grupo su discografía en lista (con portadas)?
  function tieneLista(grupo) {
    return Array.isArray(grupo.discos) && grupo.discos.length > 0;
  }

  // Lanzamientos de un grupo, de más nuevo a más antiguo. Si el grupo no
  // tiene lista, se sacan del texto de "discografia" (sin portada ni enlace).
  // Con el mismo año se respeta el orden de la lista original.
  function lanzamientosDe(grupo) {
    var lista = tieneLista(grupo)
      ? grupo.discos.map(function (d) {
        return { titulo: d.titulo, anio: anioDe(d.anio), tipo: d.tipo, enlace: d.enlace, portada: d.portada };
      })
      : separarDiscos(grupo.discografia).map(function (texto) {
        var partes = partirDisco(texto);
        return { titulo: partes.titulo, anio: anioDe(partes.detalle) };
      });
    return lista
      .map(function (d, i) { d.grupo = grupo; d.orden = i; return d; })
      .sort(function (a, b) { return (b.anio - a.anio) || (a.orden - b.orden); });
  }

  // Cuadro con una nota musical cuando un disco no tiene portada.
  function nota() {
    var n = crear('div', 'portada iniciales nota', '♪');
    n.setAttribute('aria-hidden', 'true');
    return n;
  }

  // Portada de un lanzamiento, en tamaño mediano para las cuadrículas.
  function portadaLanzamiento(d) {
    return imagen(d.portada, { clase: 'portada', mediana: true, perezosa: true, alternativa: nota });
  }

  // Enlace que abre fuera de la app, en una pestaña nueva.
  function enlaceExterno(url, clase) {
    var a = crear('a', clase);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // ---------- Pantalla de arranque ----------

  // Al quitarla se ofrece instalar la app, si toca (ver instalar.js).
  function quitarArranque() {
    var a = el.arranque;
    if (!a || a.classList.contains('saliendo')) return;
    a.classList.add('saliendo');
    setTimeout(function () {
      a.hidden = true;
      Instalar.alEntrar();
    }, 400);
  }

  if (el.arranque) {
    el.arranque.addEventListener('click', quitarArranque);
    el.arranque.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') quitarArranque();
    });
    setTimeout(quitarArranque, 2600);
  } else {
    Instalar.alEntrar();
  }

  // "Instalar la app" al pie de Mis grupos. Si ya está instalada, no se ve.
  el.pieInstalar.hidden = Instalar.instalada();
  el.enlaceInstalar.addEventListener('click', function () { Instalar.mostrar(); });

  // ---------- Lo de Bandcamp junto a lo publicado en Backline ----------

  // Mezcla los lanzamientos de grupos.json (Bandcamp) de un grupo con lo que
  // ha publicado desde "Mi panel" (pubs: discos, vídeos y noticias).
  // Un disco publicado con el mismo enlace que uno de Bandcamp (o, si el grupo
  // solo tiene la discografía en texto, con el mismo título) sale una sola
  // vez: el publicado, que trae fecha exacta.
  // Cada elemento: { clave, orden, grupo, disco (de Bandcamp) | pub }.
  function mezclar(grupo, pubs) {
    var discos = pubs.filter(function (p) { return p.tipo === 'disco'; });
    var enlaces = discos.map(function (p) { return mismoEnlace(p.enlace); }).filter(Boolean);
    var titulos = discos.map(function (p) { return normalizar(p.titulo); });
    var lista = [];
    lanzamientosDe(grupo).forEach(function (d) {
      if (d.enlace && enlaces.indexOf(mismoEnlace(d.enlace)) !== -1) return;
      if (!tieneLista(grupo) && titulos.indexOf(normalizar(d.titulo)) !== -1) return;
      // De Bandcamp solo se sabe el año: va detrás de lo publicado ese mismo año.
      lista.push({ clave: d.anio ? d.anio + '-00' : '', orden: d.orden, grupo: grupo, disco: d });
    });
    pubs.forEach(function (p) {
      lista.push({ clave: Novedades.claveOrden(p), orden: -1, grupo: grupo, pub: p });
    });
    return lista;
  }

  // Lo más reciente arriba. Mismo año en Bandcamp: primero lo más nuevo de
  // cada grupo, y luego por nombre de grupo.
  function ordenarMezcla(lista) {
    return lista.sort(function (a, b) {
      return (a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0) || (a.orden - b.orden) ||
        a.grupo.nombre.localeCompare(b.grupo.nombre, 'es');
    });
  }

  function casilla(item, conGrupo) {
    if (item.concierto) return Conciertos.casilla(item.concierto, item.cuantas);
    return item.pub ? Novedades.tarjeta(item.pub, conGrupo) : tarjetaLanzamiento(item.disco, conGrupo);
  }

  // ---------- Pantalla Inicio ----------

  // Lo último de los grupos que sigo: discos de Bandcamp y lo que publican
  // en Backline (discos, vídeos, noticias y próximos conciertos), mezclado y
  // ordenado por fecha (lo más reciente arriba). Se ve de 30 en 30.
  // Se pinta al momento con lo que ya se sabe y, cuando responde Supabase,
  // otra vez con lo último publicado.
  function pintarInicio(sinPedir) {
    var mios = grupos.filter(function (g) { return Seguidos.sigo(g.id); });
    var ids = mios.map(function (g) { return g.id; }).join(',');
    if (datosInicio.grupos !== ids) {
      datosInicio = { grupos: ids, novedades: [], fechas: [], listas: false, fechasListas: false };
    }
    dibujarInicio(mios);
    if (sinPedir || !mios.length) return;
    var mio = ++turnoInicio;
    var pedidos = mios.map(function (g) { return g.id; });
    var alLlegar = function (cambio) {
      if (datosInicio.grupos !== ids) return;
      cambio();
      if (mio === turnoInicio && pantallaActual === 'inicio') dibujarInicio(mios);
    };
    Nube.novedades(pedidos).then(function (lista) {
      alLlegar(function () { datosInicio.novedades = lista; datosInicio.listas = true; });
    }, function () {
      // Sin conexión: Inicio se ve igual, con lo de Bandcamp.
      alLlegar(function () { datosInicio.listas = true; });
    });
    Nube.proximasFechas(pedidos).then(function (fechas) {
      alLlegar(function () { datosInicio.fechas = fechas; datosInicio.fechasListas = true; });
    }, function () {
      alLlegar(function () { datosInicio.fechasListas = true; });
    });
  }

  // Conciertos para Inicio: uno por publicación (una gira sale una vez, con
  // su próxima fecha), colocados por el día en que se publicaron.
  function conciertosInicio(fechas, mios) {
    var porId = {};
    mios.forEach(function (g) { porId[g.id] = g; });
    var porPublicacion = {};
    var lista = [];
    fechas.forEach(function (f) {
      var id = f.publicacion.id;
      if (porPublicacion[id]) { porPublicacion[id].cuantas++; return; }
      var grupo = porId[f.publicacion.grupo_id];
      if (!grupo) return;
      // Las fechas llegan ordenadas: la primera es la más próxima.
      porPublicacion[id] = { clave: f.publicacion.creado || '', orden: -1, grupo: grupo, concierto: f, cuantas: 1 };
      lista.push(porPublicacion[id]);
    });
    return lista;
  }

  // 'disco', 'video', 'noticia' o 'concierto'.
  function tipoInicio(item) {
    if (item.concierto) return 'concierto';
    return item.pub ? item.pub.tipo : 'disco';
  }

  function dibujarInicio(mios) {
    var porGrupo = {};
    datosInicio.novedades.forEach(function (p) { (porGrupo[p.grupo_id] = porGrupo[p.grupo_id] || []).push(p); });
    var todos = [];
    mios.forEach(function (g) { todos = todos.concat(mezclar(g, porGrupo[g.id] || [])); });
    todos = todos.concat(conciertosInicio(datosInicio.fechas, mios)).filter(function (item) {
      if (filtroInicio.soloGrupos && item.disco) return false;
      return filtroInicio.tipo === 'todo' || tipoInicio(item) === filtroInicio.tipo;
    });
    ordenarMezcla(todos);

    el.listaInicio.textContent = '';
    el.sinGruposInicio.hidden = mios.length > 0;
    el.controlesInicio.hidden = !mios.length;
    el.listaInicio.hidden = !mios.length;
    pintarFiltrosInicio();

    if (mios.length && !todos.length) {
      el.listaInicio.appendChild(crear('li', 'vacio', mensajeVacioInicio()));
    }

    var trozo = document.createDocumentFragment();
    todos.slice(0, visiblesInicio).forEach(function (item) {
      var c = casilla(item, true);
      if (c) trozo.appendChild(c);
    });
    el.listaInicio.appendChild(trozo);
    el.verMas.hidden = todos.length <= visiblesInicio;
  }

  // Mensaje cuando el filtro elegido no tiene nada (o aún no ha respondido Supabase).
  function mensajeVacioInicio() {
    var tipo = filtroInicio.tipo;
    var esperando = tipo === 'concierto' ? !datosInicio.fechasListas
      : tipo === 'todo' ? !datosInicio.listas || !datosInicio.fechasListas
      : !datosInicio.listas;
    if (esperando) return 'Cargando…';
    var op = FILTROS_INICIO.filter(function (f) { return f.valor === tipo; })[0] || FILTROS_INICIO[0];
    // Solo los discos pueden venir de Bandcamp: con el interruptor, se aclara.
    return op.vacio + (filtroInicio.soloGrupos && (tipo === 'todo' || tipo === 'disco') ? ' en Backline.' : '.');
  }

  function pintarFiltrosInicio() {
    el.filtrosInicio.textContent = '';
    FILTROS_INICIO.forEach(function (op) {
      var b = crear('button', 'filtro', op.nombre);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(filtroInicio.tipo === op.valor));
      b.addEventListener('click', function () {
        if (filtroInicio.tipo === op.valor) return;
        filtroInicio.tipo = op.valor;
        cambiarFiltroInicio();
      });
      el.filtrosInicio.appendChild(b);
    });
    el.soloGrupos.checked = filtroInicio.soloGrupos;
  }

  function cambiarFiltroInicio() {
    guardarFiltroInicio();
    visiblesInicio = POR_TANDA;
    pintarInicio(true);
  }

  function leerFiltroInicio() {
    var guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(CLAVE_INICIO)) || {}; } catch (e) { /* sin permiso: lo de siempre */ }
    var valido = FILTROS_INICIO.some(function (f) { return f.valor === guardado.tipo; });
    return { tipo: valido ? guardado.tipo : 'todo', soloGrupos: guardado.soloGrupos === true };
  }

  function guardarFiltroInicio() {
    try { localStorage.setItem(CLAVE_INICIO, JSON.stringify(filtroInicio)); } catch (e) { /* sin permiso para guardar: no pasa nada */ }
  }

  // Casilla de la cuadrícula de discos. En la ficha toda la casilla abre el
  // enlace; en Inicio, la portada abre el enlace y el nombre lleva a la ficha.
  function tarjetaLanzamiento(d, conGrupo) {
    var li = crear('li', 'lanzamiento ' + d.grupo._acento);
    var enlace = d.enlace && urlPermitida(d.enlace) ? d.enlace : null;
    var caja = conGrupo ? li : (enlace ? enlaceExterno(enlace, 'lanzamiento-enlace') : li);

    var portada = portadaLanzamiento(d);
    if (conGrupo && enlace) {
      var a = enlaceExterno(enlace, 'lanzamiento-portada');
      a.setAttribute('aria-label', 'Escuchar ' + d.titulo + ' de ' + d.grupo.nombre);
      a.appendChild(portada);
      caja.appendChild(a);
    } else {
      var marco = crear('div', 'lanzamiento-portada');
      marco.appendChild(portada);
      caja.appendChild(marco);
    }

    caja.appendChild(crear('div', 'lanzamiento-titulo', d.titulo));
    if (conGrupo) {
      var g = crear('a', 'lanzamiento-grupo', d.grupo.nombre);
      g.href = '#/grupo/' + encodeURIComponent(d.grupo.id);
      caja.appendChild(g);
    }
    if (d.anio) caja.appendChild(crear('div', 'lanzamiento-anio', String(d.anio)));

    if (caja !== li) li.appendChild(caja);
    return li;
  }

  // ---------- Pantalla 1: Explorar ----------

  function pintarFiltros() {
    el.filtros.textContent = '';
    var opciones = [{ nombre: 'Todos', valor: null }].concat(
      FAMILIAS.map(function (f) { return { nombre: f.nombre, valor: f.nombre }; })
    );
    opciones.forEach(function (op) {
      var b = crear('button', 'filtro', op.nombre);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(estado.familia === op.valor));
      b.addEventListener('click', function () {
        estado.familia = op.valor;
        pintarFiltros();
        pintarLista();
      });
      el.filtros.appendChild(b);
    });
  }

  function pintarLista() {
    var busqueda = normalizar(estado.texto);
    var visibles = grupos.filter(function (g) {
      if (busqueda && g._nombre.indexOf(busqueda) === -1) return false;
      if (estado.familia && g._familias.indexOf(estado.familia) === -1) return false;
      return true;
    });

    el.contador.textContent = visibles.length === 1 ? '1 grupo' : visibles.length + ' grupos';
    el.lista.textContent = '';

    if (!visibles.length) {
      el.lista.appendChild(crear('li', 'vacio', 'No hay grupos que coincidan.'));
      return;
    }

    el.lista.appendChild(filas(visibles));
  }

  // Fila de un grupo (portada, nombre, estilo · ciudad). La usan Explorar y Mis grupos.
  function filaGrupo(g) {
    var li = document.createElement('li');
    var a = crear('a', 'tarjeta ' + g._acento);
    a.href = '#/grupo/' + encodeURIComponent(g.id);
    a.appendChild(imagenPortada(g, {
      clase: 'portada',
      pequena: true,
      perezosa: true,
      alternativa: function () { return cuadroIniciales(g); }
    }));
    var texto = crear('div', 'tarjeta-texto');
    texto.appendChild(crear('h3', 'tarjeta-nombre', g.nombre));
    texto.appendChild(crear('p', 'tarjeta-detalle', [g.estilos, g.ciudad].filter(Boolean).join(' · ')));
    a.appendChild(texto);
    var flecha = crear('span', 'flecha', '›');
    flecha.setAttribute('aria-hidden', 'true');
    a.appendChild(flecha);
    li.appendChild(a);
    return li;
  }

  function filas(lista) {
    var trozo = document.createDocumentFragment();
    lista.forEach(function (g) { trozo.appendChild(filaGrupo(g)); });
    return trozo;
  }

  // ---------- Pantalla 2: Mis grupos ----------

  // Mismo orden alfabético que Explorar. Si un grupo seguido ya no está en
  // grupos.json, no se muestra, pero sigue guardado.
  function pintarMisGrupos() {
    var mios = grupos.filter(function (g) { return Seguidos.sigo(g.id); });
    actualizarAcceso();
    Avisos.pintar(el.avisosMios);
    el.listaMios.textContent = '';
    el.sinGrupos.hidden = mios.length > 0;
    el.contadorMios.hidden = !mios.length;
    el.contadorMios.textContent = mios.length === 1 ? 'Sigues 1 grupo' : 'Sigues ' + mios.length + ' grupos';
    el.listaMios.appendChild(filas(mios));
  }

  // ---------- Pantalla 3: Ficha de grupo ----------

  function pintarFicha(grupo) {
    var f = el.contenidoFicha;
    f.textContent = '';
    f.className = 'ficha';

    if (!grupo) {
      f.appendChild(crear('p', 'aviso', 'No encontramos este grupo.'));
      return;
    }
    f.className = 'ficha ' + grupo._acento;

    // Cabecera: portada grande, nombre, estilos y ciudad
    var perfil = crear('div', 'perfil');
    var imagen = crear('div', 'perfil-imagen');
    function cabeceraSinPortada() {
      imagen.classList.add('sin-portada');
      var s = crear('span', null, iniciales(grupo.nombre));
      s.setAttribute('aria-hidden', 'true');
      return s;
    }
    imagen.appendChild(imagenPortada(grupo, {
      alt: 'Portada del último disco de ' + grupo.nombre,
      alternativa: cabeceraSinPortada
    }));
    perfil.appendChild(imagen);

    var datos = crear('div', 'perfil-datos');
    datos.appendChild(crear('h1', 'perfil-nombre', grupo.nombre));
    datos.appendChild(crear('p', 'perfil-estilos', grupo.estilos));
    if (grupo.ciudad) datos.appendChild(crear('p', 'perfil-ciudad', grupo.ciudad));
    // Seguir y, si lo sigo, la campanita para silenciar sus avisos.
    var botones = crear('div', 'perfil-botones');
    botones.appendChild(botonSeguir(grupo));
    botones.appendChild(Avisos.campanita(grupo));
    datos.appendChild(botones);
    perfil.appendChild(datos);
    f.appendChild(perfil);

    // Escúchalos
    var enlaces = ENLACES.filter(function (e) {
      return grupo[e.campo] && urlPermitida(grupo[e.campo]);
    });
    if (enlaces.length) {
      f.appendChild(crear('h2', null, 'Escúchalos'));
      var caja = crear('div', 'enlaces');
      enlaces.forEach(function (e) {
        var a = crear('a', 'enlace');
        a.href = grupo[e.campo];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        var icono = crear('span', 'enlace-icono', ICONOS[e.campo]);
        icono.setAttribute('aria-hidden', 'true');
        a.appendChild(icono);
        a.appendChild(crear('span', 'enlace-texto', e.texto));
        var salida = crear('span', 'enlace-salida', '↗');
        salida.setAttribute('aria-hidden', 'true');
        a.appendChild(salida);
        caja.appendChild(a);
      });
      f.appendChild(caja);
    }

    // Próximos conciertos (solo aparece si hay alguno)
    var cajaConciertos = crear('div', 'ficha-conciertos');
    f.appendChild(cajaConciertos);
    Conciertos.rellenarFicha(cajaConciertos, grupo);

    // Novedades (vídeos y noticias publicados en Backline; solo si hay alguna)
    var cajaNovedades = crear('div', 'ficha-novedades');
    f.appendChild(cajaNovedades);

    // Discografía: primero la de grupos.json y, cuando responde Supabase,
    // junto con los discos publicados en Backline.
    var cajaDiscos = crear('div', 'ficha-discos');
    f.appendChild(cajaDiscos);
    pintarDiscografia(cajaDiscos, grupo, []);
    var mio = ++turnoFicha;
    Nube.novedades([grupo.id]).then(function (pubs) {
      if (mio !== turnoFicha) return;
      Novedades.rellenarFicha(cajaNovedades, pubs);
      var discos = pubs.filter(function (p) { return p.tipo === 'disco'; });
      if (discos.length) pintarDiscografia(cajaDiscos, grupo, discos);
    }, function () { /* sin conexión: la ficha se ve igual, con lo de Bandcamp */ });

    // ¿Es tu grupo? -> pedir gestionar la ficha o que se retire.
    // Si ya la gestiona quien ha entrado, lleva directamente a su panel.
    var cuenta = Nube.cuenta();
    var gestiona = !!(cuenta && (cuenta.grupos || []).indexOf(grupo.id) !== -1);
    var reclamar = crear('a', 'reclamar', gestiona ? 'Gestionas esta ficha · Ir a mi panel' : '¿Es tu grupo? Gestiona o retira tu ficha');
    reclamar.href = gestiona ? '#/panel' : '#/gestionar/' + encodeURIComponent(grupo.id);
    var pie = crear('p', 'reclamar-pie');
    pie.appendChild(reclamar);
    f.appendChild(pie);
  }

  // Discografía de la ficha, separando discos y singles. publicados: los
  // discos y singles publicados en Backline (se mezclan con los de Bandcamp).
  function pintarDiscografia(f, grupo, publicados) {
    f.textContent = '';
    if (tieneLista(grupo) || publicados.length) {
      var lanzamientos = ordenarMezcla(mezclar(grupo, publicados));
      var esSingle = function (item) {
        return item.pub ? item.pub.formato === 'single' : item.disco.tipo === 'single';
      };
      [
        { titulo: 'Discos', lista: lanzamientos.filter(function (d) { return !esSingle(d); }) },
        { titulo: 'Singles', lista: lanzamientos.filter(esSingle) }
      ].forEach(function (seccion) {
        if (!seccion.lista.length) return;
        f.appendChild(crear('h2', null, seccion.titulo + ' · ' + seccion.lista.length));
        var rejilla = crear('ul', 'rejilla');
        seccion.lista.forEach(function (d) {
          var c = casilla(d, false);
          if (c) rejilla.appendChild(c);
        });
        f.appendChild(rejilla);
      });
      return;
    }
    // Sin lista: el texto de "discografia", como antes. La portada va en el
    // disco más reciente.
    var discos = separarDiscos(grupo.discografia);
    if (!discos.length) return;
    var masReciente = 0;
    discos.forEach(function (d, i) {
      if (anioDe(d) > anioDe(discos[masReciente])) masReciente = i;
    });

    f.appendChild(crear('h2', null, 'Discografía · ' + discos.length));
    var ul = crear('ul', 'discos');
    discos.forEach(function (d, i) {
      var partes = partirDisco(d);
      var li = crear('li', 'disco');
      li.appendChild(i === masReciente
        ? imagenPortada(grupo, { clase: 'portada', pequena: true, alternativa: nota })
        : nota());
      var texto = crear('div', 'disco-texto');
      texto.appendChild(crear('div', 'disco-titulo', partes.titulo));
      if (partes.detalle) texto.appendChild(crear('div', 'disco-detalle', partes.detalle));
      li.appendChild(texto);
      ul.appendChild(li);
    });
    f.appendChild(ul);
  }

  // Botón "Seguir" / "Siguiendo". Al pulsarlo se sigue o se deja de seguir.
  function botonSeguir(grupo) {
    var b = crear('button', 'seguir');
    b.type = 'button';
    function actualizar() {
      var sigo = Seguidos.sigo(grupo.id);
      b.textContent = sigo ? 'Siguiendo' : 'Seguir';
      b.setAttribute('aria-pressed', String(sigo));
      b.setAttribute('aria-label', (sigo ? 'Dejar de seguir a ' : 'Seguir a ') + grupo.nombre);
    }
    b.addEventListener('click', function () {
      Seguidos.alternar(grupo.id);
      actualizar();
    });
    actualizar();
    return b;
  }

  // ---------- Navegación entre pantallas ----------

  function mostrar(pantalla) {
    // Guardamos por dónde iba la lista que dejamos atrás.
    if (scrolls.hasOwnProperty(pantallaActual)) scrolls[pantallaActual] = window.scrollY;
    if (DETALLES[pantalla] && !DETALLES[pantallaActual] && !DE_LA_FICHA[pantallaActual]) origen = pantallaActual;
    pantallaActual = pantalla;

    ['inicio', 'explorar', 'conciertos', 'misGrupos', 'ficha', 'concierto', 'novedad', 'gestionar', 'acceso', 'panel', 'kit'].forEach(function (k) {
      var nombre = k === 'misGrupos' ? 'mis-grupos' : k;
      el[k].hidden = pantalla !== nombre;
    });

    // En la ficha, en un concierto y en una novedad se ilumina la pestaña desde la que se llegó.
    var pestana = DETALLES[pantalla] || DE_LA_FICHA[pantalla] ? (origen || 'explorar') : pantalla;
    pestana = PESTANA_DE[pestana] || pestana;
    marcarPestana(el.pestanaInicio, pestana === 'inicio');
    marcarPestana(el.pestanaExplorar, pestana === 'explorar');
    marcarPestana(el.pestanaConciertos, pestana === 'conciertos');
    marcarPestana(el.pestanaMisGrupos, pestana === 'mis-grupos');
    Array.prototype.forEach.call(el.volver, function (b) {
      b.textContent = '← ' + NOMBRES[origen || 'explorar'];
    });
  }

  function marcarPestana(pestana, activa) {
    if (activa) pestana.setAttribute('aria-current', 'page');
    else pestana.removeAttribute('aria-current');
  }

  function alCambiarRuta() {
    var ruta = location.hash.replace(/^#\/?/, '');
    var partes = ruta.split('/');

    // Al abrir la app sin pantalla concreta: Inicio si sigo a algún grupo,
    // Explorar si no. Se cambia la dirección sin añadir un paso al historial.
    if (!partes[0]) {
      var sigoAlguno = grupos.some(function (g) { return Seguidos.sigo(g.id); });
      var destino = sigoAlguno ? '#/inicio' : '#/explorar';
      history.replaceState(null, '', destino);
      partes = [destino.slice(2)];
    }

    if (partes[0] === 'grupo' && partes[1]) {
      var id = decodeURIComponent(partes[1]);
      var grupo = grupos.filter(function (g) { return g.id === id; })[0];
      pintarFicha(grupo);
      document.title = grupo ? grupo.nombre + ' · Backline' : 'Backline';
      mostrar('ficha');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'inicio') {
      pintarInicio();
      document.title = 'Inicio · Backline';
      mostrar('inicio');
      window.scrollTo(0, scrolls.inicio);
      return;
    }

    if (partes[0] === 'conciertos') {
      Conciertos.pintarPestana(el.listaConciertos);
      document.title = 'Conciertos · Backline';
      mostrar('conciertos');
      window.scrollTo(0, scrolls.conciertos);
      return;
    }

    if (partes[0] === 'concierto' && partes[1]) {
      document.title = 'Concierto · Backline';
      Conciertos.pintarDetalle(el.contenidoConcierto, decodeURIComponent(partes[1]), function (titulo) {
        document.title = titulo + ' · Backline';
      });
      mostrar('concierto');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'novedad' && partes[1]) {
      document.title = 'Novedad · Backline';
      Novedades.pintarDetalle(el.contenidoNovedad, decodeURIComponent(partes[1]), function (titulo) {
        document.title = titulo + ' · Backline';
      });
      mostrar('novedad');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'gestionar' && partes[1]) {
      var idG = decodeURIComponent(partes[1]);
      var grupoG = grupos.filter(function (g) { return g.id === idG; })[0];
      // Si se llega desde la ficha, "volver" es como el botón atrás del móvil.
      var desdeFicha = pantallaActual === 'ficha';
      Panel.pintarGestionar(el.contenidoGestionar, grupoG, function () {
        if (desdeFicha && history.length > 1) history.back();
        else location.hash = grupoG ? '#/grupo/' + encodeURIComponent(grupoG.id) : '#/explorar';
      });
      document.title = (grupoG ? '¿Es tu grupo? · ' + grupoG.nombre : '¿Es tu grupo?') + ' · Backline';
      mostrar('gestionar');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'acceso') {
      Panel.pintarAcceso(el.contenidoAcceso);
      document.title = 'Acceso · Backline';
      mostrar('acceso');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'panel') {
      Panel.pintarPanel(el.contenidoPanel, partes);
      document.title = 'Mi panel · Backline';
      mostrar('panel');
      window.scrollTo(0, 0);
      return;
    }

    // Kit para grupos: no es pestaña, se llega por enlace o desde "Mi panel".
    if (partes[0] === 'kit') {
      var grupoK = Kit.pintar(el.contenidoKit, partes[1] ? decodeURIComponent(partes[1]) : '', pantallaActual === 'panel');
      document.title = (grupoK ? 'Kit de ' + grupoK.nombre : 'Kit para grupos') + ' · Backline';
      mostrar('kit');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'mis-grupos') {
      pintarMisGrupos();
      document.title = 'Mis grupos · Backline';
      mostrar('mis-grupos');
      window.scrollTo(0, scrolls['mis-grupos']);
      return;
    }

    document.title = 'Backline';
    mostrar('explorar');
    window.scrollTo(0, scrolls.explorar);
  }

  Array.prototype.forEach.call(el.volver, function (b) {
    b.addEventListener('click', function () {
      // Si veníamos de una lista, volvemos atrás como el botón del móvil.
      if (origen && history.length > 1) {
        history.back();
      } else {
        location.hash = '#/' + (origen || 'explorar');
      }
    });
  });

  // Si la lista cambia en otra pestaña del navegador, Inicio y Mis grupos se actualizan.
  Seguidos.alCambiar(function () {
    if (pantallaActual === 'mis-grupos') pintarMisGrupos();
    if (pantallaActual === 'inicio') pintarInicio();
    if (pantallaActual === 'conciertos') Conciertos.pintarPestana(el.listaConciertos);
  });

  // El enlace discreto de Mis grupos lleva al panel si ha entrado el
  // administrador o alguien que gestiona un grupo. Al administrador le
  // muestra, en rojo, cuántas solicitudes tiene pendientes, junto a
  // "Mi panel" y en la pestaña Mis grupos de abajo.
  var pidiendoPendientes = 0;
  function numeroPestana(n) {
    el.puntoMisGrupos.textContent = n ? String(n) : '';
    el.puntoMisGrupos.hidden = !n;
    if (n) el.pestanaMisGrupos.setAttribute('aria-label', 'Mis grupos, ' + n + (n === 1 ? ' solicitud pendiente' : ' solicitudes pendientes'));
    else el.pestanaMisGrupos.removeAttribute('aria-label');
  }
  function actualizarAcceso() {
    var cuenta = Nube.cuenta();
    var conPanel = !!(cuenta && (cuenta.admin || grupos.some(function (g) {
      return (cuenta.grupos || []).indexOf(g.id) !== -1;
    })));
    el.enlaceAcceso.textContent = conPanel ? 'Mi panel' : 'Acceso';
    el.enlaceAcceso.href = conPanel ? '#/panel' : '#/acceso';
    el.enlaceAcceso.removeAttribute('aria-label');
    var mio = ++pidiendoPendientes;
    if (!cuenta || !cuenta.admin) {
      numeroPestana(0);
      return;
    }
    Nube.contarPendientes().then(function (n) {
      if (mio !== pidiendoPendientes) return;
      numeroPestana(n);
      if (!n) return;
      var punto = crear('span', 'punto', String(n));
      punto.setAttribute('aria-hidden', 'true');
      el.enlaceAcceso.appendChild(document.createTextNode(' '));
      el.enlaceAcceso.appendChild(punto);
      el.enlaceAcceso.setAttribute('aria-label', 'Mi panel, ' + n + (n === 1 ? ' solicitud pendiente' : ' solicitudes pendientes'));
    }, function () { /* sin conexión: sin número */ });
  }
  Nube.alCambiarCuenta(actualizarAcceso);
  // Al volver a la app (por ejemplo, después de un aviso), el número se pone al día.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') actualizarAcceso();
  });

  el.soloGrupos.addEventListener('change', function () {
    filtroInicio.soloGrupos = el.soloGrupos.checked;
    cambiarFiltroInicio();
  });

  el.verMas.addEventListener('click', function () {
    visiblesInicio += POR_TANDA;
    pintarInicio(true);
  });

  el.buscador.addEventListener('input', function () {
    estado.texto = el.buscador.value;
    pintarLista();
  });

  // ---------- Arranque ----------

  // Piezas comunes que usan conciertos.js, novedades.js, panel.js y kit.js.
  var piezas = {
    crear: crear,
    urlPermitida: urlPermitida,
    redSocial: redSocial,
    enlaceExterno: enlaceExterno,
    cuadroIniciales: cuadroIniciales,
    grupoPorId: function (id) { return grupos.filter(function (g) { return g.id === id; })[0] || null; },
    todosLosGrupos: function () { return grupos; },
    gruposSeguidos: function () { return grupos.filter(function (g) { return Seguidos.sigo(g.id); }); },
    actualizarAcceso: function () { actualizarAcceso(); }
  };
  Conciertos.iniciar(piezas);
  Novedades.iniciar(piezas);
  Panel.iniciar(piezas);
  Kit.iniciar(piezas);

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  fetch('grupos.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (datos) {
      grupos = (datos.grupos || [])
        .map(function (g) {
          g._nombre = normalizar(g.nombre);
          g._familias = familiasDe(g.estilos);
          return g;
        })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); })
        .map(function (g, i) {
          g._acento = i % 2 ? 'acento-ambar' : 'acento-cian';
          return g;
        });
      pintarFiltros();
      pintarLista();
      window.addEventListener('hashchange', alCambiarRuta);
      alCambiarRuta();
    })
    .catch(function () {
      el.aviso.textContent = 'No se han podido cargar los grupos. Revisa la conexión y vuelve a intentarlo.';
      el.aviso.hidden = false;
    });

  // Guarda la app en el móvil para que cargue rápido y se pueda instalar.
  // sw.js guarda cada versión entera; cuando hay una nueva completa, la
  // activa de golpe y aquí se recarga la pantalla una sola vez.
  if ('serviceWorker' in navigator) {
    var habiaVersion = !!navigator.serviceWorker.controller;
    var recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // La primera vez que se instala no hace falta recargar: ya es la versión nueva.
      if (!habiaVersion || recargando) return;
      recargando = true;
      location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (registro) {
        // Al volver a la app (por ejemplo, desde otra app del móvil) se mira si hay versión nueva.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') registro.update().catch(function () {});
        });
      }).catch(function () {});
    });
  }
})();
