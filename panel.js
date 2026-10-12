// backline — acceso con código y panel del administrador.
//
// Acceso: correo + código de 6 cifras que llega por email (sin contraseñas).
// Panel: publicar, editar y borrar conciertos y giras. Solo lo ve quien la
// base de datos reconoce como administrador; aunque alguien llegara a esta
// pantalla, la base de datos no le dejaría guardar nada.

(function () {
  'use strict';

  var LADO_CARTEL = 1200;     // píxeles del lado más largo del cartel
  var CALIDAD_CARTEL = 0.85;  // calidad JPEG

  var ayuda = null;
  // Correo al que se ha mandado el código (entre los dos pasos del acceso).
  var correoPendiente = '';
  // Mensaje para mostrar al volver al panel ("Publicado", "Borrado"...).
  var avisoPanel = '';

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
        if (cuenta.admin) {
          var irPanel = crear('a', 'boton boton-ancho', 'Ir a mi panel');
          irPanel.href = '#/panel';
          caja.appendChild(irPanel);
        } else {
          caja.appendChild(crear('p', 'formulario-texto', 'De momento no hay nada más que hacer con tu cuenta. Puedes seguir usando la app igual que siempre.'));
        }
        caja.appendChild(boton('Salir', 'boton-secundario boton-ancho', function () {
          Nube.salir().then(function () { pintarAcceso(contenedor); });
        }));
        return;
      }

      // Paso 1: correo
      var formCorreo = crear('form', 'formulario-paso');
      formCorreo.noValidate = true;
      formCorreo.appendChild(crear('p', 'formulario-texto', 'Escribe tu correo y te enviaremos un código de 6 cifras para entrar. Sin contraseñas.'));
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
          if (cuenta && cuenta.admin) location.hash = '#/panel';
          else pintarAcceso(contenedor);
        }, function (err) {
          entrar.disabled = false;
          mensaje(aviso, err.message, 'error');
        });
      });

      if (correoPendiente) mostrarPaso(2);
    });
  }

  // ---------- Panel ----------

  function pintarPanel(contenedor, partes) {
    contenedor.textContent = '';
    if (!Nube.disponible) {
      contenedor.appendChild(crear('p', 'aviso', 'No se ha podido conectar. Revisa la conexión y vuelve a intentarlo.'));
      return;
    }
    contenedor.appendChild(crear('p', 'vacio', 'Cargando…'));

    Nube.listo.then(function () {
      var cuenta = Nube.cuenta();
      if (!cuenta || !cuenta.admin) {
        contenedor.textContent = '';
        titular(contenedor, 'Mi panel', null);
        var caja = crear('div', 'sin-grupos');
        caja.appendChild(crear('p', 'sin-grupos-texto', 'Esta pantalla es solo para el administrador.'));
        var a = crear('a', 'boton', 'Ir a Acceso');
        a.href = '#/acceso';
        caja.appendChild(a);
        contenedor.appendChild(caja);
        return;
      }

      // #/panel/concierto/nuevo · #/panel/gira/nueva · #/panel/editar/<id>
      if (partes[1] === 'concierto' || partes[1] === 'gira') {
        pintarFormulario(contenedor, { tipo: partes[1], fechas: [] });
      } else if (partes[1] === 'editar' && partes[2]) {
        Nube.publicacion(partes[2]).then(function (pub) {
          if (!pub) {
            avisoPanel = 'Esa publicación ya no existe.';
            location.hash = '#/panel';
            return;
          }
          pintarFormulario(contenedor, pub);
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

  function pintarLista(contenedor, cuenta) {
    contenedor.textContent = '';
    titular(contenedor, 'Mi panel', 'Has entrado como ' + cuenta.correo + '.');

    var aviso = crear('p', 'mensaje');
    mensaje(aviso, avisoPanel, 'ok');
    avisoPanel = '';
    contenedor.appendChild(aviso);

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

    Nube.publicaciones().then(function (pubs) {
      lista.textContent = '';
      if (!pubs.length) {
        lista.appendChild(crear('li', 'vacio', 'Aún no has publicado nada.'));
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
    texto.appendChild(crear('p', 'publicado-estado', estado));
    li.appendChild(texto);

    var botones = crear('div', 'publicado-botones');
    var editar = crear('a', 'boton-secundario boton-pequeno', 'Editar');
    editar.href = '#/panel/editar/' + encodeURIComponent(pub.id);
    botones.appendChild(editar);
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

  function opcionesGrupos() {
    return ayuda.todosLosGrupos().map(function (g) { return { valor: g.id, texto: g.nombre }; });
  }

  function opcionesProvincias() {
    return Conciertos.PROVINCIAS.map(function (p) { return { valor: p, texto: p }; });
  }

  // Bloque con los campos de una fecha. Devuelve { nodo, leer(), id }.
  function bloqueFecha(f, conPrecio, alQuitar) {
    f = f || {};
    var nodo = crear('fieldset', 'bloque-fecha');
    var fecha = entrada('date', f.fecha, { required: '' });
    var hora = entrada('time', Conciertos.hora(f.hora), { required: '' });
    var ciudad = entrada('text', f.ciudad, { required: '', maxlength: '120', autocomplete: 'off' });
    var provincia = selector(opcionesProvincias(), f.provincia, 'Elige provincia');
    var sala = entrada('text', f.sala, { required: '', maxlength: '160', autocomplete: 'off' });
    var precio = entrada('text', f.precio, { maxlength: '80', placeholder: 'Ej.: 12 € anticipada / 15 € taquilla' });
    var entradas = entrada('url', f.entradas, { inputmode: 'url', placeholder: 'https://…' });

    var fila = crear('div', 'campos-dos');
    fila.appendChild(campo('Fecha', fecha));
    fila.appendChild(campo('Hora', hora, 'Hora del lugar del concierto'));
    nodo.appendChild(fila);
    var fila2 = crear('div', 'campos-dos');
    fila2.appendChild(campo('Ciudad', ciudad));
    fila2.appendChild(campo('Provincia', provincia));
    nodo.appendChild(fila2);
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
          provincia: provincia.value,
          sala: sala.value.trim(),
          precio: conPrecio ? precio.value.trim() : (f.precio || ''),
          entradas: entradas.value.trim()
        };
        datos.zona = Conciertos.zonaDe(datos.provincia);
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
    if (!d.provincia) return 'Falta la provincia' + donde + '.';
    if (!d.sala) return 'Falta la sala' + donde + '.';
    if (d.entradas && !ayuda.urlPermitida(d.entradas)) {
      return 'El enlace a entradas' + donde + ' no es válido (debe empezar por https:// y no puede ser de redes sociales).';
    }
    return '';
  }

  function pintarFormulario(contenedor, pub) {
    contenedor.textContent = '';
    var esGira = pub.tipo === 'gira';
    var editando = !!pub.id;
    titular(contenedor, (editando ? 'Editar ' : 'Publicar ') + (esGira ? 'gira' : 'concierto'), null);

    var form = crear('form', 'formulario');
    form.noValidate = true;
    contenedor.appendChild(form);

    var grupo = selector(opcionesGrupos(), pub.grupo_id, 'Elige grupo');
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

  window.Panel = {
    iniciar: iniciar,
    pintarAcceso: pintarAcceso,
    pintarPanel: pintarPanel
  };
})();
