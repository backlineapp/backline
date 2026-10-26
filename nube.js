// backline — conexión con Supabase (cuentas, publicaciones e imágenes).
//
// Este archivo es el ÚNICO sitio de la app que habla con Supabase.
// El resto de la app solo usa estas órdenes:
//   Nube.enviarCodigo(correo)          -> manda un código de 6 cifras por email
//   Nube.entrar(correo, codigo)        -> entra con ese código
//   Nube.entrarConClave(correo, clave) -> solo la cuenta de revisión de las tiendas
//   Nube.salir()
//   Nube.cuenta()                      -> { correo, admin, grupos } o null
//                                         (grupos = ids de los grupos que gestiona)
//   Nube.alCambiarCuenta(fn)           -> avisa al entrar o salir
//   Nube.refrescarCuenta()             -> vuelve a preguntar permisos y grupos
//   Nube.proximasFechas(gruposIds)     -> próximos conciertos de esos grupos (con el día en que se publicaron)
//   Nube.fecha(id)                     -> un concierto (fecha) con su publicación
//   Nube.novedades(gruposIds)          -> discos, vídeos y noticias de esos grupos
//   Nube.novedad(id)                   -> un disco, vídeo o noticia
//   Nube.publicaciones(gruposIds?)     -> lo publicado (todo, o de esos grupos)
//   Nube.publicacion(id)               -> una publicación con sus fechas
//   Nube.guardar(datos)                -> crea o actualiza cualquier publicación
//   Nube.borrar(publicacion)           -> borra publicación, fechas e imagen
//   Nube.urlCartel(ruta)               -> dirección pública de un cartel o imagen
//   Nube.solicitar(datos)              -> pide gestionar o retirar una ficha
//   Nube.misSolicitudes(grupoId)       -> las solicitudes propias para ese grupo
//   Nube.solicitudes()                 -> todas (solo administrador)
//   Nube.contarPendientes()            -> cuántas hay pendientes (administrador)
//   Nube.resolverSolicitud(id, si)     -> aprobar (true) o rechazar (false)
//   Nube.miembros()                    -> quién gestiona cada grupo (administrador)
//   Nube.quitarMiembro(grupoId, usuario)
//   Nube.claveAvisos()                 -> clave pública de los avisos al móvil
//   Nube.apuntarAvisos(sus, grupos)    -> apunta este móvil (o le cambia la lista),
//                                         en el navegador o en la app de las tiendas
//   Nube.borrarAvisos(sus)             -> borra este móvil de los avisos
//
// La clave de abajo es la PÚBLICA (publishable): puede estar a la vista.
// Lo que protege los datos son las reglas de la base de datos
// (supabase/1-base-de-datos.sql). La clave secreta nunca va en la app.

