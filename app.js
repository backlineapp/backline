// backline — el backstage de tus grupos favoritos.
// Lee grupos.json y muestra tres pantallas: Explorar, Mis grupos y Ficha de grupo.
// La lista de grupos seguidos la gestiona seguidos.js.

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

  // Nunca se enlaza a redes sociales, aunque llegaran en los datos.
  var PROHIBIDOS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com)$/i;

  var grupos = [];
  var estado = { texto: '', familia: null };
  // Posición de la lista en cada pantalla, para volver al mismo sitio.
  var scrolls = { explorar: 0, 'mis-grupos': 0 };
  // Pantalla desde la que se abrió la ficha ('explorar', 'mis-grupos' o null).
  var origen = null;
  var pantallaActual = null;

  var el = {
    explorar: document.getElementById('pantalla-explorar'),
    misGrupos: document.getElementById('pantalla-mis-grupos'),
    ficha: document.getElementById('pantalla-ficha'),
    buscador: document.getElementById('buscador'),
    filtros: document.getElementById('filtros'),
    contador: document.getElementById('contador'),
    lista: document.getElementById('lista'),
    contadorMios: document.getElementById('contador-mis-grupos'),
    listaMios: document.getElementById('lista-mis-grupos'),
    sinGrupos: document.getElementById('sin-grupos'),
    pestanaExplorar: document.getElementById('pestana-explorar'),
    pestanaMisGrupos: document.getElementById('pestana-mis-grupos'),
    contenidoFicha: document.getElementById('ficha'),
    volver: document.getElementById('volver'),
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

  function urlPermitida(url) {
    try {
      var u = new URL(url);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !PROHIBIDOS.test(u.hostname);
    } catch (e) {
      return false;
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
  // de la dirección: _16 es la grande (700 px) y _7 una pequeña (160 px).
  function portadaPequena(url) {
    return /bcbits\.com\/img\/a\d+_\d+\.jpg$/.test(url) ? url.replace(/_\d+\.jpg$/, '_7.jpg') : url;
  }

  function cuadroIniciales(grupo, clase) {
    var caja = crear('div', 'portada iniciales' + (clase ? ' ' + clase : ''), iniciales(grupo.nombre));
    caja.setAttribute('aria-hidden', 'true');
    return caja;
  }

  // Portada enlazada directamente desde Bandcamp (no se guarda en la app).
  // Si no carga, se prueba el tamaño grande y, si tampoco, las iniciales.
  function imagenPortada(grupo, opciones) {
    var original = grupo.portada;
    if (!original || !urlPermitida(original)) return opciones.alternativa();
    var img = document.createElement('img');
    img.className = opciones.clase || '';
    img.alt = opciones.alt || '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    if (opciones.perezosa) img.loading = 'lazy';
    img.src = opciones.pequena ? portadaPequena(original) : original;
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

  // ---------- Pantalla de arranque ----------

  function quitarArranque() {
    var a = el.arranque;
    if (!a || a.classList.contains('saliendo')) return;
    a.classList.add('saliendo');
    setTimeout(function () { a.hidden = true; }, 400);
  }

  if (el.arranque) {
    el.arranque.addEventListener('click', quitarArranque);
    el.arranque.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') quitarArranque();
    });
    setTimeout(quitarArranque, 2600);
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
    datos.appendChild(botonSeguir(grupo));
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

    // Discografía. La portada va en el disco más reciente.
    var discos = separarDiscos(grupo.discografia);
    if (discos.length) {
      var masReciente = 0;
      discos.forEach(function (d, i) {
        if (anioDe(d) > anioDe(discos[masReciente])) masReciente = i;
      });

      f.appendChild(crear('h2', null, 'Discografía · ' + discos.length));
      var ul = crear('ul', 'discos');
      discos.forEach(function (d, i) {
        var partes = partirDisco(d);
        var li = crear('li', 'disco');
        function nota() {
          var n = crear('div', 'portada iniciales nota', '♪');
          n.setAttribute('aria-hidden', 'true');
          return n;
        }
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

    // Más adelante llevará enlace
    f.appendChild(crear('p', 'reclamar', '¿Es tu grupo? Gestiona o retira tu ficha'));
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
    if (pantalla === 'ficha' && pantallaActual !== 'ficha') origen = pantallaActual;
    pantallaActual = pantalla;

    el.explorar.hidden = pantalla !== 'explorar';
    el.misGrupos.hidden = pantalla !== 'mis-grupos';
    el.ficha.hidden = pantalla !== 'ficha';

    // En la ficha se ilumina la pestaña desde la que se llegó.
    var pestana = pantalla === 'ficha' ? (origen || 'explorar') : pantalla;
    marcarPestana(el.pestanaExplorar, pestana === 'explorar');
    marcarPestana(el.pestanaMisGrupos, pestana === 'mis-grupos');
    el.volver.textContent = origen === 'mis-grupos' ? '← Mis grupos' : '← Explorar';
  }

  function marcarPestana(pestana, activa) {
    if (activa) pestana.setAttribute('aria-current', 'page');
    else pestana.removeAttribute('aria-current');
  }

  function alCambiarRuta() {
    var ruta = location.hash.replace(/^#\/?/, '');
    var partes = ruta.split('/');

    if (partes[0] === 'grupo' && partes[1]) {
      var id = decodeURIComponent(partes[1]);
      var grupo = grupos.filter(function (g) { return g.id === id; })[0];
      pintarFicha(grupo);
      document.title = grupo ? grupo.nombre + ' · backline' : 'backline';
      mostrar('ficha');
      window.scrollTo(0, 0);
      return;
    }

    if (partes[0] === 'mis-grupos') {
      pintarMisGrupos();
      document.title = 'Mis grupos · backline';
      mostrar('mis-grupos');
      window.scrollTo(0, scrolls['mis-grupos']);
      return;
    }

    document.title = 'backline';
    mostrar('explorar');
    window.scrollTo(0, scrolls.explorar);
  }

  el.volver.addEventListener('click', function () {
    // Si veníamos de una lista, volvemos atrás como el botón del móvil.
    if (origen && history.length > 1) {
      history.back();
    } else {
      location.hash = '#/';
    }
  });

  // Si la lista cambia en otra pestaña del navegador, Mis grupos se actualiza.
  Seguidos.alCambiar(function () {
    if (pantallaActual === 'mis-grupos') pintarMisGrupos();
  });

  el.buscador.addEventListener('input', function () {
    estado.texto = el.buscador.value;
    pintarLista();
  });

  // ---------- Arranque ----------

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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
