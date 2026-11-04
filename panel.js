// backline — acceso con código, "¿Es tu grupo?" y "Mi panel".
//
// Acceso: correo + código de 6 cifras que llega por email (sin contraseñas).
// ¿Es tu grupo?: pedir gestionar una ficha o que se retire, y ver cómo va.
// Mi panel:
//   · administrador: publicar en cualquier grupo, Solicitudes (aprobar o
//     rechazar) y Miembros (quién gestiona cada grupo, y quitar a alguien).
//   · miembro de un grupo: publicar, editar y borrar conciertos, giras,
//     discos, vídeos y noticias de su grupo (o sus grupos). Nada de otros grupos.
//     También, el botón «Kit para vuestra web» de cada grupo (ver kit.js).
// Las imágenes (carteles, portadas e imágenes de noticias) se reducen en el
// móvil antes de subirlas y van a la misma carpeta, con la misma regla.
// Lo que cada cuenta puede hacer lo decide la base de datos
// (supabase/5-miembros.sql): aunque alguien llegara a una pantalla que no le
// toca, no podría guardar nada.

(function () {
  'use strict';

  var LADO_CARTEL = 1200;     // píxeles del lado más largo del cartel (y de las demás imágenes)
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

  // Discos, vídeos y noticias (los formularios cortos de pintarFormularioNovedad).
  var NOVEDADES = { disco: true, video: true, noticia: true };
  var ICONOS_TIPO = { disco: '♪', video: '▶', noticia: '✎' };
  var QUE_ES = { disco: 'el disco', single: 'el single', video: 'el vídeo', noticia: 'la noticia' };

  // "Concierto", "Gira", "Disco", "Single", "Vídeo" o "Noticia"
  function nombreTipo(pub) {
    if (pub.tipo === 'concierto') return 'Concierto';
    if (pub.tipo === 'gira') return 'Gira';
    return Novedades.nombreTipo(pub);
  }

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
        // Borrar la cuenta (lo exigen las tiendas). El administrador no puede.
        if (!cuenta.admin) {
          var borrar = crear('div', 'borrar-cuenta');
          borrar.appendChild(crear('p', 'campo-nota', 'Al borrar tu cuenta se eliminan tu correo, tus solicitudes y tu acceso a las fichas que gestionas. Lo que hayas publicado se queda en la ficha del grupo. Los grupos que sigues siguen guardados en este móvil.'));
          var avisoBorrar = crear('p', 'mensaje');
          avisoBorrar.hidden = true;
          var botonBorrar = boton('Borrar mi cuenta', 'boton-texto peligro', function () {
            if (!confirm('¿Borrar tu cuenta (' + cuenta.correo + ')? Es inmediato y no se puede deshacer.')) return;
            botonBorrar.disabled = true;
            mensaje(avisoBorrar, 'Borrando…');
            Nube.borrarCuenta().then(function () {
              pintarAcceso(contenedor);
              var hecho = crear('p', 'mensaje ok', 'Tu cuenta se ha borrado.');
              contenedor.insertBefore(hecho, contenedor.children[1] || null);
            }, function (err) {
              botonBorrar.disabled = false;
              mensaje(avisoBorrar, err.message, 'error');
            });
          });
          borrar.appendChild(botonBorrar);
          borrar.appendChild(avisoBorrar);
          caja.appendChild(borrar);
        }
        caja.appendChild(enlacePrivacidad());
        return;
      }

      caja.appendChild(crear('p', 'formulario-texto', 'Escribe tu correo y te enviaremos un código de 6 cifras para entrar. Sin contraseñas.'));
      formularioAcceso(caja, function (c) {
        if (tienePanel(c)) location.hash = '#/panel';
        else pintarAcceso(contenedor);
      });
      caja.appendChild(enlacePrivacidad());
    });
  }

  function enlacePrivacidad() {
    var p = crear('p', 'campo-nota enlace-privacidad');
    var a = crear('a', null, 'Política de privacidad');
    a.href = 'privacidad.html';
    p.appendChild(a);
    return p;
  }

  // Cuenta para los revisores de Google Play y la App Store: entra con
  // contraseña (no pueden recibir el código por correo) y gestiona un grupo
  // de prueba que nadie más ve. La contraseña está solo en Supabase y en las
  // tiendas, nunca aquí.
  var CUENTA_REVISION = 'hibackline+revision@gmail.com';

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
    var otroCodigo = boton('Enviar otro código', 'boton-texto', function () {
      pedirCodigo();
    });
    otras.appendChild(otroCodigo);
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
        var revision = correoPendiente === CUENTA_REVISION;
        explicacion.textContent = revision
          ? 'Cuenta de revisión: escribe la contraseña.'
          : 'Te hemos enviado un código a ' + correoPendiente + '. Escríbelo aquí (mira también en correo no deseado).';
        modoClave(revision);
        codigo.value = '';
        codigo.focus();
      }
    }

    // El mismo campo sirve para el código (6 cifras) o, solo en la cuenta de
    // revisión, para la contraseña.
    function modoClave(si) {
      codigo.type = si ? 'password' : 'text';
      codigo.autocomplete = si ? 'current-password' : 'one-time-code';
      codigo.placeholder = si ? 'Contraseña' : '······';
      codigo.setAttribute('aria-label', si ? 'Contraseña' : 'Código de 6 cifras');
      if (si) {
        codigo.removeAttribute('inputmode');
        codigo.removeAttribute('pattern');
        codigo.removeAttribute('maxlength');
        codigo.classList.remove('codigo');
      } else {
        codigo.setAttribute('inputmode', 'numeric');
        codigo.setAttribute('pattern', '[0-9]*');
        codigo.setAttribute('maxlength', '6');
        codigo.classList.add('codigo');
      }
      otroCodigo.hidden = si;
    }

    function pedirCodigo() {
      var valor = correo.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
        mensaje(aviso, 'Revisa el correo: no parece válido.', 'error');
        return;
      }
      if (valor === CUENTA_REVISION) {
        correoPendiente = valor;
        mostrarPaso(2);
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
      var revision = correoPendiente === CUENTA_REVISION;
      var valor = revision ? codigo.value : codigo.value.replace(/\D/g, '');
      if (revision ? !valor : valor.length !== 6) {
        mensaje(aviso, revision ? 'Escribe la contraseña.' : 'El código tiene 6 cifras.', 'error');
        return;
      }
      entrar.disabled = true;
      mensaje(aviso, 'Comprobando…');
      (revision ? Nube.entrarConClave(correoPendiente, valor) : Nube.entrar(correoPendiente, valor)).then(function (cuenta) {
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

      // #/panel/concierto/nuevo · #/panel/gira/nueva · #/panel/disco/nuevo
      // #/panel/video/nuevo · #/panel/noticia/nueva · #/panel/editar/<id>
      // Solo administrador: #/panel/solicitudes · #/panel/miembros · #/panel/avisos
      // · #/panel/comunicados · #/panel/denuncias
      if (cuenta.admin && partes[1] === 'solicitudes') {
        pintarSolicitudes(contenedor, cuenta);
      } else if (cuenta.admin && partes[1] === 'miembros') {
        pintarMiembros(contenedor);
      } else if (cuenta.admin && partes[1] === 'avisos') {
        pintarAvisosPorGrupo(contenedor);
      } else if (cuenta.admin && partes[1] === 'comunicados') {
        pintarComunicados(contenedor);
      } else if (cuenta.admin && partes[1] === 'denuncias') {
        pintarDenuncias(contenedor);
      } else if (partes[1] === 'concierto' || partes[1] === 'gira') {
        pintarFormulario(contenedor, { tipo: partes[1], fechas: [] }, cuenta);
      } else if (NOVEDADES[partes[1]]) {
        pintarFormularioNovedad(contenedor, { tipo: partes[1] }, cuenta);
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
          if (NOVEDADES[pub.tipo]) pintarFormularioNovedad(contenedor, pub, cuenta);
          else pintarFormulario(contenedor, pub, cuenta);
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

  // Número de solicitudes pendientes, en rojo (vacío si no hay).
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

    // Grupos: Novedades de Backline (lo que escribe el administrador).
    if (!cuenta.admin) novedadesBackline(contenedor, cuenta);

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
      var porGrupo = crear('a', 'opcion');
      porGrupo.href = '#/panel/avisos';
      porGrupo.appendChild(crear('span', 'opcion-titulo', 'Avisos por grupo'));
      porGrupo.appendChild(crear('span', 'opcion-detalle', 'Cuánta gente recibe los avisos de cada grupo'));
      atajos.appendChild(porGrupo);
      var escribir = crear('a', 'opcion');
      escribir.href = '#/panel/comunicados';
      escribir.appendChild(crear('span', 'opcion-titulo', 'Escribir a los grupos'));
      escribir.appendChild(crear('span', 'opcion-detalle', 'Novedades de Backline para quien gestiona una ficha'));
      atajos.appendChild(escribir);
      var denun = crear('a', 'opcion');
      denun.href = '#/panel/denuncias';
      var tituloDen = crear('span', 'opcion-titulo', 'Denuncias ');
      var numeroDen = punto(0);
      tituloDen.appendChild(numeroDen);
      denun.appendChild(tituloDen);
      var detalleDen = crear('span', 'opcion-detalle', 'Publicaciones denunciadas');
      denun.appendChild(detalleDen);
      atajos.appendChild(denun);
      contenedor.appendChild(atajos);
      Nube.denuncias().then(function (lista) {
        var n = lista.filter(function (d) { return d.estado === 'pendiente'; }).length;
        numeroDen.textContent = String(n);
        numeroDen.hidden = !n;
        detalleDen.textContent = !n ? 'Ninguna pendiente' : n === 1 ? '1 pendiente' : n + ' pendientes';
      }, function () { /* aún sin 13-denuncias.sql */ });
      Nube.contarPendientes().then(function (n) {
        numero.textContent = String(n);
        numero.hidden = !n;
        detalleSol.textContent = !n ? 'Ninguna pendiente' : n === 1 ? '1 pendiente' : n + ' pendientes';
      }, function () { detalleSol.textContent = 'Gestionar y retirar fichas'; });
    }

    // Botón "Publicar" con sus opciones
    var publicar = boton('Publicar', 'boton boton-ancho');
    var opciones = crear('div', 'opciones-publicar');
    opciones.hidden = true;
    [
      { texto: 'Concierto', detalle: 'Una fecha con su cartel', href: '#/panel/concierto/nuevo' },
      { texto: 'Gira', detalle: 'Un cartel y varias fechas', href: '#/panel/gira/nueva' },
      { texto: 'Disco o single', detalle: 'Portada y dónde escucharlo', href: '#/panel/disco/nuevo' },
      { texto: 'Vídeo', detalle: 'De YouTube o Vimeo', href: '#/panel/video/nuevo' },
      { texto: 'Noticia', detalle: 'Un texto corto, con imagen si quieres', href: '#/panel/noticia/nueva' }
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

    // Kit para la web, Bandcamp y redes de cada grupo que gestiona (ver kit.js).
    if (!cuenta.admin) {
      mios.forEach(function (g) {
        var kit = crear('a', 'boton-secundario boton-kit', mios.length === 1 ? 'Kit para vuestra web' : 'Kit para vuestra web · ' + g.nombre);
        kit.href = '#/kit/' + encodeURIComponent(g.id);
        contenedor.appendChild(kit);
      });
    }

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
    if (NOVEDADES[pub.tipo]) {
      return { nombre: nombre, titulo: pub.titulo || 'Sin título', fechas: [] };
    }
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
    var video = pub.tipo === 'video' ? Novedades.datosVideo(pub.enlace) : null;
    if (!url && video) url = video.miniatura;
    if (url) {
      var img = document.createElement('img');
      img.className = 'portada cartel-mini';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      li.appendChild(img);
    } else {
      var n = crear('div', 'portada iniciales nota', ICONOS_TIPO[pub.tipo] || '♪');
      n.setAttribute('aria-hidden', 'true');
      li.appendChild(n);
    }

    var texto = crear('div', 'tarjeta-texto');
    texto.appendChild(crear('h3', 'tarjeta-nombre', d.nombre));
    texto.appendChild(crear('p', 'publicado-titulo', d.titulo));
    var proximas = d.fechas.filter(function (f) { return f.fecha >= hoy(); }).length;
    var estado = NOVEDADES[pub.tipo] ? Novedades.resumen(pub)
      : pub.tipo === 'gira'
      ? 'Gira · ' + d.fechas.length + (d.fechas.length === 1 ? ' fecha' : ' fechas') + ' · ' + proximas + (proximas === 1 ? ' próxima' : ' próximas')
      : 'Concierto · ' + (proximas ? 'próximo' : 'ya pasado, no se muestra');
    // Si el grupo ya no está en grupos.json, lo suyo no se muestra.
    if (!grupo) estado = nombreTipo(pub) + ' · el grupo ya no está en la lista: no se muestra';
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
        : pub.tipo === 'concierto' ? 'el concierto de ' + d.nombre
        : QUE_ES[pub.tipo === 'disco' && pub.formato === 'single' ? 'single' : pub.tipo] + ' «' + (pub.titulo || '') + '» de ' + d.nombre;
      var imagen = !pub.cartel ? ''
        : pub.tipo === 'disco' ? ' También se borrará su portada.'
        : pub.tipo === 'concierto' || pub.tipo === 'gira' ? ' También se borrará su cartel.'
        : ' También se borrará su imagen.';
      if (!confirm('¿Borrar ' + que + '?' + imagen + ' No se puede deshacer.')) return;
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

  // Campo para elegir una imagen de la galería (cartel, portada o imagen de
  // una noticia). Se reduce antes de subirla. Devuelve
  // { nodo, nueva() -> Blob o null, quitada() -> bool, tiene() -> bool }.
  // op = { etiqueta, ruta (la imagen que ya tenía), vacio, elegir, cambiar,
  //        notaCambiar, opcional (añade "Quitar imagen") }
  function campoImagen(op) {
    var nueva = null;
    var quitada = false;
    var archivo = entrada('file', null, { accept: 'image/*' });
    var vista = crear('div', 'cartel-vista');
    function ver(src) {
      vista.textContent = '';
      if (!src) {
        vista.appendChild(crear('span', 'cartel-vacio', op.vacio));
        return;
      }
      var img = document.createElement('img');
      img.src = src;
      img.alt = 'Imagen elegida';
      vista.appendChild(img);
    }
    function hay() { return !!nueva || (!!op.ruta && !quitada); }
    ver(Nube.urlCartel(op.ruta));
    var estado = crear('span', 'campo-nota', op.ruta ? op.notaCambiar : 'Desde la galería del móvil. Se reducirá antes de subirla.');
    var elegir = crear('label', 'boton-secundario elegir-cartel', op.ruta ? op.cambiar : op.elegir);
    elegir.appendChild(archivo);
    var quitar = boton('Quitar imagen', 'boton-texto peligro quitar-imagen', function () {
      nueva = null;
      quitada = true;
      archivo.value = '';
      ver('');
      estado.textContent = op.ruta ? 'Se quitará al guardar.' : '';
      actualizar();
    });
    function actualizar() {
      quitar.hidden = !op.opcional || !hay();
      elegir.firstChild.textContent = hay() ? op.cambiar : op.elegir;
    }
    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      if (!f) return;
      estado.textContent = 'Preparando imagen…';
      reducirImagen(f).then(function (r) {
        nueva = r.blob;
        ver(URL.createObjectURL(r.blob));
        estado.textContent = 'Lista: ' + r.ancho + ' × ' + r.alto + ' px, ' + Math.round(r.blob.size / 1024) + ' KB.';
        actualizar();
      }, function (e) {
        nueva = null;
        archivo.value = '';
        estado.textContent = e.message;
        actualizar();
      });
    });
    var caja = crear('div', 'campo');
    caja.appendChild(crear('span', 'campo-etiqueta', op.etiqueta));
    caja.appendChild(vista);
    caja.appendChild(elegir);
    caja.appendChild(estado);
    caja.appendChild(quitar);
    actualizar();
    return {
      nodo: caja,
      nueva: function () { return nueva; },
      quitada: function () { return quitada && !nueva && !!op.ruta; },
      tiene: hay
    };
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
    var direccion = entrada('text', f.direccion, { maxlength: '160', autocomplete: 'off', placeholder: 'Ej.: Calle Mayor 5' });
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
    nodo.appendChild(campo('Dirección (opcional)', direccion, 'Ayuda a que el mapa encuentre la sala'));
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
          direccion: direccion.value.trim().replace(/\s+/g, ' '),
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
    var cartel = campoImagen({
      etiqueta: 'Cartel',
      ruta: pub.cartel,
      vacio: 'Sin cartel',
      elegir: 'Elegir cartel',
      cambiar: 'Cambiar cartel',
      notaCambiar: 'Elige otra imagen solo si quieres cambiar el cartel.'
    });
    form.appendChild(cartel.nodo);

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
      if (!cartel.tiene()) return mensaje(aviso, 'Falta el cartel.', 'error');
      var fechas = bloques.map(function (b) { return b.leer(); });
      for (var i = 0; i < fechas.length; i++) {
        var fallo = validarFecha(fechas[i], esGira ? i + 1 : 0);
        if (fallo) return mensaje(aviso, fallo, 'error');
      }
      if (borradas.length && !confirm(borradas.length === 1
        ? 'Has quitado 1 fecha de la gira. Se borrará al guardar. ¿Seguir?'
        : 'Has quitado ' + borradas.length + ' fechas de la gira. Se borrarán al guardar. ¿Seguir?')) return;

      guardar.disabled = true;
      mensaje(aviso, cartel.nueva() ? 'Subiendo cartel y guardando…' : 'Guardando…');
      Nube.guardar({
        id: pub.id,
        grupo_id: grupo.value,
        tipo: pub.tipo,
        titulo: esGira ? nombreGira.value.trim() : null,
        cartelAnterior: pub.cartel,
        cartelNuevo: cartel.nueva(),
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

  // ---------- Formulario de disco, vídeo o noticia ----------
  // Cortos y pensados para el móvil: publicar tiene que llevar menos de un minuto.

  // Contador "120 / 1000" bajo un texto.
  function contador(area, max) {
    var nota = crear('span', 'campo-nota contador');
    function contar() {
      var n = area.value.length;
      nota.textContent = n + ' / ' + max;
      nota.classList.toggle('error', n > max);
    }
    area.addEventListener('input', contar);
    contar();
    return nota;
  }

  // ¿Qué pasa con este enlace? Devuelve { error } o { ok } (texto para la nota).
  // tipo: 'disco' (dónde escucharlo), 'video' o 'noticia' (enlace opcional).
  function revisarEnlace(valor, tipo) {
    if (!valor) {
      return tipo === 'noticia' ? {} : { error: tipo === 'video' ? 'Falta el enlace del vídeo.' : 'Falta el enlace donde escucharlo.' };
    }
    var red = ayuda.redSocial(valor);
    if (red) {
      return { error: 'Backline no enlaza a redes sociales (' + red + '). ' + (tipo === 'video'
        ? 'Usa el enlace del vídeo en YouTube o Vimeo.'
        : tipo === 'disco' ? 'Usa Bandcamp, Spotify, Apple Music, YouTube o vuestra web.'
        : 'Usa el enlace de vuestra web o de donde esté la noticia.') };
    }
    if (!ayuda.urlPermitida(valor) || !/^https?:\/\/[^/?#\s]+\.[^/?#\s]+/i.test(valor)) {
      return { error: 'El enlace no es válido. Cópialo entero, empezando por https://' };
    }
    if (tipo === 'video') {
      var v = Novedades.datosVideo(valor);
      if (!v) return { error: 'Tiene que ser el enlace de un vídeo de YouTube o Vimeo.' };
      return { ok: v.servicio === 'Vimeo' ? 'Vimeo ✓ Se verá con una tarjeta con el título.' : 'YouTube ✓' };
    }
    if (tipo === 'disco') {
      var servicio = Novedades.servicioMusica(valor);
      return { ok: servicio ? servicio + ' ✓' : 'Se abrirá vuestra web.' };
    }
    return { ok: '✓' };
  }

  // Botones "Disco" / "Single".
  function elegirFormato(valor) {
    var caja = crear('div', 'selector-dos');
    caja.setAttribute('role', 'radiogroup');
    var nombre = 'formato-' + Date.now();
    var radios = {};
    [{ v: 'disco', t: 'Disco' }, { v: 'single', t: 'Single' }].forEach(function (op) {
      var etiqueta = crear('label', 'selector-opcion');
      var r = entrada('radio', op.v, { name: nombre });
      r.checked = (valor || 'disco') === op.v;
      radios[op.v] = r;
      etiqueta.appendChild(r);
      etiqueta.appendChild(crear('span', null, op.t));
      caja.appendChild(etiqueta);
      r.addEventListener('change', marcar);
    });
    function marcar() {
      Object.keys(radios).forEach(function (k) { radios[k].parentNode.classList.toggle('activa', radios[k].checked); });
    }
    marcar();
    return { nodo: caja, valor: function () { return radios.single.checked ? 'single' : 'disco'; } };
  }

  function pintarFormularioNovedad(contenedor, pub, cuenta) {
    contenedor.textContent = '';
    var tipo = pub.tipo;
    var editando = !!pub.id;
    var nombres = { disco: 'disco o single', video: 'vídeo', noticia: 'noticia' };
    titular(contenedor, (editando ? 'Editar ' : 'Publicar ') + nombres[tipo], null);

    var form = crear('form', 'formulario');
    form.noValidate = true;
    contenedor.appendChild(form);

    var opciones = opcionesGrupos(cuenta);
    var grupo = selector(opciones, pub.grupo_id || (opciones.length === 1 ? opciones[0].valor : ''), 'Elige grupo');
    form.appendChild(campo('Grupo', grupo));

    var titulo = entrada('text', pub.titulo, { maxlength: String(Novedades.MAX_TITULO), autocomplete: 'off', required: '' });
    form.appendChild(campo('Título', titulo));

    var formato = null;
    var salida = null;
    if (tipo === 'disco') {
      formato = elegirFormato(pub.formato);
      var cajaFormato = crear('div', 'campo');
      cajaFormato.appendChild(crear('span', 'campo-etiqueta', '¿Disco o single?'));
      cajaFormato.appendChild(formato.nodo);
      form.appendChild(cajaFormato);
      salida = entrada('date', pub.salida || hoy(), { required: '' });
      form.appendChild(campo('Fecha de salida', salida));
    }

    var imagen = null;
    if (tipo === 'disco') {
      imagen = campoImagen({
        etiqueta: 'Portada', ruta: pub.cartel, vacio: 'Sin portada',
        elegir: 'Elegir portada', cambiar: 'Cambiar portada',
        notaCambiar: 'Elige otra imagen solo si quieres cambiar la portada.'
      });
      form.appendChild(imagen.nodo);
    }

    // Texto: el de la noticia, obligatorio; en disco y vídeo, corto y opcional.
    var max = tipo === 'noticia' ? Novedades.MAX_TEXTO_NOTICIA : Novedades.MAX_TEXTO_CORTO;
    var texto = areaTexto(pub.texto, {
      maxlength: String(max), rows: tipo === 'noticia' ? '6' : '3',
      placeholder: tipo === 'noticia' ? 'Cuenta la noticia' : 'Unas líneas, si quieres'
    });
    var cajaTexto = campo(tipo === 'noticia' ? 'Texto' : 'Texto (opcional)', texto);
    cajaTexto.appendChild(contador(texto, max));

    if (tipo === 'noticia') {
      form.appendChild(cajaTexto);
      imagen = campoImagen({
        etiqueta: 'Imagen (opcional)', ruta: pub.cartel, vacio: 'Sin imagen',
        elegir: 'Elegir imagen', cambiar: 'Cambiar imagen',
        notaCambiar: 'Puedes cambiarla o quitarla.', opcional: true
      });
      form.appendChild(imagen.nodo);
    }

    // Enlace, con aviso al momento si no vale (por ejemplo, de una red social).
    var enlace = entrada('url', pub.enlace, { inputmode: 'url', autocomplete: 'off', placeholder: 'https://…' });
    var etiquetas = { disco: 'Dónde escucharlo', video: 'Enlace de YouTube o Vimeo', noticia: 'Enlace (opcional)' };
    var notasEnlace = {
      disco: 'Bandcamp, Spotify, Apple Music, YouTube o vuestra web.',
      video: 'Si es de YouTube, la miniatura sale sola.',
      noticia: 'Vuestra web o donde esté la noticia. Nada de redes sociales.'
    };
    var cajaEnlace = campo(etiquetas[tipo], enlace);
    var notaEnlace = crear('span', 'campo-nota', notasEnlace[tipo]);
    cajaEnlace.appendChild(notaEnlace);
    var miniatura = crear('div', 'miniatura-video');
    miniatura.hidden = true;
    if (tipo === 'video') cajaEnlace.appendChild(miniatura);
    form.appendChild(cajaEnlace);

    function valorEnlace() { return Novedades.completarEnlace(enlace.value); }

    function revisarAlEscribir() {
      var valor = valorEnlace();
      var r = valor ? revisarEnlace(valor, tipo) : {};
      notaEnlace.textContent = r.error || r.ok || notasEnlace[tipo];
      notaEnlace.className = 'campo-nota' + (r.error ? ' error' : r.ok ? ' ok' : '');
      // Mientras se escribe, solo se marca en rojo lo que seguro que no vale.
      if (r.error && !ayuda.redSocial(valor) && document.activeElement === enlace) {
        notaEnlace.textContent = notasEnlace[tipo];
        notaEnlace.className = 'campo-nota';
      }
      if (tipo === 'video') {
        var v = !r.error && Novedades.datosVideo(valor);
        miniatura.textContent = '';
        miniatura.hidden = !v;
        if (v && v.miniatura) {
          var img = document.createElement('img');
          img.src = v.miniatura;
          img.alt = 'Miniatura del vídeo';
          img.referrerPolicy = 'no-referrer';
          miniatura.appendChild(img);
        } else if (v) {
          miniatura.appendChild(crear('span', 'miniatura-vimeo', titulo.value.trim() || 'Vídeo de Vimeo'));
        }
      }
    }
    enlace.addEventListener('input', revisarAlEscribir);
    enlace.addEventListener('blur', function () {
      if (enlace.value.trim() && valorEnlace() !== enlace.value.trim()) enlace.value = valorEnlace();
      revisarAlEscribir();
    });
    if (pub.enlace) revisarAlEscribir();

    if (tipo !== 'noticia') form.appendChild(cajaTexto);

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
      var valor = valorEnlace();
      var t = texto.value.trim();
      if (!grupo.value) return mensaje(aviso, 'Elige el grupo.', 'error');
      if (!titulo.value.trim()) return mensaje(aviso, 'Falta el título.', 'error');
      if (tipo === 'disco' && !salida.value) return mensaje(aviso, 'Falta la fecha de salida.', 'error');
      if (tipo === 'disco' && !imagen.tiene()) return mensaje(aviso, 'Falta la portada.', 'error');
      if (tipo === 'noticia' && !t) return mensaje(aviso, 'Falta el texto de la noticia.', 'error');
      if (t.length > max) return mensaje(aviso, 'El texto es demasiado largo: como mucho, ' + max + ' caracteres.', 'error');
      var r = revisarEnlace(valor, tipo);
      if (r.error) {
        revisarAlEscribir();
        return mensaje(aviso, r.error, 'error');
      }

      guardar.disabled = true;
      mensaje(aviso, imagen && imagen.nueva() ? 'Subiendo imagen y guardando…' : 'Guardando…');
      Nube.guardar({
        id: pub.id,
        grupo_id: grupo.value,
        tipo: tipo,
        titulo: titulo.value.trim().replace(/\s+/g, ' '),
        texto: t,
        enlace: valor,
        formato: formato ? formato.valor() : null,
        salida: salida ? salida.value : null,
        cartelAnterior: pub.cartel,
        cartelNuevo: imagen ? imagen.nueva() : null,
        quitarCartel: imagen ? imagen.quitada() : false
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
        : '¿Aprobar a ' + sol.nombre + '? Podrá publicar, editar y borrar conciertos, giras, discos, vídeos y noticias de ' + nombreG + '.';
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

  // ---------- Novedades de Backline (comunicados del administrador) ----------

  // Lo último que esta cuenta ha visto, guardado en el móvil (solo sirve para
  // marcar «Nuevo»; si se pierde, no pasa nada).
  var vistoAlEntrar = {};

  function claveVisto(cuenta) { return 'backline.comunicados.' + cuenta.id; }

  function leerVisto(cuenta) {
    try { return localStorage.getItem(claveVisto(cuenta)) || ''; } catch (e) { return ''; }
  }

  function guardarVisto(cuenta, iso) {
    try { localStorage.setItem(claveVisto(cuenta), iso); } catch (e) { /* nada */ }
  }

  // Recuadro de Mi panel de los grupos: los 3 últimos comunicados. Si no hay
  // ninguno, no se muestra nada.
  function novedadesBackline(contenedor, cuenta) {
    var caja = crear('section', 'novedades-backline');
    caja.hidden = true;
    contenedor.appendChild(caja);
    Nube.comunicados(3).then(function (lista) {
      if (!lista || !lista.length) return;
      // Lo visto al abrir la app: así «Nuevo» se mantiene mientras siga
      // abierta, aunque el panel se vuelva a pintar.
      if (!(cuenta.id in vistoAlEntrar)) vistoAlEntrar[cuenta.id] = leerVisto(cuenta);
      var visto = vistoAlEntrar[cuenta.id];
      caja.appendChild(crear('p', 'etiqueta-seccion', 'Novedades de Backline'));
      lista.forEach(function (c) {
        var nuevo = !visto || c.creado > visto;
        var art = crear('article', 'comunicado' + (nuevo ? ' nuevo' : ''));
        var cab = crear('div', 'comunicado-cabecera');
        cab.appendChild(crear('h3', 'comunicado-titulo', c.titulo));
        if (nuevo) cab.appendChild(crear('span', 'comunicado-nuevo', 'Nuevo'));
        art.appendChild(cab);
        art.appendChild(crear('p', 'comunicado-texto', c.texto));
        art.appendChild(crear('p', 'comunicado-fecha', fechaHora(c.creado)));
        caja.appendChild(art);
      });
      caja.hidden = false;
      guardarVisto(cuenta, lista[0].creado);
    }, function () { /* sin conexión: no se muestra */ });
  }

  // Pantalla del administrador: escribir y ver lo enviado.
  function pintarComunicados(contenedor) {
    contenedor.textContent = '';
    enlacePanel(contenedor);
    titular(contenedor, 'Escribir a los grupos', 'Lo verán en su Mi panel quienes gestionan una ficha, y les llegará un aviso al móvil si los tienen activados (nunca de noche). Los fans no lo ven.');
    var aviso = avisoGuardado(contenedor);

    var form = crear('form', 'formulario');
    form.noValidate = true;
    var titulo = entrada('text', '', { maxlength: '80', autocomplete: 'off', placeholder: 'Ej.: Nueva función: Kit para vuestra web' });
    var texto = areaTexto('', { maxlength: '2000', rows: '6', placeholder: 'Lo que quieras contarles' });
    form.appendChild(campo('Título', titulo, 'Es lo que se lee en el aviso del móvil. Corto.'));
    form.appendChild(campo('Texto', texto));
    var enviar = crear('button', 'boton boton-ancho', 'Enviar a los grupos');
    enviar.type = 'submit';
    form.appendChild(enviar);
    var avisoForm = crear('p', 'mensaje');
    avisoForm.hidden = true;
    form.appendChild(avisoForm);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = titulo.value.trim();
      var x = texto.value.trim();
      if (!t) return mensaje(avisoForm, 'Falta el título.', 'error');
      if (!x) return mensaje(avisoForm, 'Falta el texto.', 'error');
      if (!confirm('¿Enviar «' + t + '» a todos los grupos que gestionan su ficha?')) return;
      enviar.disabled = true;
      mensaje(avisoForm, 'Enviando…');
      Nube.escribirComunicado(t, x).then(function () {
        avisoPanel = 'Enviado. El aviso al móvil sale en unos minutos.';
        pintarComunicados(contenedor);
      }, function (err) {
        enviar.disabled = false;
        mensaje(avisoForm, err.message, 'error');
      });
    });
    contenedor.appendChild(form);

    contenedor.appendChild(crear('p', 'etiqueta-seccion', 'Enviados'));
    var ul = crear('ul', 'lista');
    ul.appendChild(crear('li', 'vacio', 'Cargando…'));
    contenedor.appendChild(ul);
    Nube.comunicados(50).then(function (lista) {
      ul.textContent = '';
      if (!lista.length) {
        ul.appendChild(crear('li', 'vacio', 'Aún no has escrito nada a los grupos.'));
        return;
      }
      lista.forEach(function (c) {
        var li = crear('li', 'comunicado');
        li.appendChild(crear('h3', 'comunicado-titulo', c.titulo));
        li.appendChild(crear('p', 'comunicado-texto', c.texto));
        li.appendChild(crear('p', 'comunicado-fecha', fechaHora(c.creado)));
        li.appendChild(boton('Borrar', 'boton-secundario boton-pequeno peligro', function (e) {
          if (!confirm('¿Borrar «' + c.titulo + '»? Los grupos dejarán de verlo en su panel.')) return;
          var b = e.currentTarget;
          b.disabled = true;
          Nube.borrarComunicado(c.id).then(function () {
            avisoPanel = 'Borrado.';
            pintarComunicados(contenedor);
          }, function (err) {
            b.disabled = false;
            mensaje(aviso, err.message, 'error');
          });
        }));
        ul.appendChild(li);
      });
    }, function (e) {
      ul.textContent = '';
      ul.appendChild(crear('li', 'aviso', e.message));
    });
  }

  // ---------- Denuncias (administrador) ----------

  var MOTIVO_DENUNCIA = {
    'ofensivo': 'Contenido ofensivo o inapropiado',
    'no-es-del-grupo': 'No parece publicado por el grupo',
    'derechos': 'Usa algo sin permiso',
    'falso': 'Información falsa o engañosa',
    'otro': 'Otro motivo'
  };

  function pintarDenuncias(contenedor) {
    contenedor.textContent = '';
    enlacePanel(contenedor);
    titular(contenedor, 'Denuncias', 'Lo que alguien ha denunciado de una publicación. Revísalo en menos de 24 horas.');
    var aviso = avisoGuardado(contenedor);
    var caja = crear('div');
    caja.appendChild(crear('p', 'vacio', 'Cargando…'));
    contenedor.appendChild(caja);
    Nube.denuncias().then(function (lista) {
      caja.textContent = '';
      var pendientes = lista.filter(function (d) { return d.estado === 'pendiente'; });
      var revisadas = lista.filter(function (d) { return d.estado !== 'pendiente'; });
      caja.appendChild(crear('p', 'etiqueta-seccion', 'Pendientes'));
      var ul = crear('ul', 'lista');
      if (!pendientes.length) ul.appendChild(crear('li', 'vacio', 'No hay denuncias pendientes.'));
      pendientes.forEach(function (d) { ul.appendChild(filaDenuncia(d, aviso, contenedor, true)); });
      caja.appendChild(ul);
      if (revisadas.length) {
        caja.appendChild(crear('p', 'etiqueta-seccion', 'Revisadas'));
        var ul2 = crear('ul', 'lista');
        revisadas.slice(0, 20).forEach(function (d) { ul2.appendChild(filaDenuncia(d, aviso, contenedor, false)); });
        caja.appendChild(ul2);
      }
    }, function (e) {
      caja.textContent = '';
      caja.appendChild(crear('p', 'aviso', e.message));
    });
  }

  function filaDenuncia(d, aviso, contenedor, conBotones) {
    var grupo = ayuda.grupoPorId(d.grupo_id);
    var li = crear('li', 'solicitud ' + (grupo ? grupo._acento : ''));
    li.appendChild(crear('p', 'solicitud-tipo', MOTIVO_DENUNCIA[d.motivo] || d.motivo));
    li.appendChild(crear('p', 'solicitud-quien', (grupo ? grupo.nombre : d.grupo_id) + (d.titulo ? ' · ' + d.titulo : '')));
    if (d.texto) li.appendChild(crear('blockquote', 'solicitud-mensaje', d.texto));
    if (d.contacto) li.appendChild(crear('p', 'solicitud-dato', 'Contacto: ' + d.contacto));
    li.appendChild(crear('p', 'solicitud-dato', 'Recibida el ' + fechaHora(d.creado) +
      (d.resuelto ? ' · revisada el ' + fechaHora(d.resuelto) : '') +
      (d.publicacion_id ? '' : ' · la publicación ya no existe')));
    if (!conBotones) return li;
    var botones = crear('div', 'publicado-botones');
    if (d.publicacion_id) {
      var ver = crear('a', 'boton-secundario boton-pequeno', 'Ver publicación');
      ver.href = '#/panel/editar/' + encodeURIComponent(d.publicacion_id);
      botones.appendChild(ver);
      botones.appendChild(boton('Retirar publicación', 'boton-secundario boton-pequeno peligro', function (e) {
        if (!confirm('¿Retirar esta publicación de ' + (grupo ? grupo.nombre : d.grupo_id) + '? Se borra y no se puede deshacer.')) return;
        resolver(e.currentTarget, true);
      }));
    }
    botones.appendChild(boton('Dar por revisada', 'boton-secundario boton-pequeno', function (e) {
      resolver(e.currentTarget, false);
    }));
    function resolver(b, retirar) {
      b.disabled = true;
      Nube.resolverDenuncia(d.id, retirar).then(function () {
        avisoPanel = retirar ? 'Publicación retirada.' : 'Denuncia revisada.';
        pintarDenuncias(contenedor);
      }, function (err) {
        b.disabled = false;
        mensaje(aviso, err.message, 'error');
      });
    }
    li.appendChild(botones);
    return li;
  }

  // ---------- Avisos por grupo (administrador) ----------
  // Solo cifras, solo para el administrador. Los grupos no lo ven.

  function pintarAvisosPorGrupo(contenedor) {
    contenedor.textContent = '';
    enlacePanel(contenedor);
    titular(contenedor, 'Avisos por grupo', 'Cuántas personas reciben en el móvil los avisos de cada grupo. Solo lo ves tú.');
    var caja = crear('div');
    caja.appendChild(crear('p', 'vacio', 'Cargando…'));
    contenedor.appendChild(caja);

    Nube.avisosPorGrupo().then(function (r) {
      caja.textContent = '';
      var moviles = r.moviles || 0;
      caja.appendChild(crear('p', 'formulario-texto', moviles === 1
        ? '1 móvil tiene los avisos activados (sin contar los tuyos).'
        : moviles + ' móviles tienen los avisos activados (sin contar los tuyos).'));
      caja.appendChild(crear('p', 'campo-nota', 'Quien sigue un grupo sin activar los avisos no aparece aquí: eso se guarda solo en su móvil. Los grupos silenciados tampoco cuentan.'));
      var lista = (r.grupos || []).filter(function (g) { return ayuda.grupoPorId(g.grupo_id); });
      if (!lista.length) {
        caja.appendChild(crear('p', 'vacio', 'Aún nadie recibe avisos de ningún grupo.'));
        return;
      }
      caja.appendChild(crear('p', 'etiqueta-seccion', lista.length === 1 ? '1 grupo' : lista.length + ' grupos'));
      var ul = crear('ul', 'lista');
      lista.forEach(function (g) {
        var grupo = ayuda.grupoPorId(g.grupo_id);
        var li = crear('li');
        var a = crear('a', 'tarjeta avisos-grupo ' + grupo._acento);
        a.href = '#/grupo/' + encodeURIComponent(grupo.id);
        var texto = crear('div', 'tarjeta-texto');
        texto.appendChild(crear('h3', 'tarjeta-nombre', grupo.nombre));
        a.appendChild(texto);
        a.appendChild(crear('span', 'avisos-grupo-cifra', String(g.personas)));
        li.appendChild(a);
        ul.appendChild(li);
      });
      caja.appendChild(ul);
    }, function (e) {
      caja.textContent = '';
      caja.appendChild(crear('p', 'aviso', e.message));
    });
  }

  // ---------- ¿Es tu grupo? (gestionar o retirar la ficha) ----------

  var CASILLA = 'Formo parte del grupo o lo represento, tengo derecho a publicar lo que suba (por ejemplo, los carteles) y acepto las condiciones de uso';

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
          ' o lo representas, puedes pedir gestionar su ficha para publicar vosotros mismos sus conciertos, discos, vídeos y noticias. También puedes pedir que se retire.'));
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
      cuerpo.appendChild(crear('p', 'formulario-texto', 'Ya gestionas esta ficha: puedes publicar sus conciertos, discos, vídeos y noticias desde tu panel.'));
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
      if (pendienteGestionar) {
        cuerpo.appendChild(crear('p', 'campo-nota', 'Si activas los avisos en Mis grupos, en este móvil y sin salir de tu cuenta, te avisaremos en cuanto la aprobemos.'));
      }
    }

    if (!puedeGestionar && !puedeRetirar) return salirAbajo();

    // Datos de quien lo pide (sirven para las dos peticiones)
    var previa = lista[0] || {};
    var form = crear('form', 'formulario');
    form.noValidate = true;
    if (puedeGestionar) {
      form.appendChild(crear('p', 'etiqueta-seccion', 'Solicitar gestionar esta ficha'));
      form.appendChild(crear('p', 'formulario-texto', 'Si lo aprobamos, podrás publicar los conciertos, giras, discos, vídeos y noticias de ' + grupo.nombre + '. Puede haber varias personas por grupo.'));
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
      var verCondiciones = crear('p', 'campo-nota');
      var enlaceCond = crear('a', null, 'Leer las condiciones de uso');
      enlaceCond.href = 'condiciones.html';
      verCondiciones.appendChild(enlaceCond);
      form.appendChild(verCondiciones);
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
