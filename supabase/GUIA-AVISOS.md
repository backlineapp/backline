# Guía: conciertos fuera de España y avisos al móvil

Esta guía se sigue **una sola vez**, en la web de Supabase (https://supabase.com/dashboard), dentro del proyecto de backline. Los nombres de los menús pueden cambiar un poco con el tiempo. Si alguno no coincide, busca el más parecido.

Tiene cuatro partes, y **el orden importa**:

- **A. Antes de aceptar la petición (pull request):** preparar la base de datos (pasos 1 a 3).
- **B. Aceptar la petición** en GitHub (paso 4).
- **C. Después:** claves, secretos y función de envío (pasos 5 a 8).
- **D. Probarlo** (paso 9).

> **La clave privada de los avisos nunca va al repositorio, ni a un correo, ni a un chat.** Solo se pega en los secretos de Supabase (paso 6).

---

## A. Antes de aceptar la petición

### Paso 1. Conciertos fuera de España

La app nueva pide a la base de datos el campo "País". Si aceptas la petición antes de hacer este paso, la pestaña Conciertos dejará de cargar hasta que lo hagas.

1. Menú de la izquierda: **SQL Editor** → **New query**.
2. Abre el archivo `supabase/3-paises.sql`, copia **todo** y pégalo.
3. Pulsa **Run**.
4. Abajo deben salir las fechas que ya tenías fuera de España (Francia, Portugal, Reino Unido), ya con su país en la columna `pais` y la provincia vacía. En `zona` verás `Europe/Lisbon` para Portugal y `Europe/London` para Reino Unido, que son una hora menos que Madrid. Francia va con `Europe/Madrid`, que es la misma hora que aquí.

La hora que escribiste en cada fecha no cambia, porque es la del cartel. Solo se apunta de qué país es.

### Paso 2. Activar las tareas programadas

1. Menú izquierdo: **Database** → **Extensions**.
2. Busca **pg_cron** y actívalo con el interruptor. Si te pregunta un "schema", deja el que venga.
3. Busca **pg_net** y actívalo igual.

Sirven para que Supabase compruebe cada 5 minutos si hay avisos que enviar. Si ya estaban activadas, no hace falta tocar nada.

### Paso 3. Crear lo necesario para los avisos

1. **SQL Editor** → **New query**.
2. Abre `supabase/4-avisos.sql`, copia **todo**, pégalo y pulsa **Run**.
3. Debe salir una fila con el número **1**: es la tarea programada recién creada. Si sale algún aviso en amarillo, no pasa nada.

Esto crea:

- **La lista de móviles con avisos.** De cada móvil solo se guarda su dirección de avisos y los grupos que sigue. Nada de correo ni de nombre, y nadie puede leerla desde la app.
- **La lista de espera.** Cada concierto o gira que publiques **a partir de ahora** entra en ella sola. Lo que ya estaba publicado (por ejemplo, la gira de El Altar del Holocausto) **no avisa**, y editar algo ya publicado tampoco vuelve a avisar.
- **Las reglas para no agobiar:**
  - Se esperan 10 minutos desde que publicas.
  - Una gira genera un solo aviso, y como mucho sale un aviso por grupo y día.
  - Entre las 23:00 y las 9:00 no se envía nada: lo de la noche sale a las 9:00, hora de Madrid.
- **La tarea programada**, que mira cada 5 minutos si hay algo listo.

Como tu proyecto tiene desactivado "Automatically expose new tables", el archivo ya incluye los permisos uno a uno. La app solo puede hacer tres cosas: apuntar su móvil, cambiar su lista y borrarse. No puede leer nada.

Se puede volver a ejecutar sin miedo: no borra móviles ni avisos.

---

## B. Aceptar la petición

### Paso 4. Publicar la versión nueva

1. En GitHub, abre la petición (pull request) y pulsa **Merge pull request** → **Confirm merge**, como las otras veces.
2. Espera 2 o 3 minutos a que se publique.
3. Abre la app en el móvil. Se actualizará sola. En **Mis grupos** verás arriba el recuadro de los avisos. **Todavía no lo actives**: falta la parte C.

---

## C. Claves y función de envío

### Paso 5. Crear las claves

1. En el ordenador, abre esta página:

   ```
   https://backlineapp.github.io/backline/supabase/claves-avisos.html
   ```

2. Pulsa **Crear claves**. Las claves se crean dentro de tu navegador, sin enviar nada a ningún sitio.
3. **No cierres la página** hasta terminar el paso 6. Si la cierras, las claves se pierden y tendrías que crearlas otra vez y repetir los pasos 5 y 6 enteros.

**Créalas una sola vez.** Si un día se cambian, todos los móviles tendrán que volver a activar los avisos.

### Paso 6. Guardar las claves en Supabase

**6a. La caja fuerte (Vault):**

1. **SQL Editor** → **New query**.
2. En la página de las claves, pulsa **Copiar** en el bloque **1 · Para el SQL Editor**.
3. Pégalo y pulsa **Run**. Debe salir un código largo (o "Success"). Así se guardan la clave pública y la clave de las tareas.

**6b. Los secretos de las funciones:**

1. Menú izquierdo: **Edge Functions** → **Secrets**. En algunas versiones está en **Project Settings → Edge Functions**.
2. Añade estos tres secretos. En "Name" va el nombre exacto; en "Value", lo que copies de la página de las claves:
   - `VAPID_PUBLICA`
   - `VAPID_PRIVADA` (la clave privada: **solo aquí**)
   - `CLAVE_TAREAS`
3. Pulsa **Save**.

Ya puedes cerrar la página de las claves.

### Paso 7. Crear la función que envía los avisos

1. Menú izquierdo: **Edge Functions** → **Functions** → **Deploy a new function** → **Via Editor**.
2. Como nombre, escribe exactamente:

   ```
   enviar-avisos
   ```

3. Borra el código de ejemplo que aparece en el editor.
4. Abre el archivo `supabase/functions/enviar-avisos/index.ts` del repositorio, copia **todo** y pégalo en el editor.
5. Pulsa **Deploy function**. Espera a que diga que está desplegada.

### Paso 8. Que solo la llame la tarea programada

La función no usa el sistema normal de cuentas de Supabase. Se protege con su propia clave (`CLAVE_TAREAS`), así que hay que quitar la comprobación normal. Si no se quita, la tarea programada no podría llamarla.

1. Entra en la función **enviar-avisos** y busca la pestaña **Details** (o **Settings**).
2. Busca la opción **Enforce JWT verification** (también puede llamarse **Verify JWT**) y **desactívala**.
3. Pulsa **Save**.

Aunque alguien encontrara la dirección de la función, sin `CLAVE_TAREAS` recibe un "no autorizado". Y aunque la tuviera, solo podría enviar lo que ya está en la lista de espera, con las mismas reglas.

---

## D. Probarlo

### Paso 9. Prueba completa

Hazla **entre las 9:00 y las 22:30**: de noche no sale nada, a propósito.

1. **En el móvil:**
   - **Android:** abre backline.
   - **iPhone:** tiene que estar instalada en la pantalla de inicio. El propio recuadro de la app explica cómo, en 3 pasos. Ábrela desde el icono.
2. Sigue a un grupo de prueba (por ejemplo, Dry River).
3. Ve a **Mis grupos** → **Activar avisos** → acepta el permiso. Debe poner **Avisos activados**.
4. Desde **Mi panel**, publica un concierto de prueba de ese grupo, con una fecha futura.
5. Espera unos **15 minutos**: los 10 de espera y hasta 5 más para que pase la tarea programada.
6. Te llegará: **"Dry River · Concierto en Castellón, 14 nov"** (con la ciudad y la fecha que hayas puesto). Al tocarlo se abre ese concierto en la app.
7. Borra el concierto de prueba desde **Mi panel**.

**Si no llega:**

- **Integrations** → **Cron** → **Jobs** → `enviar-avisos`: ahí ves si la tarea programada se ejecuta cada 5 minutos.
- **Edge Functions** → **enviar-avisos** → **Logs**:
  - Una línea como `avisos: {"grupos":1,"enviados":1,...}` quiere decir que se envió.
  - Un **401** quiere decir que `CLAVE_TAREAS` no coincide entre el paso 6a y el 6b. Repite los pasos 5 y 6 enteros.
  - Si no aparece nada, revisa el paso 8.
- **Para repetir la prueba el mismo día con el mismo grupo** (normalmente no se puede, por la regla de un aviso al día), ejecuta esto en el SQL Editor y vuelve a publicar:

  ```sql
  delete from public.avisos_grupos;
  ```

---

## Bueno saberlo

- **Qué se guarda de cada móvil:** su dirección de avisos (la da el propio navegador), dos claves para cifrar el aviso y la lista de grupos que sigue sin silenciar. Nada más. Para ver cuántos móviles tienen avisos:

  ```sql
  select count(*) from public.suscripciones;
  ```

- **Móviles que se dan de baja:** si alguien desactiva los avisos desde los ajustes del móvil o borra la app, su suscripción se borra sola la próxima vez que se intente avisarle.
- **Campanita:** en cada ficha, la campanita silencia ese grupo sin dejar de seguirlo. Se guarda en el móvil y se avisa a Supabase al momento.
- **iPhone:** necesita iOS 16.4 o posterior y la app instalada en la pantalla de inicio. Al instalarla, el iPhone puede empezar con la lista de grupos vacía (Safari y la app instalada no comparten memoria). Lo arreglarán las cuentas.
- **Plan gratuito:** todo cabe de sobra. La tarea programada solo llama a la función cuando hay algo que enviar, y el plan gratuito permite 500.000 llamadas al mes.
- **Conciertos fuera de España:** en el formulario, el campo **País** viene con "España". Si escribes otro país, la provincia desaparece. Portugal, Reino Unido e Irlanda van con una hora menos que Madrid; Grecia y Finlandia, con una más; el resto de Europa, con la de Madrid. La app lo indica en la ficha del concierto, por ejemplo "21:00 (hora de Portugal)".
