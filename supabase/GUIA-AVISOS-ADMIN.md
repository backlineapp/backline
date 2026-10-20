# Guía: aviso al móvil del administrador cuando llega una solicitud

Con esto, cada vez que un grupo pida gestionar su ficha o retirarla, te llegará un aviso al móvil:

- **«Backline · Dry River quiere gestionar su ficha»**
- **«Backline · Dry River pide retirar su ficha»**

Al tocarlo se abre **Mi panel → Solicitudes**.

Se sigue **una sola vez**, en la web de Supabase (https://supabase.com/dashboard), dentro del proyecto de backline. Los nombres de los menús pueden cambiar un poco con el tiempo. Si alguno no coincide, busca el más parecido.

**El orden importa:** primero la base de datos (paso 1), luego la función (paso 2) y después aceptar la petición (paso 3).

---

### Paso 1. Preparar la base de datos

1. Menú de la izquierda: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/7-avisos-admin.sql` del repositorio, copia **todo** y pégalo.
3. Pulsa **Run**.
4. Abajo deben salir **2 filas**: `admin` (de `suscripciones`) y `solicitud_id` (de `avisos_solicitudes`). Si sale algún aviso en amarillo, no pasa nada.

Esto hace tres cosas:

- **Apunta qué móvil es el tuyo.** Lo decide la propia base de datos al ver que la sesión iniciada es la del administrador. Nadie puede marcarse a sí mismo desde la app.
- **Crea una lista de espera de solicitudes.** Cada solicitud nueva entra en ella sola. Las que ya tenías antes de este paso **no avisan**.
- **Pone las reglas de estos avisos:**
  - Sin los 10 minutos de espera y sin el límite de uno al día: llega un aviso por cada solicitud.
  - Entre las 23:00 y las 9:00 no se envía nada: lo de la noche sale a las 9:00, hora de Madrid.
  - Si ya has resuelto la solicitud antes de que salga el aviso, no se envía.

Como tu proyecto tiene desactivado «Automatically expose new tables», el archivo ya incluye los permisos uno a uno. La app no puede leer ni tocar la lista de espera.

Se puede volver a ejecutar sin miedo. **Ojo:** si algún día vuelves a ejecutar `4-avisos.sql`, ejecuta después `6-novedades.sql` y este archivo otra vez.

### Paso 2. Volver a subir la función enviar-avisos

**Sí, hay que volver a subirla:** la función ha cambiado para enviar también estos avisos. Los secretos y las claves no cambian.

1. Menú izquierdo: **Edge Functions** → **Functions** → entra en **enviar-avisos**.
2. Abre la pestaña **Code** (o el editor de la función).
3. Borra **todo** el código que hay.
4. Abre el archivo `supabase/functions/enviar-avisos/index.ts` del repositorio, copia **todo** y pégalo.
5. Pulsa **Deploy** (o **Deploy updates**). Espera a que diga que está desplegada.
6. Comprueba en **Details** (o **Settings**) que **Enforce JWT verification** sigue **desactivado**, como en la primera vez.

### Paso 3. Aceptar la petición

1. En GitHub, abre la petición (pull request) y pulsa **Merge pull request** → **Confirm merge**.
2. Espera 2 o 3 minutos a que se publique.
3. Abre la app en el móvil. Se actualizará sola.

### Paso 4. Marcar tu móvil

1. En el móvil, entra en la app con **hibackline@gmail.com** (**Mis grupos** → **Acceso**).
2. Ve a **Mis grupos**:
   - Si los avisos **ya estaban activados**, no hagas nada: la app avisa a Supabase sola al entrar con tu cuenta.
   - Si no, pulsa **Activar avisos** y acepta el permiso.
3. En el recuadro de los avisos debe aparecer: *«Como administrador, también te avisaremos de cada solicitud nueva…»*.

Si un día cierras la sesión en ese móvil, deja de recibir estos avisos (los de tus grupos siguen llegando). Para volver a recibirlos, entra otra vez con tu cuenta.

### Paso 5. Probarlo

Hazlo **entre las 9:00 y las 22:30**.

1. Desde **otro móvil u ordenador**, entra en la app con **otro correo** (no el del administrador).
2. Abre la ficha de un grupo → **¿Es tu grupo?** → envía una solicitud de prueba.
3. En **5 minutos como mucho** te llegará **«Backline · [Grupo] quiere gestionar su ficha»**. Al tocarlo se abre Mi panel en Solicitudes.
4. Rechaza la solicitud de prueba.

**El número rojo:** con tu sesión iniciada, verás en rojo cuántas solicitudes tienes pendientes junto a **Mi panel** y también en la pestaña **Mis grupos** de abajo. Solo lo ve el administrador.

**Si no llega:**

- **Edge Functions** → **enviar-avisos** → **Logs**: debe salir una línea como `avisos: {"grupos":0,"solicitudes":1,"enviados":1,...}`.
  - Si pone `"solicitudes":0`, tu móvil no está marcado como del administrador (repite el paso 4) o ya habías resuelto la solicitud.
  - Si sale `avisos del administrador: …`, repite el paso 1.
  - Si la línea no tiene `"solicitudes"`, la función es la antigua: repite el paso 2.
