// backline — acceso con código, "¿Es tu grupo?" y "Mi panel".
//
// Acceso: correo + código de 6 cifras que llega por email (sin contraseñas).
// ¿Es tu grupo?: pedir gestionar una ficha o que se retire, y ver cómo va.
// Mi panel:
//   · administrador: publicar en cualquier grupo, Solicitudes (aprobar o
//     rechazar) y Miembros (quién gestiona cada grupo, y quitar a alguien).
//   · miembro de un grupo: publicar, editar y borrar conciertos y giras de
//     su grupo (o sus grupos). Nada de otros grupos.
// Lo que cada cuenta puede hacer lo decide la base de datos
// (supabase/5-miembros.sql): aunque alguien llegara a una pantalla que no le
// toca, no podría guardar nada.

(function () {
  'use strict';

  var LADO_CARTEL = 1200;     // píxeles del lado más largo del cartel
  var CALIDAD_CARTEL = 0.85;  // calidad JPEG

  var ayuda = null;
  // Correo al que se ha mandado el código (entre los dos pasos del acceso).
  var correoPendiente = '';
  // Mensaje para mostrar al volver al panel ("Publicado", "Borrado"...).
  var avisoPanel = '';
  // Mensaje para mostrar al volver a "¿Es tu grupo?" ("Solicitud enviada").
  var avisoGestionar = '';

  function iniciar(piezas) { ayuda = piezas; }

  function crear(etiqueta, clase, texto) { return ayuda.crear(etiqueta, clase, texto); }

  function boton(texto, clase, alPulsar) {
    var b = crear('button', clase || 'boton', texto);
    b.type = 'button';
    if (alPulsar) b.addEventListener('click', alPulsar);
    return b;
  }

  function mensaje(caja, texto, tipo) {
    caja.textContent = texto || '';
    caja.className = 'mensaje' + (tipo ? ' ' + tipo : '');
    caja.hidden = !texto;
  }

  function titular(contenedor, titulo, texto) {
    var t = crear('div', 'titular');
    t.appendChild(crear('h1', null, titulo));
    if (texto) t.appendChild(crear('p', null, texto));
    contenedor.appendChild(t);
  }

  // Campo de formulario con su etiqueta.
  function campo(etiqueta, control, nota) {
    var caja = crear('label', 'campo');
    caja.appendChild(crear('span', 'campo-etiqueta', etiqueta));
    caja.appendChild(control);
    if (nota) caja.appendChild(crear('span', 'campo-nota', nota));
    return caja;
  }

  function entrada(tipo, valor, extra) {
    var i = document.createElement('input');
    i.type = tipo;
    if (valor != null) i.value = valor;
    Object.keys(extra || {}).forEach(function (k) { i.setAttribute(k, extra[k]); });
    return i;
  }

  function areaTexto(valor, extra) {
    var t = document.createElement('textarea');
    if (valor != null) t.value = valor;
    Object.keys(extra || {}).forEach(function (k) { t.setAttribute(k, extra[k]); });
    return t;
  }

  // "12 oct 2026, 18:05" (hora de Madrid)
  function fechaHora(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso)).replace(/\./g, '');
  }

  // ¿Tiene esta cuenta "Mi panel"? El administrador, o quien gestiona algún
  // grupo que siga en grupos.json.
  function tienePanel(cuenta) {
    return !!(cuenta && (cuenta.admin || gruposPermitidos(cuenta).length));
  }

  // Grupos en los que puede publicar: todos (administrador) o los suyos.
  // Un grupo que ya no está en grupos.json no aparece.
  function gruposPermitidos(cuenta) {
    if (!cuenta) return [];
    var todos = ayuda.todosLosGrupos();
    if (cuenta.admin) return todos;
    return todos.filter(function (g) { return (cuenta.grupos || []).indexOf(g.id) !== -1; });
  }

  function permitido(cuenta, grupoId) {
    return gruposPermitidos(cuenta).some(function (g) { return g.id === grupoId; });
  }

  // "A", "A y B", "A, B y C"
  function enumerar(nombres) {
    if (nombres.length < 2) return nombres.join('');
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }

  function nombreGrupo(grupoId) {
    var g = ayuda.grupoPorId(grupoId);
    return g ? g.nombre : grupoId;
  }

  var ESTADOS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

  function etiquetaEstado(estado) {
    return crear('span', 'estado estado-' + estado, ESTADOS[estado] || estado);
  }

  function selector(opciones, valor, vacio) {
    var s = document.createElement('select');
    if (vacio) {
      var o = crear('option', null, vacio);
      o.value = '';
      s.appendChild(o);
    }
    opciones.forEach(function (op) {
      var o = crear('option', null, op.texto);
      o.value = op.valor;
      s.appendChild(o);
    });
    s.value = valor || '';
    return s;
  }

  // ---------- Acceso ----------

  function pintarAcceso(contenedor) {
    contenedor.textContent = '';
    titular(contenedor, 'Acceso', null);
    var caja = crear('div', 'formulario');
    contenedor.appendChild(caja);
    var aviso = crear('p', 'mensaje');
    aviso.hidden = true;

    if (!Nube.disponible) {
      mensaje(aviso, 'No se ha podido conectar. Revisa la conexión y vuelve a intentarlo.', 'error');
      caja.appendChild(aviso);
      return;
    }

    Nube.listo.then(function () {
      var cuenta = Nube.cuenta();
      caja.textContent = '';

      // Ya ha entrado
      if (cuenta) {
        caja.appendChild(crear('p', 'formulario-texto', 'Has entrado como ' + cuenta.correo + '.'));
        if (tienePanel(cuenta)) {
          var irPanel = crear('a', 'boton boton-ancho', 'Ir a mi panel');
          irPanel.href = '#/panel';
          caja.appendChild(irPanel);
        } else {
          caja.appendChild(crear('p', 'formulario-texto', 'Si tienes un grupo, entra en su ficha y pulsa «¿Es tu grupo?» para pedir gestionarla. Mientras tanto, puedes seguir usando la app igual que siempre.'));
        }
        caja.appendChild(boton('Salir', 'boton-secundario boton-ancho', function () {
          Nube.salir().then(function () { pintarAcceso(contenedor); });
        }));
        return;
      }

      caja.appendChild(crear('p', 'formulario-texto', 'Escribe tu correo y te enviaremos un código de 6 cifras para entrar. Sin contraseñas.'));
      formularioAcceso(caja, function (c) {
        if (tienePanel(c)) location.hash = '#/panel';
        else pintarAcceso(contenedor);
      });
    });
  }

  // Los dos pasos del acceso (correo y código) dentro de "caja". Al entrar,
  // llama a alEntrar(cuenta). Lo usan Acceso y "¿Es tu grupo?".
  function formularioAcceso(caja, alEntrar) {
    var aviso = crear('p', 'mensaje');
    aviso.hidden = true;

    // Paso 1: correo
    var formCorreo = crear('form', 'formulario-paso');
    formCorreo.noValidate = true;
    var correo = entrada('email', correoPendiente, { autocomplete: 'email', inputmode: 'email', placeholder: 'tu@correo.com', required: '' });
    formCorreo.appendChild(campo('Correo', correo));
    var enviar = crear('button', 'boton boton-ancho', 'Enviar código');
    enviar.type = 'submit';
    formCorreo.appendChild(enviar);

    // Paso 2: código
    var formCodigo = crear('form', 'formulario-paso');
    formCodigo.noValidate = true;
    formCodigo.hidden = true;
    var explicacion = crear('p', 'formulario-texto');
    formCodigo.appendChild(explicacion);
    var codigo = entrada('text', '', {
      autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6',
      placeholder: '······', 'class': 'codigo', 'aria-label': 'Código de 6 cifras'
    });
    formCodigo.appendChild(campo('Código', codigo));
    var entrar = crear('button', 'boton boton-ancho', 'Entrar');
    entrar.type = 'submit';
    formCodigo.appendChild(entrar);
    var otras = crear('div', 'formulario-otras');
    otras.appendChild(boton('Cambiar de correo', 'boton-texto', function () {
      mostrarPaso(1);
    }));
    otras.appendChild(boton('Enviar otro código', 'boton-texto', function () {
      pedirCodigo();
    }));
    formCodigo.appendChild(otras);

    caja.appendChild(formCorreo);
    caja.appendChild(formCodigo);
    caja.appendChild(aviso);

    function mostrarPaso(n) {
      formCorreo.hidden = n !== 1;
      formCodigo.hidden = n !== 2;
      mensaje(aviso, '');
      if (n === 1) correo.focus();
      else {
        explicacion.textContent = 'Te hemos enviado un código a ' + correoPendiente + '. Escríbelo aquí (mira también en correo no deseado).';
        codigo.value = '';
        codigo.focus();
      }
    }

    function pedirCodigo() {
      var valor = correo.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
        mensaje(aviso, 'Revisa el correo: no parece válido.', 'error');
        return;
      }
      enviar.disabled = true;
      mensaje(aviso, 'Enviando código…');
      Nube.enviarCodigo(valor).then(function () {
        correoPendiente = valor;
        mostrarPaso(2);
      }, function (e) {
        mensaje(aviso, e.message, 'error');
      }).then(function () { enviar.disabled = false; });
    }

    formCorreo.addEventListener('submit', function (e) {
      e.preventDefault();
      pedirCodigo();
    });

    formCodigo.addEventListener('submit', function (e) {
      e.preventDefault();
      var valor = codigo.value.replace(/\D/g, '');
      if (valor.length !== 6) {
        mensaje(aviso, 'El código tiene 6 cifras.', 'error');
        return;
      }
      entrar.disabled = true;
      mensaje(aviso, 'Comprobando…');
      Nube.entrar(correoPendiente, valor).then(function (cuenta) {
        correoPendiente = '';
        alEntrar(cuenta);
      }, function (err) {
        entrar.disabled = false;
        mensaje(aviso, err.message, 'error');
      });
    });

    if (correoPendiente) mostrarPaso(2);
  }

  // ---------- Panel ----------

  function pintarPanel(contenedor, partes) {
    contenedor.textContent = '';
    if (!Nube.disponible) {
      contenedor.appendChild(crear('p', 'aviso', 'No se ha podido conectar. Revisa la conexión y vuelve a intentarlo.'));
      return;
    }
    contenedor.appendChild(crear('p', 'vacio', 'Cargando…'));

    // Se vuelve a preguntar qué puede hacer la cuenta: así, si el
    // administrador acaba de aprobarla (o de quitarla), se nota al momento.
    Nube.listo.then(Nube.refrescarCuenta).then(function (cuenta) {
      if (!tienePanel(cuenta)) {
        contenedor.textContent = '';
        titular(contenedor, 'Mi panel', null);
        var caja = crear('div', 'sin-grupos');
        caja.appendChild(crear('p', 'sin-grupos-texto', cuenta
          ? 'Esta pantalla es para el administrador y para los grupos que gestionan su ficha. Si tienes un grupo, entra en su ficha y pulsa «¿Es tu grupo?».'
          : 'Para ver tu panel, primero entra con tu correo.'));
        var a = crear('a', 'boton', cuenta ? 'Ir a Explorar' : 'Ir a Acceso');
        a.href = cuenta ? '#/explorar' : '#/acceso';
        caja.appendChild(a);
        contenedor.appendChild(caja);
        return;
      }

      // #/panel/concierto/nuevo · #/panel/gira/nueva · #/panel/editar/<id>
      // Solo administrador: #/panel/solicitudes · #/panel/miembros
      if (cuenta.admin && partes[1] === 'solicitudes') {
        pintarSolicitudes(contenedor, cuenta);
      } else if (cuenta.admin && partes[1] === 'miembros') {
        pintarMiembros(contenedor);
      } else if (partes[1] === 'concierto' || partes[1] === 'gira') {
        pintarFormulario(contenedor, { tipo: partes[1], fechas: [] }, cuenta);
      } else if (partes[1] === 'editar' && partes[2]) {
        Nube.publicacion(partes[2]).then(function (pub) {
          if (!pub) {
            avisoPanel = 'Esa publicación ya no existe.';
            location.hash = '#/panel';
            return;
          }
          if (!permitido(cuenta, pub.grupo_id)) {
            avisoPanel = ayuda.grupoPorId(pub.grupo_id)
              ? 'Esa publicación es de un grupo que no gestionas.'
              : 'Ese grupo ya no está en la lista de grupos: no se puede editar.';
            location.hash = '#/panel';
            return;
          }
          pintarFormulario(contenedor, pub, cuenta);
        }, function (e) {
          contenedor.textContent = '';
          contenedor.appendChild(crear('p', 'aviso', e.message));
        });
      } else {
        pintarLista(contenedor, cuenta);
      }
    });
  }

  function ordenarFechas(fechas) {
    return (fechas || []).slice().sort(function (a, b) {
      return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : String(a.hora || '').localeCompare(String(b.hora || ''));
    });
  }

  function hoy() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  // Aviso guardado para esta pantalla ("Publicado", "Borrado"...), una sola vez.
  function avisoGuardado(contenedor) {
    var aviso = crear('p', 'mensaje');
    mensaje(aviso, avisoPanel, 'ok');
    avisoPanel = '';
    contenedor.appendChild(aviso);
    return aviso;
  }

  function enlacePanel(contenedor) {
    var a = crear('a', 'volver', '← Mi panel');
    a.href = '#/panel';
    contenedor.appendChild(a);
  }

  // Número de solicitudes pendientes, en ámbar (vacío si no hay).
  function punto(n) {
    var p = crear('span', 'punto', String(n));
    p.hidden = !n;
    return p;
  }

  function pintarLista(contenedor, cuenta) {
    contenedor.textContent = '';
    titular(contenedor, 'Mi panel', 'Has entrado como ' + cuenta.correo + '.');
    var mios = gruposPermitidos(cuenta);
    if (!cuenta.admin) {
      var nombres = mios.map(function (g) { return g.nombre; });
      contenedor.appendChild(crear('p', 'formulario-texto panel-grupos',
        (nombres.length === 1 ? 'Gestionas la ficha de ' : 'Gestionas las fichas de ') + enumerar(nombres) + '.'));
    }

    var aviso = avisoGuardado(contenedor);

    // Administrador: Solicitudes (con las pendientes) y Miembros.
    if (cuenta.admin) {
      var atajos = crear('div', 'opciones-publicar atajos-admin');
      var solicitudes = crear('a', 'opcion');
      solicitudes.href = '#/panel/solicitudes';
      var tituloSol = crear('span', 'opcion-titulo', 'Solicitudes ');
      var numero = punto(0);
      tituloSol.appendChild(numero);
      solicitudes.appendChild(tituloSol);
      var detalleSol = crear('span', 'opcion-detalle', 'Cargando…');
      solicitudes.appendChild(detalleSol);
      atajos.appendChild(solicitudes);
      var miembros = crear('a', 'opcion');
      miembros.href = '#/panel/miembros';
      miembros.appendChild(crear('span', 'opcion-titulo', 'Miembros'));
      miembros.appendChild(crear('span', 'opcion-detalle', 'Quién gestiona cada grupo'));
      atajos.appendChild(miembros);
      contenedor.appendChild(atajos);
      Nube.contarPendientes().then(function (n) {
        numero.textContent = String(n);
        numero.hidden = !n;
        detalleSol.textContent = !n ? 'Ninguna pendiente' : n === 1 ? '1 pendiente' : n + ' pendientes';
      }, function () { detalleSol.textContent = 'Gestionar y retirar fichas'; });
    }

    // Botón "Publicar" con sus dos opciones
    var publicar = boton('Publicar', 'boton boton-ancho');
    var opciones = crear('div', 'opciones-publicar');
    opciones.hidden = true;
    [
      { texto: 'Concierto', detalle: 'Una fecha con su cartel', href: '#/panel/concierto/nuevo' },
      { texto: 'Gira', detalle: 'Un cartel y varias fechas', href: '#/panel/gira/nueva' }
    ].forEach(function (op) {
      var a = crear('a', 'opcion');
      a.href = op.href;
      a.appendChild(crear('span', 'opcion-titulo', op.texto));
      a.appendChild(crear('span', 'opcion-detalle', op.detalle));
      opciones.appendChild(a);
    });
    publicar.addEventListener('click', function () {
      opciones.hidden = !opciones.hidden;
      publicar.setAttribute('aria-expanded', String(!opciones.hidden));
    });
    publicar.setAttribute('aria-expanded', 'false');
    contenedor.appendChild(publicar);
    contenedor.appendChild(opciones);

    contenedor.appendChild(crear('p', 'etiqueta-seccion', 'Publicado'));
    var lista = crear('ul', 'lista');
    lista.appendChild(crear('li', 'vacio', 'Cargando…'));
    contenedor.appendChild(lista);

    var salir = boton('Salir', 'boton-texto salir', function () {
      Nube.salir().then(function () { location.hash = '#/acceso'; });
    });
    contenedor.appendChild(salir);

    var ids = cuenta.admin ? null : mios.map(function (g) { return g.id; });
    Nube.publicaciones(ids).then(function (pubs) {
      lista.textContent = '';
      if (!pubs.length) {
        lista.appendChild(crear('li', 'vacio', cuenta.admin ? 'Aún no has publicado nada.' : 'Aún no hay nada publicado de tu grupo.'));
        return;
      }
      pubs.forEach(function (pub) { lista.appendChild(filaPublicacion(pub, aviso, contenedor, cuenta)); });
    }, function (e) {
      lista.textContent = '';
      lista.appendChild(crear('li', 'aviso', e.message));
    });
  }

  function describir(pub) {
    var grupo = ayuda.grupoPorId(pub.grupo_id);
    var fechas = ordenarFechas(pub.fechas);
    var nombre = grupo ? grupo.nombre : pub.grupo_id;
    if (pub.tipo === 'gira') {
      return { nombre: nombre, titulo: pub.titulo || 'Gira sin nombre', fechas: fechas };
    }
    var f = fechas[0];
    return { nombre: nombre, titulo: f ? Conciertos.fechaCorta(f.fecha) + ' · ' + f.sala : 'Sin fecha', fechas: fechas };
  }

  function filaPublicacion(pub, aviso, contenedor, cuenta) {
    var d = describir(pub);
    var grupo = ayuda.grupoPorId(pub.grupo_id);
    var li = crear('li', 'publicado ' + (grupo ? grupo._acento : ''));

    var url = Nube.urlCartel(pub.cartel);
    if (url) {
      var img = document.createElement('img');
      img.className = 'portada cartel-mini';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      li.appendChild(img);
    } else {
      var n = crear('div', 'portada iniciales nota', '♪');
      n.setAttribute('aria-hidden', 'true');
      li.appendChild(n);
    }

    var texto = crear('div', 'tarjeta-texto');
    texto.appendChild(crear('h3', 'tarjeta-nombre', d.nombre));
    texto.appendChild(crear('p', 'publicado-titulo', d.titulo));
    var proximas = d.fechas.filter(function (f) { return f.fecha >= hoy(); }).length;
    var estado = pub.tipo === 'gira'
      ? 'Gira · ' + d.fechas.length + (d.fechas.length === 1 ? ' fecha' : ' fechas') + ' · ' + proximas + (proximas === 1 ? ' próxima' : ' próximas')
      : 'Concierto · ' + (proximas ? 'próximo' : 'ya pasado, no se muestra');
    // Si el grupo ya no está en grupos.json, sus conciertos no se muestran.
    if (!grupo) estado = (pub.tipo === 'gira' ? 'Gira' : 'Concierto') + ' · el grupo ya no está en la lista: no se muestra';
    texto.appendChild(crear('p', 'publicado-estado', estado));
    li.appendChild(texto);

    var botones = crear('div', 'publicado-botones');
    if (grupo) {
      var editar = crear('a', 'boton-secundario boton-pequeno', 'Editar');
      editar.href = '#/panel/editar/' + encodeURIComponent(pub.id);
      botones.appendChild(editar);
    }
    botones.appendChild(boton('Borrar', 'boton-secundario boton-pequeno peligro', function (e) {
      var que = pub.tipo === 'gira' ? 'la gira «' + (pub.titulo || '') + '» de ' + d.nombre + ' con todas sus fechas'
        : 'el concierto de ' + d.nombre;
      if (!confirm('¿Borrar ' + que + '? También se borrará su cartel. No se puede deshacer.')) return;
      e.currentTarget.disabled = true;
      Nube.borrar(pub).then(function () {
        avisoPanel = 'Borrado.';
        pintarLista(contenedor, cuenta);
      }, function (err) {
        e.currentTarget.disabled = false;
        mensaje(aviso, err.message, 'error');
      });
    }));
    li.appendChild(botones);
    return li;
  }

  // ---------- Formulario de concierto o gira ----------

  // Reduce la foto elegida a unos 1200 px y la convierte a JPEG.
  function reducirImagen(archivo) {
    return new Promise(function (resolver, rechazar) {
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_CARTEL / Math.max(img.naturalWidth, img.naturalHeight));
        var ancho = Math.max(1, Math.round(img.naturalWidth * escala));
        var alto = Math.max(1, Math.round(img.naturalHeight * escala));
        var lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        var ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, ancho, alto);
        ctx.drawImage(img, 0, 0, ancho, alto);
        URL.revokeObjectURL(url);
        lienzo.toBlob(function (blob) {
          if (blob) resolver({ blob: blob, ancho: ancho, alto: alto });
          else rechazar(new Error('No se ha podido preparar la imagen.'));
        }, 'image/jpeg', CALIDAD_CARTEL);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        rechazar(new Error('No se ha podido leer la imagen. Prueba con otra foto.'));
      };
      img.src = url;
    });
  }

  function opcionesGrupos(cuenta) {
    return gruposPermitidos(cuenta).map(function (g) { return { valor: g.id, texto: g.nombre }; });
  }

  function opcionesProvincias() {
    return Conciertos.PROVINCIAS.map(function (p) { return { valor: p, texto: p }; });
  }

  // Sugerencias del campo País (se puede escribir cualquier otro).
  function listaPaises() {
    var lista = document.createElement('datalist');
    lista.id = 'lista-paises';
    [Conciertos.ESPANA].concat(Conciertos.PAISES).forEach(function (p) {
      var o = document.createElement('option');
      o.value = p;
      lista.appendChild(o);
    });
    return lista;
  }

  // Bloque con los campos de una fecha. Devuelve { nodo, leer(), id }.
  function bloqueFecha(f, conPrecio, alQuitar) {
    f = f || {};
    var nodo = crear('fieldset', 'bloque-fecha');
    var fecha = entrada('date', f.fecha, { required: '' });
    var hora = entrada('time', Conciertos.hora(f.hora), { required: '' });
    var ciudad = entrada('text', f.ciudad, { required: '', maxlength: '120', autocomplete: 'off' });
    var provincia = selector(opcionesProvincias(), Conciertos.provinciaDe(f), 'Elige provincia');
    var pais = entrada('text', Conciertos.paisDe(f), { required: '', maxlength: '60', autocomplete: 'off', list: 'lista-paises' });
    var sala = entrada('text', f.sala, { required: '', maxlength: '160', autocomplete: 'off' });
    var precio = entrada('text', f.precio, { maxlength: '80', placeholder: 'Ej.: 12 € anticipada / 15 € taquilla' });
    var entradas = entrada('url', f.entradas, { inputmode: 'url', placeholder: 'https://…' });

    var fila = crear('div', 'campos-dos');
    fila.appendChild(campo('Fecha', fecha));
    fila.appendChild(campo('Hora', hora, 'Hora del lugar del concierto'));
    nodo.appendChild(fila);
    var fila2 = crear('div', 'campos-dos');
    fila2.appendChild(campo('País', pais));
    var campoProvincia = campo('Provincia', provincia);
    fila2.appendChild(campoProvincia);
    nodo.appendChild(fila2);
    nodo.appendChild(campo('Ciudad', ciudad));
    // Fuera de España la provincia no hace falta: se esconde.
    function verProvincia() { campoProvincia.hidden = !Conciertos.esEspana(pais.value); }
    pais.addEventListener('input', verProvincia);
    pais.addEventListener('focus', function () { if (Conciertos.esEspana(pais.value)) pais.select(); });
    verProvincia();
    nodo.appendChild(campo('Sala', sala));
    if (conPrecio) nodo.appendChild(campo('Precio (opcional)', precio));
    nodo.appendChild(campo('Enlace a entradas (opcional)', entradas));

    if (alQuitar) {
      nodo.appendChild(boton('Quitar esta fecha', 'boton-texto peligro', function () { alQuitar(bloque); }));
    }

    var bloque = {
      nodo: nodo,
      id: f.id || null,
      leer: function () {
        var datos = {
          id: f.id || null,
          fecha: fecha.value,
          hora: hora.value,
          ciudad: ciudad.value.trim(),
          pais: Conciertos.paisCanonico(pais.value),
          provincia: Conciertos.esEspana(pais.value) ? provincia.value : '',
          sala: sala.value.trim(),
          precio: conPrecio ? precio.value.trim() : (f.precio || ''),
          entradas: entradas.value.trim()
        };
        if (!pais.value.trim()) datos.pais = '';
        datos.zona = Conciertos.zonaDe(datos.provincia, datos.pais);
        return datos;
      }
    };
    return bloque;
  }

  function validarFecha(d, n) {
    var donde = n ? ' (fecha ' + n + ')' : '';
    if (!d.fecha) return 'Falta el día' + donde + '.';
    if (!d.hora) return 'Falta la hora' + donde + '.';
    if (!d.ciudad) return 'Falta la ciudad' + donde + '.';
    if (!d.pais) return 'Falta el país' + donde + '.';
    if (d.pais === Conciertos.ESPANA && !d.provincia) return 'Falta la provincia' + donde + '.';
    if (!d.sala) return 'Falta la sala' + donde + '.';
    if (d.entradas && !ayuda.urlPermitida(d.entradas)) {
      return 'El enlace a entradas' + donde + ' no es válido (debe empezar por https:// y no puede ser de redes sociales).';
    }
    return '';
  }

  function pintarFormulario(contenedor, pub, cuenta) {
    contenedor.textContent = '';
    var esGira = pub.tipo === 'gira';
    var editando = !!pub.id;
    titular(contenedor, (editando ? 'Editar ' : 'Publicar ') + (esGira ? 'gira' : 'concierto'), null);

    var form = crear('form', 'formulario');
    form.noValidate = true;
    contenedor.appendChild(form);

    // Si solo gestiona un grupo, ya viene elegido.
    var opciones = opcionesGrupos(cuenta);
    var grupo = selector(opciones, pub.grupo_id || (opciones.length === 1 ? opciones[0].valor : ''), 'Elige grupo');
    form.appendChild(campo('Grupo', grupo));

    var nombreGira = entrada('text', pub.titulo, { maxlength: '200', autocomplete: 'off' });
    if (esGira) form.appendChild(campo('Nombre de la gira', nombreGira));

    // Cartel
    var cartelNuevo = null;
    var archivo = entrada('file', null, { accept: 'image/*' });
    var vista = crear('div', 'cartel-vista');
    var urlActual = Nube.urlCartel(pub.cartel);
    function verCartel(src) {
      vista.textContent = '';
      if (!src) {
        vista.appendChild(crear('span', 'cartel-vacio', 'Sin cartel'));
        return;
      }
      var img = document.createElement('img');
      img.src = src;
      img.alt = 'Cartel elegido';
      vista.appendChild(img);
    }
    verCartel(urlActual);
    var estadoCartel = crear('span', 'campo-nota', editando ? 'Elige otra imagen solo si quieres cambiar el cartel.' : 'Desde la galería del móvil. Se reducirá antes de subirla.');
    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      if (!f) return;
      estadoCartel.textContent = 'Preparando imagen…';
      reducirImagen(f).then(function (r) {
        cartelNuevo = r.blob;
        verCartel(URL.createObjectURL(r.blob));
        estadoCartel.textContent = 'Lista: ' + r.ancho + ' × ' + r.alto + ' px, ' + Math.round(r.blob.size / 1024) + ' KB.';
      }, function (e) {
        cartelNuevo = null;
        archivo.value = '';
        estadoCartel.textContent = e.message;
      });
    });
    var cajaCartel = crear('div', 'campo');
    cajaCartel.appendChild(crear('span', 'campo-etiqueta', 'Cartel'));
    cajaCartel.appendChild(vista);
    var elegir = crear('label', 'boton-secundario elegir-cartel', editando ? 'Cambiar cartel' : 'Elegir cartel');
    elegir.appendChild(archivo);
    cajaCartel.appendChild(elegir);
    cajaCartel.appendChild(estadoCartel);
    form.appendChild(cajaCartel);

    // Fechas
    var bloques = [];
    var borradas = [];
    var cajaFechas = crear('div', 'fechas-form');

    function numerar() {
      if (!esGira) return;
      bloques.forEach(function (b, i) {
        var leyenda = b.nodo.querySelector('legend');
        if (!leyenda) {
          leyenda = document.createElement('legend');
          b.nodo.insertBefore(leyenda, b.nodo.firstChild);
        }
        leyenda.textContent = 'Fecha ' + (i + 1);
      });
    }

    function quitar(bloque) {
      if (bloques.length === 1) {
        alert('Una gira necesita al menos una fecha.');
        return;
      }
      bloques.splice(bloques.indexOf(bloque), 1);
      if (bloque.id) borradas.push(bloque.id);
      bloque.nodo.remove();
      numerar();
    }

    function anadir(f) {
      var b = bloqueFecha(f, !esGira, esGira ? quitar : null);
      bloques.push(b);
      cajaFechas.appendChild(b.nodo);
      numerar();
      return b;
    }

    var existentes = ordenarFechas(pub.fechas);
    if (existentes.length) existentes.forEach(anadir);
    else anadir(null);

    if (esGira) form.appendChild(crear('p', 'etiqueta-seccion', 'Fechas'));
    form.appendChild(cajaFechas);
    form.appendChild(listaPaises());
    if (esGira) {
      form.appendChild(boton('+ Añadir fecha', 'boton-secundario boton-ancho', function () {
        var b = anadir(null);
        b.nodo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    }

    var aviso = crear('p', 'mensaje');
    aviso.hidden = true;
    form.appendChild(aviso);

    var guardar = crear('button', 'boton boton-ancho', editando ? 'Guardar cambios' : 'Publicar');
    guardar.type = 'submit';
    form.appendChild(guardar);
    var cancelar = crear('a', 'boton-texto cancelar', 'Cancelar');
    cancelar.href = '#/panel';
    form.appendChild(cancelar);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!grupo.value) return mensaje(aviso, 'Elige el grupo.', 'error');
      if (esGira && !nombreGira.value.trim()) return mensaje(aviso, 'Falta el nombre de la gira.', 'error');
      if (!cartelNuevo && !pub.cartel) return mensaje(aviso, 'Falta el cartel.', 'error');
      var fechas = bloques.map(function (b) { return b.leer(); });
      for (var i = 0; i < fechas.length; i++) {
        var fallo = validarFecha(fechas[i], esGira ? i + 1 : 0);
        if (fallo) return mensaje(aviso, fallo, 'error');
      }
      if (borradas.length && !confirm(borradas.length === 1
        ? 'Has quitado 1 fecha de la gira. Se borrará al guardar. ¿Seguir?'
        : 'Has quitado ' + borradas.length + ' fechas de la gira. Se borrarán al guardar. ¿Seguir?')) return;

      guardar.disabled = true;
      mensaje(aviso, cartelNuevo ? 'Subiendo cartel y guardando…' : 'Guardando…');
      Nube.guardar({
        id: pub.id,
        grupo_id: grupo.value,
        tipo: pub.tipo,
        titulo: esGira ? nombreGira.value.trim() : null,
        cartelAnterior: pub.cartel,
        cartelNuevo: cartelNuevo,
        fechas: fechas,
        fechasBorradas: borradas
      }).then(function () {
        avisoPanel = editando ? 'Cambios guardados.' : 'Publicado.';
        location.hash = '#/panel';
      }, function (err) {
        guardar.disabled = false;
        mensaje(aviso, err.message, 'error');
      });
    });
  }

  // ---------- Solicitudes (administrador) ----------

  function pintarSolicitudes(contenedor, cuenta) {
    contenedor.textContent = '';
    enlacePanel(contenedor);
    titular(contenedor, 'Solicitudes', 'Peticiones para gestionar o retirar una ficha.');
    var aviso = avisoGuardado(contenedor);
    var caja = crear('div', 'solicitudes');
    caja.appendChild(crear('p', 'vacio', 'Cargando…'));
    contenedor.appendChild(caja);
    ayuda.actualizarAcceso();

    Nube.solicitudes().then(function (r) {
      caja.textContent = '';
      caja.appendChild(crear('p', 'etiqueta-seccion', 'Pendientes · ' + r.pendientes.length));
      var ul = crear('ul', 'lista');
      if (!r.pendientes.length) ul.appendChild(crear('li', 'vacio', 'No hay solicitudes pendientes.'));
      r.pendientes.forEach(function (sol) {
        ul.appendChild(filaSolicitud(sol, cuenta, aviso, function () { pintarSolicitudes(contenedor, cuenta); }));
      });
      caja.appendChild(ul);

      if (r.resueltas.length) {
        caja.appendChild(crear('p', 'etiqueta-seccion', 'Resueltas hace poco'));
        var ul2 = crear('ul', 'lista');
        r.resueltas.forEach(function (sol) { ul2.appendChild(filaSolicitud(sol, cuenta, aviso, null)); });
        caja.appendChild(ul2);
      }
    }, function (e) {
      caja.textContent = '';
      caja.appendChild(crear('p', 'aviso', e.message));
    });
  }

  // Tarjeta de una solicitud. Con alResolver, lleva Aprobar y Rechazar.
  function filaSolicitud(sol, cuenta, aviso, alResolver) {
    var grupo = ayuda.grupoPorId(sol.grupo_id);
    var li = crear('li', 'solicitud ' + (grupo ? grupo._acento : ''));

    var cabecera = crear('div', 'solicitud-cabecera');
    var nombre = crear(grupo ? 'a' : 'h3', 'tarjeta-nombre', grupo ? grupo.nombre : sol.grupo_id + ' (ya no está en la lista)');
    if (grupo) nombre.href = '#/grupo/' + encodeURIComponent(grupo.id);
    cabecera.appendChild(nombre);
    cabecera.appendChild(etiquetaEstado(sol.estado));
    li.appendChild(cabecera);

    li.appendChild(crear('p', 'solicitud-tipo', sol.tipo === 'retirar' ? 'Pide que se retire la ficha' : 'Quiere gestionar la ficha'));
    li.appendChild(crear('p', 'solicitud-quien', sol.nombre + ' · ' + sol.papel));
    if (sol.correo) li.appendChild(crear('p', 'solicitud-dato', sol.correo));
    if (sol.mensaje) li.appendChild(crear('blockquote', 'solicitud-mensaje', sol.mensaje));
    if (sol.tipo === 'gestionar' && sol.acepta) {
      li.appendChild(crear('p', 'solicitud-dato', '✓ Ha marcado la casilla: forma parte del grupo o lo representa, y tiene derecho a publicar lo que suba.'));
    }
    li.appendChild(crear('p', 'solicitud-dato', 'Enviada el ' + fechaHora(sol.creado) +
      (sol.resuelto ? ' · ' + (ESTADOS[sol.estado] || '').toLowerCase() + ' el ' + fechaHora(sol.resuelto) : '')));

    if (!alResolver) return li;

    if (sol.usuario === cuenta.id) {
      li.appendChild(crear('p', 'solicitud-dato', 'Es tu propia solicitud: nadie puede resolver la suya.'));
      return li;
    }

    var nombreG = nombreGrupo(sol.grupo_id);
    var botones = crear('div', 'publicado-botones');
    var aprobar = boton('Aprobar', 'boton boton-pequeno boton-aprobar', function () {
      var pregunta = sol.tipo === 'retirar'
        ? '¿Aprobar la retirada de la ficha de ' + nombreG + '?\n\nLa ficha NO se quita sola: después tendrás que borrar el grupo de grupos.json.'
        : '¿Aprobar a ' + sol.nombre + '? Podrá publicar, editar y borrar conciertos y giras de ' + nombreG + '.';
      if (!confirm(pregunta)) return;
      resolver(true);
    });
    var rechazar = boton('Rechazar', 'boton-secundario boton-pequeno peligro', function () {
      if (!confirm('¿Rechazar la solicitud de ' + sol.nombre + ' para ' + nombreG + '?')) return;
      resolver(false);
    });
    botones.appendChild(rechazar);
    botones.appendChild(aprobar);
    li.appendChild(botones);

    function resolver(si) {
      aprobar.disabled = true;
      rechazar.disabled = true;
      Nube.resolverSolicitud(sol.id, si).then(function () {
        if (!si) avisoPanel = 'Solicitud rechazada.';
        else if (sol.tipo === 'retirar') avisoPanel = 'Aprobada. Recuerda quitar ' + nombreG + ' de grupos.json para retirar la ficha.';
        else avisoPanel = 'Aprobada. ' + sol.nombre + ' ya puede publicar en ' + nombreG + '.';
        alResolver();
      }, function (err) {
        aprobar.disabled = false;
        rechazar.disabled = false;
        mensaje(aviso, err.message, 'error');
        aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    return li;
  }

  // ---------- Miembros (administrador) ----------

  function pintarMiembros(contenedor) {
    contenedor.textContent = '';
    enlacePanel(contenedor);
    titular(contenedor, 'Miembros', 'Quién gestiona la ficha de cada grupo.');
    var aviso = avisoGuardado(contenedor);
    var caja = crear('div');
    caja.appendChild(crear('p', 'vacio', 'Cargando…'));
    contenedor.appendChild(caja);

    Nube.miembros().then(function (lista) {
      caja.textContent = '';
      if (!lista.length) {
        caja.appendChild(crear('p', 'vacio', 'Aún no hay miembros. Aparecerán aquí cuando apruebes una solicitud.'));
        return;
      }
      // Agrupados por grupo, en orden alfabético.
      var porGrupo = {};
      lista.forEach(function (m) { (porGrupo[m.grupo_id] = porGrupo[m.grupo_id] || []).push(m); });
      Object.keys(porGrupo).sort(function (a, b) {
        return nombreGrupo(a).localeCompare(nombreGrupo(b), 'es');
      }).forEach(function (id) {
        var grupo = ayuda.grupoPorId(id);
        var gente = porGrupo[id];
        caja.appendChild(crear('p', 'etiqueta-seccion',
          (grupo ? grupo.nombre : id + ' (ya no está en la lista)') + ' · ' + gente.length));
        var ul = crear('ul', 'lista');
        gente.forEach(function (m) { ul.appendChild(filaMiembro(m, grupo, aviso, contenedor)); });
        caja.appendChild(ul);
      });
    }, function (e) {
      caja.textContent = '';
      caja.appendChild(crear('p', 'aviso', e.message));
    });
  }

  function filaMiembro(m, grupo, aviso, contenedor) {
    var li = crear('li', 'publicado ' + (grupo ? grupo._acento : ''));
    var texto = crear('div', 'tarjeta-texto');
    texto.appendChild(crear('h3', 'tarjeta-nombre', m.nombre));
    texto.appendChild(crear('p', 'publicado-titulo', m.papel));
    texto.appendChild(crear('p', 'publicado-estado', [m.correo, 'desde el ' + fechaHora(m.creado)].filter(Boolean).join(' · ')));
    li.appendChild(texto);
    var botones = crear('div', 'publicado-botones');
    botones.appendChild(boton('Quitar', 'boton-secundario boton-pequeno peligro', function (e) {
      var nombreG = grupo ? grupo.nombre : m.grupo_id;
      if (!confirm('¿Quitar a ' + m.nombre + ' de ' + nombreG + '? Ya no podrá publicar en esta ficha. Lo que haya publicado se queda.')) return;
      var b = e.currentTarget;
      b.disabled = true;
      Nube.quitarMiembro(m.grupo_id, m.usuario).then(function () {
        avisoPanel = m.nombre + ' ya no gestiona ' + nombreG + '.';
        pintarMiembros(contenedor);
      }, function (err) {
        b.disabled = false;
        mensaje(aviso, err.message, 'error');
      });
    }));
    li.appendChild(botones);
    return li;
  }

  // ---------- ¿Es tu grupo? (gestionar o retirar la ficha) ----------

  var CASILLA = 'Formo parte del grupo o lo represento, y tengo derecho a publicar lo que suba (por ejemplo, los carteles)';

  function pintarGestionar(contenedor, grupo, alVolver) {
    contenedor.textContent = '';
    contenedor.className = 'gestionar' + (grupo ? ' ' + grupo._acento : '');
    contenedor.appendChild(boton('← ' + (grupo ? grupo.nombre : 'Explorar'), 'volver', alVolver));
    if (!grupo) {
      contenedor.appendChild(crear('p', 'aviso', 'No encontramos este grupo.'));
      return;
    }
    titular(contenedor, '¿Es tu grupo?', grupo.nombre);
    var cuerpo = crear('div', 'formulario');
    contenedor.appendChild(cuerpo);

    if (!Nube.disponible) {
      cuerpo.appendChild(crear('p', 'aviso', 'No se ha podido conectar. Revisa la conexión y vuelve a intentarlo.'));
      return;
    }
    cuerpo.appendChild(crear('p', 'vacio', 'Cargando…'));

    function rehacer() { pintarGestionar(contenedor, grupo, alVolver); }

    Nube.listo.then(Nube.refrescarCuenta).then(function (cuenta) {
      cuerpo.textContent = '';

      // Sin cuenta: primero, entrar con correo y código.
      if (!cuenta) {
        cuerpo.appendChild(crear('p', 'formulario-texto', 'Si formas parte de ' + grupo.nombre +
          ' o lo representas, puedes pedir gestionar su ficha para publicar vosotros mismos sus conciertos y giras. También puedes pedir que se retire.'));
        cuerpo.appendChild(crear('p', 'formulario-texto', 'Primero, entra con tu correo: te enviaremos un código de 6 cifras. Sin contraseñas.'));
        formularioAcceso(cuerpo, rehacer);
        return;
      }

      if (cuenta.admin) {
        cuerpo.appendChild(crear('p', 'formulario-texto', 'Has entrado como administrador: ya puedes publicar en todas las fichas.'));
        var irPanel = crear('a', 'boton boton-ancho', 'Ir a mi panel');
        irPanel.href = '#/panel';
        cuerpo.appendChild(irPanel);
        return;
      }

      cuerpo.appendChild(crear('p', 'vacio', 'Cargando…'));
      Nube.misSolicitudes(grupo.id).then(function (lista) {
        cuerpo.textContent = '';
        formularioSolicitud(cuerpo, grupo, cuenta, lista, rehacer);
      }, function (e) {
        cuerpo.textContent = '';
        cuerpo.appendChild(crear('p', 'aviso', e.message));
      });
    });
  }

  function formularioSolicitud(cuerpo, grupo, cuenta, lista, rehacer) {
    var gestiona = (cuenta.grupos || []).indexOf(grupo.id) !== -1;
    // La más reciente de cada tipo (la lista llega de más nueva a más antigua).
    var ultima = {};
    lista.forEach(function (sol) { if (!ultima[sol.tipo]) ultima[sol.tipo] = sol; });
    var pendienteGestionar = ultima.gestionar && ultima.gestionar.estado === 'pendiente';
    var pendienteRetirar = ultima.retirar && ultima.retirar.estado === 'pendiente';
    var puedeGestionar = !gestiona && !pendienteGestionar;
    var puedeRetirar = !pendienteRetirar;

    var aviso = crear('p', 'mensaje');
    mensaje(aviso, avisoGestionar, 'ok');
    avisoGestionar = '';
    cuerpo.appendChild(aviso);

    if (gestiona) {
      cuerpo.appendChild(crear('p', 'formulario-texto', 'Ya gestionas esta ficha: puedes publicar sus conciertos y giras desde tu panel.'));
      var irPanel = crear('a', 'boton boton-ancho', 'Ir a mi panel');
      irPanel.href = '#/panel';
      cuerpo.appendChild(irPanel);
    }

    // Estado de lo que ya ha pedido
    if (lista.length) {
      cuerpo.appendChild(crear('p', 'etiqueta-seccion', 'Tus solicitudes'));
      var ul = crear('ul', 'mis-solicitudes');
      lista.slice(0, 6).forEach(function (sol) {
        var li = crear('li', 'mi-solicitud');
        var texto = crear('div', 'mi-solicitud-texto');
        texto.appendChild(crear('span', 'mi-solicitud-tipo', sol.tipo === 'retirar' ? 'Retirar la ficha' : 'Gestionar la ficha'));
        texto.appendChild(crear('span', 'mi-solicitud-fecha', 'Enviada el ' + fechaHora(sol.creado)));
        if (sol === ultima.gestionar && sol.estado === 'aprobada' && !gestiona) {
          texto.appendChild(crear('span', 'mi-solicitud-fecha', 'Ya no figuras como miembro. Puedes volver a pedirlo.'));
        }
        li.appendChild(texto);
        li.appendChild(etiquetaEstado(sol.estado));
        ul.appendChild(li);
      });
      cuerpo.appendChild(ul);
      if (pendienteGestionar || pendienteRetirar) {
        cuerpo.appendChild(crear('p', 'campo-nota', 'Revisamos cada solicitud a mano. Vuelve aquí para ver cómo va.'));
      }
    }

    if (!puedeGestionar && !puedeRetirar) return salirAbajo();

    // Datos de quien lo pide (sirven para las dos peticiones)
    var previa = lista[0] || {};
    var form = crear('form', 'formulario');
    form.noValidate = true;
    if (puedeGestionar) {
      form.appendChild(crear('p', 'etiqueta-seccion', 'Solicitar gestionar esta ficha'));
      form.appendChild(crear('p', 'formulario-texto', 'Si lo aprobamos, podrás publicar los conciertos y giras de ' + grupo.nombre + ' con su cartel. Puede haber varias personas por grupo.'));
    } else {
      form.appendChild(crear('p', 'etiqueta-seccion', 'Tus datos'));
    }
    var nombre = entrada('text', previa.nombre || '', { maxlength: '120', autocomplete: 'name', required: '' });
    var papel = entrada('text', previa.papel || '', { maxlength: '120', autocomplete: 'off', placeholder: 'Ej.: guitarrista, mánager, sello', required: '' });
    var texto = areaTexto('', { maxlength: '2000', rows: '4', placeholder: 'Cualquier cosa que nos ayude a comprobarlo' });
    form.appendChild(campo('Tu nombre', nombre));
    form.appendChild(campo('Tu papel en el grupo', papel));
    form.appendChild(campo('Mensaje (opcional)', texto));

    var casilla = entrada('checkbox', null, {});
    if (puedeGestionar) {
      var etiqueta = crear('label', 'casilla');
      etiqueta.appendChild(casilla);
      etiqueta.appendChild(crear('span', null, CASILLA));
      form.appendChild(etiqueta);
      var pedir = crear('button', 'boton boton-ancho', 'Solicitar gestionar esta ficha');
      pedir.type = 'submit';
      form.appendChild(pedir);
    }

    // Cada botón tiene su aviso justo debajo.
    var avisoForm = crear('p', 'mensaje');
    avisoForm.hidden = true;
    form.appendChild(avisoForm);

    function datos(tipo) {
      return {
        grupo_id: grupo.id,
        tipo: tipo,
        nombre: nombre.value.trim(),
        papel: papel.value.trim(),
        mensaje: texto.value.trim(),
        acepta: tipo === 'gestionar' ? casilla.checked : false
      };
    }

    function validar(d) {
      if (!d.nombre) return 'Falta tu nombre.';
      if (!d.papel) return 'Falta tu papel en el grupo.';
      if (d.tipo === 'gestionar' && !d.acepta) return 'Para gestionar la ficha tienes que marcar la casilla.';
      return '';
    }

    function enviar(tipo, botonPulsado, caja) {
      var d = datos(tipo);
      var fallo = validar(d);
      mensaje(avisoForm, '');
      mensaje(caja, '');
      if (fallo) {
        mensaje(caja, fallo, 'error');
        return;
      }
      if (tipo === 'retirar' && !confirm('¿Pedir que se retire la ficha de ' + grupo.nombre + '? La revisaremos antes de quitarla.')) return;
      botonPulsado.disabled = true;
      mensaje(caja, 'Enviando…');
      Nube.solicitar(d).then(function () {
        avisoGestionar = tipo === 'retirar'
          ? 'Petición enviada. La revisaremos lo antes posible.'
          : 'Solicitud enviada. La revisaremos lo antes posible.';
        rehacer();
      }, function (err) {
        botonPulsado.disabled = false;
        mensaje(caja, err.message, 'error');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (puedeGestionar) enviar('gestionar', pedir, avisoForm);
    });
    cuerpo.appendChild(form);

    // Retirar la ficha, en la misma pantalla
    if (puedeRetirar) {
      var retirar = crear('div', 'retirar-ficha');
      retirar.appendChild(crear('p', 'etiqueta-seccion', 'Retirar la ficha'));
      retirar.appendChild(crear('p', 'formulario-texto', 'Si preferís que ' + grupo.nombre + ' no aparezca en Backline, pídelo aquí. Usaremos tu nombre, tu papel y el mensaje de arriba.'));
      var avisoRetirar = crear('p', 'mensaje');
      avisoRetirar.hidden = true;
      var pedirRetirar = boton('Pedir que se retire la ficha', 'boton-secundario boton-ancho peligro', function () {
        enviar('retirar', pedirRetirar, avisoRetirar);
      });
      retirar.appendChild(pedirRetirar);
      retirar.appendChild(avisoRetirar);
      cuerpo.appendChild(retirar);
    }
    salirAbajo();

    function salirAbajo() {
      var pie = crear('div', 'gestionar-pie');
      pie.appendChild(crear('span', 'campo-nota', 'Has entrado como ' + cuenta.correo + '.'));
      pie.appendChild(boton('Salir', 'boton-texto', function () { Nube.salir().then(rehacer); }));
      cuerpo.appendChild(pie);
    }
  }

  window.Panel = {
    iniciar: iniciar,
    pintarAcceso: pintarAcceso,
    pintarPanel: pintarPanel,
    pintarGestionar: pintarGestionar
  };
})();
