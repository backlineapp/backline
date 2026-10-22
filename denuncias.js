// Backline — «Denunciar esta publicación» (lo exigen las tiendas a las apps
// donde los usuarios publican contenido).
//
// Un enlace discreto al final de cada concierto, disco, vídeo y noticia. Al
// pulsarlo se despliega un formulario corto: motivo, comentario opcional y
// correo opcional. Llega al administrador (Mi panel → Denuncias) con un aviso
// al móvil. Funciona con o sin cuenta.
//
// Orden que usa el resto de la app:
//   Denuncias.enlace(publicacionId) -> el bloque para poner al final del detalle

(function () {
  'use strict';

  var MOTIVOS = [
    ['ofensivo', 'Contenido ofensivo o inapropiado'],
    ['no-es-del-grupo', 'No parece publicado por el grupo'],
    ['derechos', 'Usa algo sin permiso (cartel, foto, música)'],
    ['falso', 'Información falsa o engañosa'],
    ['otro', 'Otro motivo']
  ];

  function crear(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function enlace(publicacionId) {
    var caja = crear('div', 'denunciar');
    var abrir = crear('button', 'enlace-denunciar', 'Denunciar esta publicación');
    abrir.type = 'button';
    caja.appendChild(abrir);

    abrir.addEventListener('click', function () {
      abrir.hidden = true;
      var form = crear('form', 'formulario denunciar-form');
      form.noValidate = true;
      form.appendChild(crear('p', 'etiqueta-seccion', 'Denunciar esta publicación'));
      form.appendChild(crear('p', 'campo-nota', 'Revisamos cada denuncia a mano y, si hace falta, retiramos la publicación.'));

      var grupo = crear('fieldset', 'denunciar-motivos');
      var leyenda = crear('legend', 'campo-etiqueta', 'Motivo');
      grupo.appendChild(leyenda);
      MOTIVOS.forEach(function (m, i) {
        var etiqueta = crear('label', 'casilla');
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'motivo-' + publicacionId;
        radio.value = m[0];
        if (i === 0) radio.required = true;
        etiqueta.appendChild(radio);
        etiqueta.appendChild(crear('span', null, m[1]));
        grupo.appendChild(etiqueta);
      });
      form.appendChild(grupo);

      var texto = document.createElement('textarea');
      texto.maxLength = 1000;
      texto.rows = 3;
      texto.placeholder = 'Cuéntanos qué pasa (opcional)';
      var campoTexto = crear('label', 'campo');
      campoTexto.appendChild(crear('span', 'campo-etiqueta', 'Comentario'));
      campoTexto.appendChild(texto);
      form.appendChild(campoTexto);

      var correo = document.createElement('input');
      correo.type = 'email';
      correo.maxLength = 200;
      correo.autocomplete = 'email';
      correo.placeholder = 'tu@correo.com';
      var campoCorreo = crear('label', 'campo');
      campoCorreo.appendChild(crear('span', 'campo-etiqueta', 'Tu correo (opcional)'));
      campoCorreo.appendChild(correo);
      campoCorreo.appendChild(crear('span', 'campo-nota', 'Solo por si necesitamos preguntarte algo.'));
      form.appendChild(campoCorreo);

      var botones = crear('div', 'denunciar-botones');
      var enviar = crear('button', 'boton', 'Enviar denuncia');
      enviar.type = 'submit';
      var cancelar = crear('button', 'boton-texto', 'Cancelar');
      cancelar.type = 'button';
      botones.appendChild(enviar);
      botones.appendChild(cancelar);
      form.appendChild(botones);

      var aviso = crear('p', 'mensaje');
      aviso.hidden = true;
      form.appendChild(aviso);

      function mensaje(t, tipo) {
        aviso.textContent = t;
        aviso.className = 'mensaje' + (tipo ? ' ' + tipo : '');
        aviso.hidden = !t;
      }

      cancelar.addEventListener('click', function () {
        caja.removeChild(form);
        abrir.hidden = false;
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var elegido = form.querySelector('input[type=radio]:checked');
        if (!elegido) return mensaje('Elige un motivo.', 'error');
        enviar.disabled = true;
        mensaje('Enviando…');
        Nube.denunciar(publicacionId, elegido.value, texto.value.trim(), correo.value.trim()).then(function () {
          caja.textContent = '';
          caja.appendChild(crear('p', 'mensaje ok', 'Gracias. Hemos recibido tu denuncia y la revisaremos lo antes posible.'));
        }, function (err) {
          enviar.disabled = false;
          mensaje(err.message, 'error');
        });
      });

      caja.appendChild(form);
      if (form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return caja;
  }

  window.Denuncias = { enlace: enlace, MOTIVOS: MOTIVOS };
})();
