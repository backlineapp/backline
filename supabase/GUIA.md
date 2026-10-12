# Guía: preparar Supabase para los conciertos

Esta guía se sigue **una sola vez**. Son 7 pasos, y todo se hace en la web de Supabase (https://supabase.com/dashboard), dentro del proyecto de backline. Los nombres de los menús pueden cambiar un poco con el tiempo. Si alguno no coincide, busca el más parecido.

> Para los **avisos al móvil** y los **conciertos fuera de España** hay una guía aparte: `supabase/GUIA-AVISOS.md`.
>
> Para que **los grupos gestionen su ficha** (solicitudes y miembros) hay otra guía: `supabase/GUIA-MIEMBROS.md`.

> **Nunca** copies ni compartas la clave secreta (la que se llama *secret* o *service_role*). La app no la necesita. La única clave que lleva la app es la pública (*publishable*), y esa puede estar a la vista sin problema.

---

## Paso 1. Crear la base de datos

1. En el menú de la izquierda, entra en **SQL Editor**.
2. Pulsa **New query** (nueva consulta).
3. Abre el archivo `supabase/1-base-de-datos.sql` del repositorio, copia **todo** su contenido y pégalo en el cuadro grande.
4. Pulsa **Run** (abajo a la derecha).
5. Debe salir **"Success. No rows returned"**. Si sale algún aviso en amarillo, no pasa nada.

Al final del archivo van también los permisos para que la app pueda usar las tablas. Hacen falta porque tu proyecto se creó con "Automatically expose new tables" desactivado; sin ellos, la app daría el error "permission denied" (42501).

Esto crea las tablas de publicaciones y fechas, la carpeta de carteles y las reglas de seguridad: todo el mundo puede leer, y solo el administrador (y, tras `GUIA-MIEMBROS.md`, los miembros de cada grupo) puede crear, editar o borrar. Si un día hay que repetirlo, se puede volver a ejecutar sin miedo, porque no borra nada.

## Paso 2. Que se puedan crear cuentas con el correo

1. Menú izquierdo: **Authentication** → **Sign In / Providers**.
2. Comprueba que **Allow new users to sign up** está **activado**.
3. En la lista de proveedores, abre **Email** y comprueba que está **activado** (*Enable Email provider*).
4. En esa misma ventana:
   - **Email OTP Length** (cifras del código): **6**.
   - **Email OTP Expiration** (cuánto dura el código): **3600** segundos, es decir, una hora. Puedes dejar lo que venga.
5. Pulsa **Save**.

## Paso 3. Que el correo lleve un código (y no un enlace)

1. Menú izquierdo: **Authentication** → **Emails** (en algunas versiones, **Email Templates**).
2. Abre la plantilla **Magic Link**.
3. En **Subject** (asunto) escribe:

   ```
   Tu código para entrar en backline
   ```

4. En el cuerpo del mensaje, borra lo que haya y pega esto:

   ```html
   <h2>Tu código para entrar en backline</h2>
   <p>Escribe este código en la app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Caduca en una hora. Si no lo has pedido tú, puedes ignorar este correo.</p>
   ```

5. Pulsa **Save**.
6. Repite lo mismo (asunto y cuerpo idénticos) en la plantilla **Confirm signup**. Es la que Supabase usa la **primera vez** que entra un correo nuevo.

Lo importante es `{{ .Token }}`: ahí Supabase pone el código de 6 cifras.

## Paso 4. La dirección de la app

1. Menú izquierdo: **Authentication** → **URL Configuration**.
2. En **Site URL** escribe la dirección de la app:

   ```
   https://backlineapp.github.io/backline/
   ```

3. En **Redirect URLs** pulsa **Add URL** y añade esa misma dirección.
4. Pulsa **Save**.

Si un día la app cambia de dirección (por ejemplo, con un dominio propio), habrá que cambiarla también aquí.

## Paso 5. Entrar una vez en la app con tu correo

1. Abre backline en el móvil.
2. Ve a **Mis grupos**, baja hasta el final y pulsa **Acceso**.
3. Escribe tu correo de administrador y pulsa **Enviar código**.
4. Te llegará un email con 6 cifras. Mira también en *correo no deseado*.
5. Escribe el código y pulsa **Entrar**.

Todavía no verás el panel, y es normal: Supabase ya conoce tu cuenta, pero aún no sabe que eres el administrador. Eso se hace en el paso siguiente.

## Paso 6. Nombrarte administrador

1. Vuelve a **SQL Editor** → **New query**.
2. Abre el archivo `supabase/2-administrador.sql`, copia todo y pégalo.
3. **Cambia `TU_CORREO` por tu correo de administrador.** Deja las comillas: tiene que quedar así: `lower('tucorreo@ejemplo.com')`.
4. Pulsa **Run**.
5. Abajo debe salir **una fila con tu correo**. Si no sale ninguna, es que el paso 5 no llegó a completarse (o hay una errata en el correo). Repite el paso 5 y luego este.

Tu correo queda guardado solo en Supabase, no en el repositorio, que es público.

## Paso 7. Comprobar que todo funciona

1. Cierra la app del todo y vuelve a abrirla.
2. Ve a **Mis grupos**: al final ya no pondrá "Acceso", sino **Mi panel**.
3. Entra, pulsa **Publicar → Concierto** y publica uno de prueba con su cartel.
4. Sigue a ese grupo y mira la pestaña **Conciertos**: debe aparecer el concierto.
5. Borra el concierto de prueba desde **Mi panel**.
6. Opcional: en el menú de Supabase, entra en **Storage** → **carteles**. El cartel de prueba ya no debe estar.

---

## Bueno saberlo

- **Límite de emails.** El correo gratuito de Supabase solo envía **unos pocos emails por hora**. Para que entres tú basta de sobra, pero si pides varios códigos seguidos, puede que tengas que esperar un rato. Cuando entren los grupos o los fans habrá que conectar un servicio de correo propio (en **Authentication → Emails → SMTP Settings**), que también puede ser gratuito.
- **Las reglas están en la base de datos.** Aunque alguien copiara la app o la clave pública, no podría publicar, editar ni borrar nada: lo impide Supabase, no la pantalla.
- **Para dar de baja al administrador**, en **Table Editor** → **administradores** se borra su fila.
