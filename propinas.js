// Backline — propinas dentro de la app de las tiendas (Google Play y App Store).
//
// Apple y Google no dejan enlazar a pagos externos (Ko-fi) desde sus apps:
// una aportación voluntaria tiene que pasar por su sistema de compras. Por eso,
// en la app hay tres botones de propina de una sola vez; en la web sigue Ko-fi
// (sobre.js). No da nada a cambio: es solo una forma de apoyar el proyecto.
//
// Usa el complemento cordova-plugin-purchase (CdvPurchase), que solo existe
// dentro de la app. En la web este archivo no hace nada.
//
// Los productos se crean en Play Console y en App Store Connect con estos
// identificadores (tipo «consumible»): propina_2, propina_5, propina_10.
//
// Órdenes que usa el resto de la app:
//   Propinas.disponible()      -> ¿estamos en la app de una tienda?
//   Propinas.pintar(contenedor) -> pinta los botones con el precio de la tienda

(function () {
  'use strict';

  var IDS = ['propina_2', 'propina_5', 'propina_10'];
  var listo = null;          // promesa: la tienda está preparada
  var contenedores = [];     // recuadros pintados, para repintarlos
  var estado = { cargando: true, error: '', gracias: false, comprando: '' };

  function enApp() {
    return !!(window.Nativa && Nativa.es);
  }

  function plataforma() {
    var P = window.CdvPurchase && CdvPurchase.Platform;
    if (!P) return null;
    return Nativa.plataforma === 'ios' ? P.APPLE_APPSTORE : P.GOOGLE_PLAY;
  }

  function crear(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  // Espera a que los complementos de la app estén cargados.
  function dispositivoListo() {
    return new Promise(function (resolver) {
      if (window.CdvPurchase) return resolver();
      document.addEventListener('deviceready', function () { resolver(); }, { once: true });
      setTimeout(resolver, 8000);
    });
  }

  function preparar() {
    if (listo) return listo;
    listo = dispositivoListo().then(function () {
      if (!window.CdvPurchase) throw new Error('sin-tienda');
      var store = CdvPurchase.store;
      var plat = plataforma();
      store.register(IDS.map(function (id) {
        return { id: id, type: CdvPurchase.ProductType.CONSUMABLE, platform: plat };
      }));
      // Una propina no desbloquea nada: en cuanto la tienda la aprueba, se
      // da por terminada (así se puede volver a dar otra).
      store.when()
        .approved(function (t) { t.finish(); })
        .finished(function () {
          estado.gracias = true;
          estado.comprando = '';
          repintar();
        });
      store.error(function (e) {
        // Cancelar el pago no es un error que haya que contar.
        if (e && e.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) estado.error = '';
        else estado.error = 'No se ha podido completar el pago. Inténtalo más tarde.';
        estado.comprando = '';
        repintar();
      });
      return store.initialize([plat]);
    }).then(function () {
      estado.cargando = false;
      repintar();
    }, function () {
      estado.cargando = false;
      repintar();
    });
    return listo;
  }

  function productos() {
    if (!window.CdvPurchase) return [];
    var store = CdvPurchase.store;
    return IDS.map(function (id) { return store.get(id, plataforma()); })
      .filter(function (p) { return p && p.canPurchase && p.getOffer(); });
  }

  function comprar(producto) {
    estado.error = '';
    estado.gracias = false;
    estado.comprando = producto.id;
    repintar();
    var oferta = producto.getOffer();
    oferta.order().then(function (err) {
      if (err) {
        estado.comprando = '';
        if (err.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) estado.error = 'No se ha podido completar el pago. Inténtalo más tarde.';
        repintar();
      }
    });
  }

  function dibujar(caja) {
    caja.textContent = '';
    if (estado.gracias) {
      caja.appendChild(crear('p', 'mensaje ok', '¡Muchísimas gracias por apoyar Backline!'));
    }
    var lista = productos();
    if (estado.cargando) {
      caja.appendChild(crear('p', 'campo-nota', 'Cargando…'));
      return;
    }
    if (!lista.length) {
      caja.appendChild(crear('p', 'campo-nota', 'Las aportaciones estarán disponibles muy pronto.'));
      return;
    }
    var fila = crear('div', 'propinas-botones');
    lista.forEach(function (p) {
      var precio = (p.pricing && p.pricing.price) || '';
      var b = crear('button', 'boton', estado.comprando === p.id ? 'Abriendo…' : 'Aportar ' + precio);
      b.type = 'button';
      b.disabled = !!estado.comprando;
      b.addEventListener('click', function () { comprar(p); });
      fila.appendChild(b);
    });
    caja.appendChild(fila);
    if (estado.error) caja.appendChild(crear('p', 'mensaje error', estado.error));
    var tienda = Nativa.plataforma === 'ios' ? 'la App Store' : 'Google Play';
    caja.appendChild(crear('p', 'campo-nota', 'Es una aportación de una sola vez. El pago lo gestiona ' + tienda + ': Backline no ve tus datos de pago. No cambia nada en la app.'));
  }

  function repintar() {
    contenedores = contenedores.filter(function (c) { return c.isConnected; });
    contenedores.forEach(dibujar);
  }

  function pintar(contenedor) {
    var caja = crear('div', 'propinas');
    contenedor.appendChild(caja);
    contenedores.push(caja);
    dibujar(caja);
    preparar();
  }

  window.Propinas = { disponible: enApp, pintar: pintar };
})();
