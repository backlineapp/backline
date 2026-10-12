// backline — el backstage de tus grupos favoritos.
// Lee grupos.json y muestra dos pantallas: Explorar y Ficha de grupo.

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

  // Nunca se enlaza a redes sociales, aunque llegaran en los datos.
  var PROHIBIDOS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com)$/i;

  var grupos = [];
  var estado = { texto: '', familia: null, scroll: 0 };
  var vengoDeExplorar = false;

  var el = {
    explorar: document.getElementById('pantalla-explorar'),
    ficha: document.getElementById('pantalla-ficha'),
    buscador: document.getElementById('buscador'),
    filtros: document.getElementById('filtros'),
    contador: document.getElementById('contador'),
    lista: document.getElementById('lista'),
    contenidoFicha: document.getElementById('ficha'),
    volver: document.getElementById('volver'),
    aviso: document.getElementById('aviso')
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

    var trozo = document.createDocumentFragment();
    visibles.forEach(function (g) {
      var li = document.createElement('li');
      var a = crear('a', 'tarjeta');
      a.href = '#/grupo/' + encodeURIComponent(g.id);
      a.appendChild(crear('h3', 'tarjeta-nombre', g.nombre));
      a.appendChild(crear('p', 'tarjeta-estilos', g.estilos));
      if (g.ciudad) a.appendChild(crear('p', 'tarjeta-ciudad', g.ciudad));
      li.appendChild(a);
      trozo.appendChild(li);
    });
    el.lista.appendChild(trozo);
  }

  // ---------- Pantalla 2: Ficha de grupo ----------

  function pintarFicha(grupo) {
    var f = el.contenidoFicha;
    f.textContent = '';

    if (!grupo) {
      f.appendChild(crear('p', 'aviso', 'No encontramos este grupo.'));
      return;
    }

    f.appendChild(crear('h1', 'ficha-nombre', grupo.nombre));
    f.appendChild(crear('p', 'ficha-estilos', grupo.estilos));
    if (grupo.ciudad) f.appendChild(crear('p', 'ficha-ciudad', grupo.ciudad));

    var enlaces = ENLACES.filter(function (e) {
      return grupo[e.campo] && urlPermitida(grupo[e.campo]);
    });
    if (enlaces.length) {
      var caja = crear('div', 'enlaces');
      enlaces.forEach(function (e, i) {
        var a = crear('a', 'boton-enlace' + (i > 0 ? ' secundario' : ''), e.texto);
        a.href = grupo[e.campo];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        caja.appendChild(a);
      });
      f.appendChild(caja);
    }

    var discos = separarDiscos(grupo.discografia);
    if (discos.length) {
      f.appendChild(crear('h2', null, 'Discografía'));
      var ul = crear('ul', 'discografia');
      discos.forEach(function (d) { ul.appendChild(crear('li', null, d)); });
      f.appendChild(ul);
    }
  }

  // ---------- Navegación entre pantallas ----------

  function mostrar(pantalla) {
    el.explorar.hidden = pantalla !== 'explorar';
    el.ficha.hidden = pantalla !== 'ficha';
  }

  function alCambiarRuta() {
    var ruta = location.hash.replace(/^#\/?/, '');
    var partes = ruta.split('/');

    if (partes[0] === 'grupo' && partes[1]) {
      if (!el.explorar.hidden) {
        estado.scroll = window.scrollY;
        vengoDeExplorar = true;
      }
      var id = decodeURIComponent(partes[1]);
      var grupo = grupos.filter(function (g) { return g.id === id; })[0];
      pintarFicha(grupo);
      document.title = grupo ? grupo.nombre + ' · backline' : 'backline';
      mostrar('ficha');
      window.scrollTo(0, 0);
      return;
    }

    document.title = 'backline';
    mostrar('explorar');
    window.scrollTo(0, estado.scroll);
  }

  el.volver.addEventListener('click', function () {
    // Si veníamos de Explorar, volvemos atrás como el botón del móvil.
    if (vengoDeExplorar && history.length > 1) {
      history.back();
    } else {
      location.hash = '#/';
    }
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
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
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
