# Guía: que los grupos gestionen su ficha

Esta guía se sigue **una sola vez**. Son pocos pasos, y la parte de Supabase se hace en su web (https://supabase.com/dashboard), dentro del proyecto de backline. Los nombres de los menús pueden cambiar un poco con el tiempo. Si alguno no coincide, busca el más parecido.

Tiene cuatro partes, y **el orden importa**:

- **A. Antes de aceptar la petición (pull request):** preparar la base de datos (pasos 1 y 2).
- **B. Aceptar la petición** en GitHub (paso 3).
- **C. Probarlo** con un segundo correo (paso 4).
- **D. El día a día:** cómo revisar solicitudes, retirar fichas y quitar a alguien.

---

## A. Antes de aceptar la petición

### Paso 1. Crear las solicitudes y los miembros

1. Menú de la izquierda: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/5-miembros.sql` del repositorio, copia **todo** su contenido y pégalo en el cuadro grande.
3. Pulsa **Run** (abajo a la derecha).
4. Debe salir **"Success. No rows returned"**. Si sale algún aviso en amarillo, no pasa nada.

Esto hace cuatro cosas:

- Crea la lista de **solicitudes**: quién pide gestionar una ficha o que se retire, y en qué estado está (Pendiente, Aprobada o Rechazada).
- Crea la lista de **miembros**: quién gestiona cada grupo. Un grupo puede tener varios miembros, y una persona puede gestionar varios grupos.
- Amplía la regla que decide quién puede publicar. Antes solo podías tú. Ahora puedes tú **o** un miembro aprobado de **ese** grupo, y nada de otros grupos. La regla vale también para los carteles.
- Pone los permisos uno a uno, porque tu proyecto tiene desactivado "Automatically expose new tables".

Las protecciones están en la base de datos, no en la pantalla. Aunque alguien copiara la app, no podría:

- aprobarse a sí mismo ni añadirse como miembro;
- cambiar el estado de una solicitud;
- publicar en un grupo que no gestiona.

Solo el administrador aprueba, y ni siquiera él puede aprobar una solicitud suya.

Si un día hay que repetirlo, se puede volver a ejecutar sin miedo, porque no borra nada. También puedes volver a ejecutar `1-base-de-datos.sql`: ya lleva la regla nueva y no quita a los miembros.

### Paso 2. Comprobar (opcional)

1. Menú de la izquierda: **Table Editor**.
2. Deben aparecer dos tablas nuevas, **miembros** y **solicitudes**, vacías.

## B. Aceptar la petición

### Paso 3. Publicar la versión nueva de la app

1. En GitHub, abre la petición (pull request) de este cambio.
2. Pulsa **Merge pull request** y después **Confirm merge**.
3. Espera un par de minutos. La app se actualiza sola (versión 7) la próxima vez que la abras. Si no la ves cambiada, ciérrala del todo y vuelve a abrirla.

## C. Probarlo

### Paso 4. Una prueba completa con un segundo correo

Necesitas **otro correo** que no sea el de administrador (por ejemplo, uno personal). Lo ideal es usar dos dispositivos, el móvil y el ordenador; si no, entra y sal de la cuenta en uno solo.

**Como si fueras un grupo (con el segundo correo):**

1. Abre la ficha de cualquier grupo y baja hasta el final. Pulsa **«¿Es tu grupo? Gestiona o retira tu ficha»**.
2. Te pedirá el correo. Escríbelo, pulsa **Enviar código** y escribe las 6 cifras que te lleguen (mira también en *correo no deseado*).
3. Rellena tu nombre y tu papel en el grupo, marca la casilla y pulsa **Solicitar gestionar esta ficha**.
4. Arriba debe salir la solicitud con el estado **Pendiente**.

**Como administrador (con tu correo):**

5. Ve a **Mis grupos** y baja hasta el final. Junto a **Mi panel** debe verse un **número ámbar**: son las solicitudes pendientes.
6. Entra en **Mi panel** → **Solicitudes**. Verás quién lo pide, su papel, su correo, su mensaje y que ha marcado la casilla. Pulsa **Aprobar**.
7. Entra en **Mi panel** → **Miembros**. Debe aparecer esa persona dentro de su grupo.

**Otra vez como grupo (con el segundo correo):**

8. Vuelve a la ficha → **¿Es tu grupo?**. La solicitud ya pone **Aprobada**, y hay un botón **Ir a mi panel**.
9. En **Mi panel** solo debe aparecer ese grupo. Publica un concierto de prueba con su cartel. En el desplegable **Grupo** solo sale el suyo.

**Para terminar (con tu correo):**

10. En **Mi panel** → **Miembros**, pulsa **Quitar** junto a la persona de prueba.
11. Con el segundo correo, **Mi panel** ya no aparece: el enlace vuelve a poner **Acceso**.
12. Borra el concierto de prueba desde tu **Mi panel**.

---

## D. El día a día

- **Antes de aprobar, comprueba que es de verdad del grupo.** Por ejemplo, escríbele al correo que aparece en la solicitud, o compáralo con la web o el Bandcamp del grupo. La casilla deja constancia de que la persona dice formar parte del grupo y tener derecho a publicar lo que sube, pero no lo demuestra.
- **Quien pide ve siempre cómo va su solicitud** (Pendiente, Aprobada o Rechazada) en la misma pantalla de «¿Es tu grupo?». No recibe ningún correo: tiene que volver a mirar. Si se rechaza, puede volver a pedirlo.
- **Peticiones de retirar la ficha.** Al aprobarlas, la ficha **no se quita sola** (es lo que elegiste, la opción A). Después hay que quitar el grupo de `grupos.json` (pídemelo y lo hago). Al quitarlo:
  - la ficha deja de verse;
  - sus conciertos dejan de mostrarse en todas partes, sin romper nada;
  - lo publicado se queda guardado en Supabase. En tu panel aparece con la nota «el grupo ya no está en la lista: no se muestra», y puedes borrarlo;
  - si el grupo vuelve algún día a la lista, sus conciertos reaparecen.
- **Quitar a alguien:** **Mi panel** → **Miembros** → **Quitar**. Deja de poder publicar al momento. Lo que ya publicó se queda; si quieres, lo borras desde tu panel.
- **Datos privados.** Los nombres, papeles, mensajes y correos de las solicitudes se guardan solo en Supabase. Nunca van al repositorio, que es público.
- **Límite de correos (importante).** El correo gratuito de Supabase envía **muy pocos emails por hora**. Para probarlo tú basta. Pero cuando empieces a avisar a los grupos, varios pedirán su código a la vez y algunos no les llegarán. Antes de anunciarlo conviene conectar un servicio de correo propio, que puede ser gratuito (en **Authentication → Emails → SMTP Settings**). Puedo prepararte la guía cuando quieras.
