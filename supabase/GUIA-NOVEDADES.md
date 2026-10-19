# Guía: discos, vídeos y noticias (y "Dirección" en los conciertos)

Esta guía se sigue **una sola vez**, en la web de Supabase (https://supabase.com/dashboard), dentro del proyecto de backline. Los nombres de los menús pueden cambiar un poco con el tiempo. Si alguno no coincide, busca el más parecido.

Son tres partes, y **el orden importa**:

- **A. Antes de aceptar la petición (pull request):** preparar la base de datos (paso 1).
- **B. Aceptar la petición** en GitHub (paso 2).
- **C. Actualizar la función de los avisos** y probarlo (pasos 3 y 4).

---

## A. Antes de aceptar la petición

### Paso 1. Preparar la base de datos

La app nueva pide a la base de datos unos datos que aún no existen (si es disco o single, la fecha de salida y la dirección de la sala). Si aceptas la petición antes de hacer este paso, el panel y los conciertos dejarán de cargar hasta que lo hagas.

1. Menú de la izquierda: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/6-novedades.sql` del repositorio, copia **todo** y pégalo en el cuadro grande.
3. Pulsa **Run** (abajo a la derecha).
4. Abajo deben salir **3 filas**: `direccion` (de `fechas`), y `formato` y `salida` (de `publicaciones`). Si sale algún aviso en amarillo, no pasa nada.

Esto hace cinco cosas:

- **Añade los datos nuevos:** si un disco es disco o single, su fecha de salida y, en cada fecha de concierto, la dirección de la sala (opcional). El título, el texto, el enlace y la imagen ya tenían su sitio.
- **Pone las reglas de cada tipo**, que comprueba la propia base de datos aunque alguien se saltara la app:
  - Disco o single: título, disco o single, fecha de salida y enlace. Texto de 300 caracteres como mucho.
  - Vídeo: título y enlace de YouTube o Vimeo. Texto de 300 caracteres como mucho.
  - Noticia: título y texto, de 1.000 caracteres como mucho. La imagen y el enlace son opcionales.
- **Bloquea los enlaces a redes sociales** (Facebook, Instagram, X, TikTok, Threads y otras), en todo lo que se publique y en las entradas de los conciertos. Lo que ya estaba publicado no se toca.
- **Amplía los avisos:** los discos, vídeos y noticias también avisan a quien sigue al grupo, con las mismas reglas de siempre (10 minutos de espera, como mucho un aviso por grupo y día, nada entre las 23:00 y las 9:00, y editar no vuelve a avisar).
- **Pone los permisos uno a uno**, porque tu proyecto tiene desactivado "Automatically expose new tables".

**Los permisos para publicar no cambian:** tú, en cualquier grupo; cada miembro aprobado, solo en el suyo. Las portadas y las imágenes de las noticias van a la misma carpeta que los carteles (`carteles`) y con la misma regla, así que en **Storage** no hay que tocar nada.

Se puede volver a ejecutar sin miedo: no borra nada.

> Si algún día vuelves a ejecutar `4-avisos.sql`, ejecuta después `6-novedades.sql` otra vez. Si no, los discos, vídeos y noticias dejarían de avisar.

---

## B. Aceptar la petición

### Paso 2. Publicar la versión nueva de la app

1. En GitHub, abre la petición (pull request) de este cambio.
2. Pulsa **Merge pull request** y después **Confirm merge**.
3. Espera un par de minutos. La app se actualiza sola a la **versión 10** la próxima vez que la abras. Si no la ves cambiada, ciérrala del todo y vuelve a abrirla.

---

## C. Actualizar la función de los avisos y probarlo

### Paso 3. Volver a subir la función "enviar-avisos"

La función que manda los avisos tiene que aprender a escribir los textos nuevos ("Nuevo disco: …", "Nuevo vídeo: …"). Es copiar y pegar, igual que cuando la creaste:

1. Menú de la izquierda: **Edge Functions** → **Functions** → entra en **enviar-avisos**.
2. Abre la pestaña **Code** (el editor).
3. Borra todo el código que hay en el editor.
4. Abre el archivo `supabase/functions/enviar-avisos/index.ts` del repositorio, copia **todo** y pégalo en el editor.
5. Pulsa **Deploy** (o **Deploy updates**). Espera a que diga que está desplegada.

**No hay que tocar nada más:** los secretos (`VAPID_PUBLICA`, `VAPID_PRIVADA`, `CLAVE_TAREAS`) siguen igual. Comprueba solo que en **Details** (o **Settings**) la opción **Enforce JWT verification** sigue **desactivada**, como la dejaste.

Si te saltas este paso no se rompe nada: los avisos de conciertos y giras siguen saliendo igual que hoy. Pero los de discos, vídeos y noticias llegarían con un texto equivocado.

### Paso 4. Prueba completa

Hazla **entre las 9:00 y las 22:30**, porque de noche no sale nada a propósito. Usa un grupo que sigas en el móvil con los avisos activados y del que **hoy no te haya llegado ningún aviso** (solo sale uno por grupo y día).

1. **Mi panel** → **Publicar** → **Noticia**. Elige el grupo y escribe un título y un texto cortos.
2. En el enlace, pega uno de Instagram. La app debe ponerlo en rojo y **no dejar publicar**. Bórralo (el enlace es opcional) y pulsa **Publicar**.
3. Abre **Inicio**: la noticia sale arriba del todo. Tócala y se verá completa dentro de la app.
4. Espera unos **15 minutos** y llegará el aviso, con el título de la noticia: **"Dry River · Entramos a grabar"**. Al tocarlo se abre la noticia.
5. Prueba también un **vídeo** (pega un enlace de YouTube: la miniatura sale sola) y un **disco** (portada desde la galería y enlace de Bandcamp o Spotify).
6. Borra lo que hayas publicado de prueba desde **Mi panel**.

**Para repetir la prueba el mismo día con el mismo grupo**, ejecuta esto en el SQL Editor y vuelve a publicar:

```sql
delete from public.avisos_grupos;
```

**Si no llega el aviso**, mira **Edge Functions** → **enviar-avisos** → **Logs**, como en la guía de los avisos (`GUIA-AVISOS.md`, paso 9).

---

## Bueno saberlo

- **Qué se puede publicar desde Mi panel:**
  - **Disco o single:** título, si es disco o single, fecha de salida (viene con la de hoy), portada desde la galería, enlace donde escucharlo y un texto corto opcional.
  - **Vídeo:** título, enlace de YouTube o Vimeo y un texto corto opcional.
  - **Noticia:** título, texto de hasta 1.000 caracteres (con contador), imagen opcional y enlace opcional.
  - Si se pega un enlace sin el `https://` delante (por ejemplo, `grupo.bandcamp.com/album/x`), la app se lo pone sola.
- **Dónde se ve:**
  - **Inicio:** todo junto, con lo más reciente arriba: los discos de Bandcamp y lo publicado en Backline.
  - **Ficha del grupo:** un apartado **Novedades** con los vídeos y las noticias. Los discos publicados entran en **Discos** o **Singles**, junto a los de Bandcamp.
- **Sin duplicados:** si se publica un disco con el mismo enlace que uno que ya está en la discografía de Bandcamp, sale una sola vez: el publicado, que tiene la fecha exacta y el texto.
- **Orden en Inicio:** de los discos de Bandcamp solo sabemos el año. Por eso, dentro de un mismo año, lo publicado en Backline sale por delante.
- **Vídeos:** los de YouTube se ven dentro de la app con el reproductor **sin cookies** (youtube-nocookie.com). Los de Vimeo, con su reproductor sin seguimiento. Los de Vimeo salen en las listas con una tarjeta con el título, porque Vimeo no da la miniatura sin pedírsela a su servidor.
- **Cómo llegar:** ahora abre el mapa con la sala como **destino** (la ruta desde donde estés), tanto en Apple Maps (iPhone) como en Google Maps (el resto), con el texto completo: dirección, sala, ciudad, provincia y país. En el formulario de concierto y en cada fecha de gira hay un campo nuevo, **Dirección (opcional)**: con la calle y el número, el mapa acierta siempre. La dirección también va en **Añadir al calendario** y se ve en la pantalla del concierto.
- **Plan gratuito:** sigue cabiendo de sobra. Cada imagen se reduce en el móvil antes de subirla (unos 200-400 KB).