(function () {
  'use strict';

  var URL_SUPABASE = 'https://zyvrmiqqqdawskurvuvw.supabase.co';
  var CLAVE_PUBLICA = 'sb_publishable_90VpZ_8ZdoFHStutukXItQ_Afe3K2jO';
  var CARPETA = 'carteles';

  var cliente = window.supabase && window.supabase.createClient(URL_SUPABASE, CLAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  var cuentaActual = null;
  var avisos = [];

  function sinConexion() {
    return Promise.reject(new Error('No se ha podido conectar. Revisa la conexión.'));
  }

  // Convierte los errores de Supabase en mensajes para personas.
  function traducir(error) {
    var texto = String((error && (error.message || error.error_description)) || error || '');
    var t = texto.toLowerCase();
    // Avisos escritos ya para personas en la base de datos (supabase/5-miembros.sql).
    if (error && error.code === 'P0001') return texto;
    // Reglas de supabase/6-novedades.sql (la app ya lo avisa antes de enviar).
    if (error && error.code === '23514') {
      return /sin_redes/.test(t) ? 'Backline no admite enlaces a redes sociales.'
        : 'Revisa los datos: falta algo obligatorio o algún texto es demasiado largo.';
    }
    if (error && error.code === '23505') return 'Ya tienes una solicitud pendiente como esta. Espera a que la revisemos.';
    if (/invalid login credentials/.test(t)) return 'La contraseña no es correcta.';
    if (/expired|invalid|otp|token/.test(t)) return 'El código no es correcto o ha caducado. Pide uno nuevo.';
    if (/rate limit|too many|seconds/.test(t)) return 'Has pedido varios códigos seguidos. Espera unos minutos y vuelve a probar.';
    if (/email/.test(t) && /valid/.test(t)) return 'Revisa el correo: no parece válido.';
    if (/row-level security|permission|0 rows|no\) rows|not allowed|unauthorized|jwt/.test(t)) return 'No tienes permiso para hacer esto.';
    if (/fetch|network|failed to/.test(t)) return 'No se ha podido conectar. Revisa la conexión.';
    return 'Algo ha fallado (' + texto + ').';
  }

  function comprobar(respuesta) {
    if (respuesta.error) throw new Error(traducir(respuesta.error));
    return respuesta.data;
  }

  // ---------- Cuenta ----------

  function avisar() {
    avisos.forEach(function (fn) { try { fn(cuentaActual); } catch (e) { /* nada */ } });
  }

  function actualizarCuenta(sesion) {
    if (!sesion || !sesion.user) {
      cuentaActual = null;
      avisar();
      return Promise.resolve(null);
    }
    // Si algo falla (o aún no existe la tabla de miembros), la cuenta queda
    // sin permisos especiales: la app se sigue usando igual.
    var admin = cliente.rpc('es_admin').then(function (r) { return r.data === true; }, function () { return false; });
    var grupos = cliente.from('miembros').select('grupo_id').eq('usuario', sesion.user.id)
      .then(function (r) {
        return (r.data || []).map(function (m) { return m.grupo_id; });
      }, function () { return []; });
    return Promise.all([admin, grupos]).then(function (r) {
      cuentaActual = { id: sesion.user.id, correo: sesion.user.email, admin: r[0], grupos: r[1] };
      avisar();
      return cuentaActual;
    });
  }

  function refrescarCuenta() {
    if (!cliente) return Promise.resolve(null);
    return cliente.auth.getSession()
      .then(function (r) { return actualizarCuenta(r.data && r.data.session); })
      .catch(function () { return cuentaActual; });
  }

  var listo = cliente
    ? cliente.auth.getSession().then(function (r) { return actualizarCuenta(r.data && r.data.session); })
      .catch(function () { return null; })
    : Promise.resolve(null);

  if (cliente) {
    cliente.auth.onAuthStateChange(function (evento, sesion) {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
        // Fuera de este aviso, para no bloquear a Supabase mientras se pregunta.
        setTimeout(function () { actualizarCuenta(sesion); }, 0);
      }
    });
  }

  function enviarCodigo(correo) {
    if (!cliente) return sinConexion();
    return cliente.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: true } })
      .then(comprobar);
  }

  function entrar(correo, codigo) {
    if (!cliente) return sinConexion();
    return cliente.auth.verifyOtp({ email: correo, token: codigo, type: 'email' })
      .then(comprobar)
      .then(function (datos) { return actualizarCuenta(datos.session); });
  }

  // Solo para la cuenta de revisión de Google Play y la App Store (panel.js):
  // entra con contraseña en lugar de con un código por correo.
  function entrarConClave(correo, clave) {
    if (!cliente) return sinConexion();
    return cliente.auth.signInWithPassword({ email: correo, password: clave })
      .then(comprobar)
      .then(function (datos) { return actualizarCuenta(datos.session); });
  }

  function salir() {
    if (!cliente) return Promise.resolve();
    return cliente.auth.signOut().then(function () { return actualizarCuenta(null); });
  }

  // Borra la cuenta de quien ha entrado (supabase/12-borrar-cuenta.sql) y
  // cierra la sesión en este dispositivo.
  function borrarCuenta() {
    if (!cliente) return sinConexion();
    return cliente.rpc('borrar_mi_cuenta').then(comprobar).then(function () {
      return cliente.auth.signOut({ scope: 'local' }).catch(function () {}).then(function () {
        return actualizarCuenta(null);
      });
    });
  }

  // ---------- Conciertos ----------

  var CAMPOS_FECHA = 'id, fecha, hora, zona, ciudad, provincia, pais, sala, direccion, precio, entradas';
  var CAMPOS_PUBLICACION = 'id, grupo_id, tipo, titulo, cartel, creado';
  // Discos, vídeos y noticias (y, en el panel, cualquier publicación).
  var CAMPOS_NOVEDAD = 'id, grupo_id, tipo, titulo, texto, enlace, cartel, formato, salida, creado';
  var TIPOS_NOVEDAD = ['disco', 'video', 'noticia'];
  // Como mucho, las últimas que se piden de una vez.
  var MAX_NOVEDADES = 300;

  // Hoy en una zona horaria, como "2026-10-12".
  function hoyEn(zona) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date());
  }

  // Quita las fechas que ya han pasado según la hora del lugar del concierto.
  function soloProximas(fechas) {
    var hoy = {};
    return fechas.filter(function (f) {
      var zona = f.zona || 'Europe/Madrid';
      if (!hoy[zona]) {
        try { hoy[zona] = hoyEn(zona); } catch (e) { hoy[zona] = hoyEn('Europe/Madrid'); }
      }
      return f.fecha >= hoy[zona];
    });
  }

  // Próximas fechas de varios grupos (o de uno), por orden de fecha y hora.
  function proximasFechas(gruposIds) {
    if (!cliente) return sinConexion();
    if (!gruposIds.length) return Promise.resolve([]);
    // Se pide desde ayer (en Canarias aún puede ser "ayer") y se afina aquí.
    var ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return cliente.from('fechas')
      .select(CAMPOS_FECHA + ', publicacion:publicaciones!inner(' + CAMPOS_PUBLICACION + ')')
      .in('publicacion.grupo_id', gruposIds)
      .in('publicacion.tipo', ['concierto', 'gira'])
      .gte('fecha', ayer)
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true, nullsFirst: false })
      .then(comprobar)
      .then(soloProximas);
  }

  function fecha(id) {
    if (!cliente) return sinConexion();
    return cliente.from('fechas')
      .select(CAMPOS_FECHA + ', publicacion:publicaciones!inner(' + CAMPOS_PUBLICACION + ')')
      .eq('id', id)
      .maybeSingle()
      .then(comprobar);
  }

  // ---------- Discos, vídeos y noticias ----------

  // Lo publicado por esos grupos, de lo más nuevo a lo más antiguo.
  function novedades(gruposIds) {
    if (!cliente) return sinConexion();
    if (!gruposIds.length) return Promise.resolve([]);
    return cliente.from('publicaciones')
      .select(CAMPOS_NOVEDAD)
      .in('grupo_id', gruposIds)
      .in('tipo', TIPOS_NOVEDAD)
      .order('creado', { ascending: false })
      .limit(MAX_NOVEDADES)
      .then(comprobar);
  }

  function novedad(id) {
    if (!cliente) return sinConexion();
    return cliente.from('publicaciones')
      .select(CAMPOS_NOVEDAD)
      .eq('id', id)
      .in('tipo', TIPOS_NOVEDAD)
      .maybeSingle()
      .then(comprobar);
  }

  // ---------- Panel (administrador y grupos) ----------

  // Sin gruposIds: todo (administrador). Con gruposIds: solo de esos grupos.
  function publicaciones(gruposIds) {
    if (!cliente) return sinConexion();
    if (gruposIds && !gruposIds.length) return Promise.resolve([]);
    var peticion = cliente.from('publicaciones')
      .select(CAMPOS_NOVEDAD + ', fechas(' + CAMPOS_FECHA + ')');
    if (gruposIds) peticion = peticion.in('grupo_id', gruposIds);
    return peticion.order('creado', { ascending: false }).then(comprobar);
  }

  function publicacion(id) {
    if (!cliente) return sinConexion();
    return cliente.from('publicaciones')
      .select(CAMPOS_NOVEDAD + ', fechas(' + CAMPOS_FECHA + ')')
      .eq('id', id)
      .maybeSingle()
      .then(comprobar);
  }

  function urlCartel(ruta) {
    if (!ruta || !cliente) return '';
    return cliente.storage.from(CARPETA).getPublicUrl(ruta).data.publicUrl;
  }

  function idAleatorio() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function subirCartel(grupoId, archivo) {
    var ruta = grupoId + '/' + idAleatorio() + '.jpg';
    return cliente.storage.from(CARPETA)
      .upload(ruta, archivo, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
      .then(comprobar)
      .then(function () { return ruta; });
  }

  function borrarCartel(ruta) {
    if (!ruta) return Promise.resolve();
    return cliente.storage.from(CARPETA).remove([ruta]).then(comprobar);
  }

  function datosFecha(f) {
    return {
      fecha: f.fecha,
      hora: f.hora || null,
      zona: f.zona,
      ciudad: f.ciudad,
      provincia: f.provincia || null,
      pais: f.pais,
      sala: f.sala,
      direccion: f.direccion || null,
      precio: f.precio || null,
      entradas: f.entradas || null
    };
  }

  // Guarda cualquier publicación (concierto, gira, disco, vídeo o noticia).
  // datos = { id?, grupo_id, tipo, titulo, cartelAnterior, cartelNuevo (Blob)?,
  //           quitarCartel?, fechas: [{ id?, ...campos }], fechasBorradas: [id],
  //           y en discos, vídeos y noticias: texto, enlace, formato, salida }
  // Orden: 1) sube la imagen nueva; 2) guarda la publicación; 3) borra, cambia
  // y añade fechas; 4) si había imagen vieja y se ha cambiado o quitado, la borra.
  function guardar(datos) {
    if (!cliente) return sinConexion();
    var rutaNueva = null;
    var guardada = false;
    var id = datos.id;

    var paso = datos.cartelNuevo
      ? subirCartel(datos.grupo_id, datos.cartelNuevo).then(function (r) { rutaNueva = r; })
      : Promise.resolve();

    return paso
      .then(function () {
        var fila = { grupo_id: datos.grupo_id, tipo: datos.tipo, titulo: datos.titulo || null };
        if (TIPOS_NOVEDAD.indexOf(datos.tipo) !== -1) {
          fila.texto = datos.texto || null;
          fila.enlace = datos.enlace || null;
          fila.formato = datos.tipo === 'disco' ? datos.formato : null;
          fila.salida = datos.tipo === 'disco' ? datos.salida : null;
        }
        if (rutaNueva) fila.cartel = rutaNueva;
        else if (datos.quitarCartel) fila.cartel = null;
        var peticion = id
          ? cliente.from('publicaciones').update(fila).eq('id', id).select('id').single()
          : cliente.from('publicaciones').insert(fila).select('id').single();
        return peticion.then(comprobar);
      })
      .then(function (fila) {
        guardada = true;
        id = fila.id;
        var pasos = [];
        if (datos.fechasBorradas && datos.fechasBorradas.length) {
          pasos.push(cliente.from('fechas').delete().in('id', datos.fechasBorradas).then(comprobar));
        }
        (datos.fechas || []).forEach(function (f) {
          var filaFecha = datosFecha(f);
          if (f.id) {
            pasos.push(cliente.from('fechas').update(filaFecha).eq('id', f.id).then(comprobar));
          } else {
            filaFecha.publicacion_id = id;
            pasos.push(cliente.from('fechas').insert(filaFecha).then(comprobar));
          }
        });
        return Promise.all(pasos);
      })
      .then(function () {
        // La imagen anterior ya no se usa: se borra (si falla, no es grave).
        if ((rutaNueva || datos.quitarCartel) && datos.cartelAnterior) return borrarCartel(datos.cartelAnterior).catch(function () {});
      })
      .then(function () { return id; })
      .catch(function (error) {
        // Si no se llegó a guardar nada con el cartel nuevo, se quita para no dejar restos.
        if (rutaNueva && !guardada) borrarCartel(rutaNueva).catch(function () {});
        throw error;
      });
  }

  // Borra una publicación (sus fechas se borran solas) y después su imagen.
  function borrar(pub) {
    if (!cliente) return sinConexion();
    return cliente.from('publicaciones').delete().eq('id', pub.id).select('id')
      .then(comprobar)
      .then(function (filas) {
        if (!filas || !filas.length) throw new Error('No tienes permiso para hacer esto.');
        return borrarCartel(pub.cartel);
      });
  }

  // ---------- Solicitudes y miembros ----------
  // Quién pide, su correo y el estado los pone la base de datos, no la app.

  var CAMPOS_SOLICITUD = 'id, grupo_id, tipo, nombre, papel, mensaje, acepta, estado, creado, resuelto';

  // datos = { grupo_id, tipo ('gestionar' | 'retirar'), nombre, papel, mensaje, acepta }
  function solicitar(datos) {
    if (!cliente) return sinConexion();
    return cliente.from('solicitudes').insert({
      grupo_id: datos.grupo_id,
      tipo: datos.tipo,
      nombre: datos.nombre,
      papel: datos.papel,
      mensaje: datos.mensaje || null,
      acepta: !!datos.acepta
    }).then(comprobar);
  }

  function misSolicitudes(grupoId) {
    if (!cliente) return sinConexion();
    var cuenta = cuentaActual;
    if (!cuenta) return Promise.resolve([]);
    return cliente.from('solicitudes')
      .select(CAMPOS_SOLICITUD)
      .eq('usuario', cuenta.id)
      .eq('grupo_id', grupoId)
      .order('creado', { ascending: false })
      .then(comprobar);
  }

  // Todas las pendientes y las 40 últimas resueltas.
  function solicitudes() {
    if (!cliente) return sinConexion();
    var campos = CAMPOS_SOLICITUD + ', usuario, correo';
    return Promise.all([
      cliente.from('solicitudes').select(campos).eq('estado', 'pendiente')
        .order('creado', { ascending: true }).then(comprobar),
      cliente.from('solicitudes').select(campos).neq('estado', 'pendiente')
        .order('resuelto', { ascending: false }).limit(40).then(comprobar)
    ]).then(function (r) { return { pendientes: r[0], resueltas: r[1] }; });
  }

  function contarPendientes() {
    if (!cliente) return sinConexion();
    return cliente.from('solicitudes').select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .then(function (r) {
        if (r.error) throw new Error(traducir(r.error));
        return r.count || 0;
      });
  }

  function resolverSolicitud(id, aprobar) {
    if (!cliente) return sinConexion();
    return cliente.rpc('resolver_solicitud', { p_id: id, p_aprobar: !!aprobar }).then(comprobar);
  }

  function miembros() {
    if (!cliente) return sinConexion();
    return cliente.from('miembros')
      .select('grupo_id, usuario, nombre, papel, correo, creado')
      .order('creado', { ascending: true })
      .then(comprobar);
  }

  function quitarMiembro(grupoId, usuario) {
    if (!cliente) return sinConexion();
    return cliente.from('miembros').delete()
      .eq('grupo_id', grupoId).eq('usuario', usuario)
      .select('usuario')
      .then(comprobar)
      .then(function (filas) {
        if (!filas || !filas.length) throw new Error('No tienes permiso para hacer esto.');
      });
  }

  // Solo administrador: cuántas personas reciben los avisos de cada grupo.
  // { moviles, grupos: [{ grupo_id, personas }] } (solo cifras).
  function avisosPorGrupo() {
    if (!cliente) return sinConexion();
    return cliente.rpc('avisos_por_grupo').then(comprobar);
  }

  // Comunicados del administrador a los grupos ("Novedades de Backline").
  // Solo los ven el administrador y quien gestiona alguna ficha.
  function comunicados(limite) {
    if (!cliente) return sinConexion();
    return cliente.from('comunicados')
      .select('id, titulo, texto, creado')
      .order('creado', { ascending: false })
      .limit(limite || 20)
      .then(comprobar);
  }

  function escribirComunicado(titulo, texto) {
    if (!cliente) return sinConexion();
    return cliente.from('comunicados').insert({ titulo: titulo, texto: texto }).then(comprobar);
  }

  function borrarComunicado(id) {
    if (!cliente) return sinConexion();
    return cliente.from('comunicados').delete().eq('id', id)
      .select('id')
      .then(comprobar)
      .then(function (filas) {
        if (!filas || !filas.length) throw new Error('No tienes permiso para hacer esto.');
      });
  }

  // ---------- Denuncias (supabase/13-denuncias.sql) ----------

  // Cualquiera, con o sin cuenta.
  function denunciar(publicacionId, motivo, texto, contacto) {
    if (!cliente) return sinConexion();
    return cliente.rpc('denunciar', {
      p_publicacion: publicacionId, p_motivo: motivo, p_texto: texto || null, p_contacto: contacto || null
    }).then(comprobar);
  }

  // Solo administrador.
  function denuncias() {
    if (!cliente) return sinConexion();
    return cliente.from('denuncias')
      .select('id, publicacion_id, grupo_id, titulo, motivo, texto, contacto, estado, creado, resuelto')
      .order('creado', { ascending: false })
      .limit(100)
      .then(comprobar);
  }

  function resolverDenuncia(id, retirar) {
    if (!cliente) return sinConexion();
    return cliente.rpc('resolver_denuncia', { p_id: id, p_retirar: !!retirar }).then(comprobar);
  }

  // ---------- Avisos al móvil ----------
  // Las suscripciones no se pueden leer desde la app: solo apuntarse o
  // borrarse, y siempre demostrando que es este móvil (con su clave "auth").

  function claveAvisos() {
    if (!cliente) return sinConexion();
    return cliente.rpc('avisos_clave_publica').then(comprobar).then(function (clave) {
      if (!clave) throw new Error('Los avisos aún no están preparados.');
      return clave;
    });
  }

  // sus = suscripción del navegador en forma JSON: { endpoint, keys: { p256dh, auth } }
  // En la app de las tiendas: { endpoint: 'fcm:…' o 'apns:…', keys: { auth } }.
  function apuntarAvisos(sus, grupos) {
    if (!cliente) return sinConexion();
    if (!/^https:/.test(sus.endpoint)) {
      return cliente.rpc('avisos_apuntar_nativo', {
        p_endpoint: sus.endpoint,
        p_auth: sus.keys.auth,
        p_grupos: grupos
      }).then(comprobar);
    }
    return cliente.rpc('avisos_apuntar', {
      p_endpoint: sus.endpoint,
      p_p256dh: sus.keys.p256dh,
      p_auth: sus.keys.auth,
      p_grupos: grupos
    }).then(comprobar);
  }

  function borrarAvisos(sus) {
    if (!cliente) return sinConexion();
    return cliente.rpc('avisos_borrar', { p_endpoint: sus.endpoint, p_auth: sus.keys.auth }).then(comprobar);
  }

  window.Nube = {
    listo: listo,
    disponible: !!cliente,
    cuenta: function () { return cuentaActual; },
    alCambiarCuenta: function (fn) { avisos.push(fn); },
    refrescarCuenta: refrescarCuenta,
    enviarCodigo: enviarCodigo,
    entrar: entrar,
    entrarConClave: entrarConClave,
    salir: salir,
    borrarCuenta: borrarCuenta,
    proximasFechas: proximasFechas,
    fecha: fecha,
    novedades: novedades,
    novedad: novedad,
    publicaciones: publicaciones,
    publicacion: publicacion,
    guardar: guardar,
    borrar: borrar,
    urlCartel: urlCartel,
    solicitar: solicitar,
    misSolicitudes: misSolicitudes,
    solicitudes: solicitudes,
    contarPendientes: contarPendientes,
    resolverSolicitud: resolverSolicitud,
    miembros: miembros,
    quitarMiembro: quitarMiembro,
    avisosPorGrupo: avisosPorGrupo,
    comunicados: comunicados,
    denunciar: denunciar,
    denuncias: denuncias,
    resolverDenuncia: resolverDenuncia,
    escribirComunicado: escribirComunicado,
    borrarComunicado: borrarComunicado,
    claveAvisos: claveAvisos,
    apuntarAvisos: apuntarAvisos,
    borrarAvisos: borrarAvisos
  };
})();
