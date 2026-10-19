-- backline — discos, vídeos y noticias, y "Dirección" en los conciertos.
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run, ANTES de
-- aceptar la petición de la app nueva (ver supabase/GUIA-NOVEDADES.md).
-- Se puede volver a ejecutar sin miedo: no borra nada de lo que ya exista.
--
-- Qué hace:
--   · publicaciones: dos campos nuevos para los discos ("formato": disco o
--     single; "salida": fecha de salida). El título, el texto, el enlace y la
--     imagen ya existían (la imagen va en "cartel", en la misma carpeta y con
--     la misma regla que los carteles).
--   · Reglas de cada tipo (las comprueba la base de datos, diga lo que diga
--     la app):
--       - disco:   título, disco o single, fecha de salida y enlace.
--                  Texto de 300 caracteres como mucho.
--       - vídeo:   título y enlace de YouTube o Vimeo. Texto de 300 como mucho.
--       - noticia: título y texto (1.000 caracteres como mucho). Imagen y
--                  enlace, opcionales.
--   · Ningún enlace a redes sociales (Facebook, Instagram, X, TikTok...), ni
--     en las publicaciones ni en las entradas de los conciertos.
--   · fechas: campo nuevo "direccion" (calle y número), opcional.
--   · Avisos: los discos, vídeos y noticias también avisan, con las mismas
--     reglas (10 minutos de espera, uno por grupo y día, nada de noche, y
--     editar no vuelve a avisar).
--   · Permisos explícitos (el proyecto no expone nada automáticamente).
--
-- Los permisos para publicar no cambian: el administrador en cualquier grupo
-- y cada miembro aprobado solo en el suyo (función puede_publicar).

-- ---------------------------------------------------------------------------
-- 1. Campos nuevos
-- ---------------------------------------------------------------------------

alter table public.publicaciones add column if not exists formato text;
alter table public.publicaciones add column if not exists salida date;
alter table public.fechas add column if not exists direccion text;

alter table public.publicaciones drop constraint if exists publicaciones_formato_check;
alter table public.publicaciones add constraint publicaciones_formato_check
  check (formato in ('disco', 'single'));

alter table public.fechas drop constraint if exists fechas_direccion_check;
alter table public.fechas add constraint fechas_direccion_check
  check (char_length(direccion) between 1 and 160);

-- ---------------------------------------------------------------------------
-- 2. Lo que necesita cada tipo
-- ---------------------------------------------------------------------------

alter table public.publicaciones drop constraint if exists publicaciones_novedad_completa;
alter table public.publicaciones add constraint publicaciones_novedad_completa check (coalesce(
  case tipo
    when 'disco' then
      char_length(btrim(titulo)) > 0 and formato is not null and salida is not null
      and enlace is not null
    when 'video' then
      char_length(btrim(titulo)) > 0
      and enlace ~* '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|vimeo\.com)/'
    when 'noticia' then
      char_length(btrim(titulo)) > 0 and char_length(btrim(texto)) > 0
    else true
  end, false)
);

alter table public.publicaciones drop constraint if exists publicaciones_texto_corto;
alter table public.publicaciones add constraint publicaciones_texto_corto check (
  case tipo
    when 'noticia' then char_length(texto) <= 1000
    when 'disco' then char_length(texto) <= 300
    when 'video' then char_length(texto) <= 300
    else true
  end
);

-- ---------------------------------------------------------------------------
-- 3. Nada de redes sociales
-- ---------------------------------------------------------------------------
-- Se mira el nombre del sitio del enlace (lo que va entre "https://" y la
-- primera "/"). La misma lista está en app.js (REDES_SOCIALES): si se cambia
-- aquí, cambiarla allí.

alter table public.publicaciones drop constraint if exists publicaciones_enlace_sin_redes;
alter table public.publicaciones add constraint publicaciones_enlace_sin_redes check (
  enlace is null or coalesce(lower(substring(enlace from '^[A-Za-z]+://(?:[^/?#@]*@)?([^/?#:]+)')), '')
    !~ '(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|instagram\.com|instagr\.am|x\.com|twitter\.com|t\.co|tiktok\.com|threads\.net|threads\.com|snapchat\.com|bsky\.app|linkedin\.com|pinterest\.com|vk\.com)$'
);

-- En las entradas de los conciertos ya lo impedía la app. "not valid": solo
-- se comprueba en lo que se publique o edite a partir de ahora.
alter table public.fechas drop constraint if exists fechas_entradas_sin_redes;
alter table public.fechas add constraint fechas_entradas_sin_redes check (
  entradas is null or coalesce(lower(substring(entradas from '^[A-Za-z]+://(?:[^/?#@]*@)?([^/?#:]+)')), '')
    !~ '(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|instagram\.com|instagr\.am|x\.com|twitter\.com|t\.co|tiktok\.com|threads\.net|threads\.com|snapchat\.com|bsky\.app|linkedin\.com|pinterest\.com|vk\.com)$'
) not valid;

-- ---------------------------------------------------------------------------
-- 4. Avisos: también para discos, vídeos y noticias
-- ---------------------------------------------------------------------------
-- (Sustituye a las mismas órdenes de 4-avisos.sql. Si algún día se vuelve a
-- ejecutar 4-avisos.sql, hay que ejecutar después este archivo otra vez.)

-- Al publicar algo POR PRIMERA VEZ (solo al crear, no al editar), entra en la
-- lista de espera.
create or replace function public.avisos_al_publicar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo in ('concierto', 'gira', 'disco', 'video', 'noticia') then
    insert into public.avisos_pendientes (publicacion_id) values (new.id)
    on conflict (publicacion_id) do nothing;
  end if;
  return new;
end;
$$;

-- Prepara los avisos que tocan ahora y los marca como enviados. Igual que
-- antes, y además: los discos, vídeos y noticias avisan siempre (no tienen
-- fechas que puedan haber pasado). Lleva el principio del texto, para que el
-- aviso de una noticia diga de qué va.
create or replace function public.avisos_preparar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  resultado jsonb := '[]'::jsonb;
  g record;
  pubs jsonb;
  subs jsonb;
begin
  -- Nada entre las 23:00 y las 9:00 (hora de Madrid).
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return resultado;
  end if;

  -- Si ya hay otra preparación en marcha, esta no hace nada (nunca se
  -- envía dos veces lo mismo).
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos')) then
    return resultado;
  end if;

  -- Limpieza: lo enviado hace más de 30 días ya no hace falta.
  delete from public.avisos_pendientes where enviado < now() - interval '30 days';

  for g in
    select p.grupo_id, array_agg(p.id) as ids
    from public.avisos_pendientes a
    join public.publicaciones p on p.id = a.publicacion_id
    where a.enviado is null
      and a.creado <= now() - interval '10 minutes'
      and not exists (
        select 1 from public.avisos_grupos ag
        where ag.grupo_id = p.grupo_id and ag.ultimo_dia >= hoy
      )
    group by p.grupo_id
  loop
    -- Publicaciones del grupo: conciertos y giras con sus fechas que aún no
    -- han pasado; discos, vídeos y noticias, siempre.
    select jsonb_agg(x order by x.creado) into pubs
    from (
      select p.id, p.tipo, p.titulo, p.formato, p.salida, p.creado,
        left(p.texto, 140) as texto,
        (select jsonb_agg(jsonb_build_object(
            'id', f.id, 'fecha', f.fecha, 'ciudad', f.ciudad, 'pais', f.pais, 'sala', f.sala)
            order by f.fecha, f.hora)
         from public.fechas f
         where f.publicacion_id = p.id and f.fecha >= hoy) as fechas
      from public.publicaciones p
      where p.id = any (g.ids)
    ) x
    where x.tipo in ('disco', 'video', 'noticia') or x.fechas is not null;

    update public.avisos_pendientes set enviado = now()
    where publicacion_id = any (g.ids) and enviado is null;

    -- Si todo era de fechas ya pasadas, no se avisa (ni cuenta para hoy).
    continue when pubs is null;

    insert into public.avisos_grupos (grupo_id, ultimo_dia) values (g.grupo_id, hoy)
    on conflict (grupo_id) do update set ultimo_dia = excluded.ultimo_dia;

    select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    into subs
    from public.suscripciones s
    where s.grupos @> array[g.grupo_id];

    continue when subs is null;

    resultado := resultado || jsonb_build_array(jsonb_build_object(
      'grupo_id', g.grupo_id, 'publicaciones', pubs, 'suscripciones', subs));
  end loop;

  return resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------
-- Las tablas son las mismas de antes; los campos nuevos quedan cubiertos por
-- estos permisos. Se repiten aquí para que no dependa de nada más.
-- Lo que cada cuenta puede ver o cambiar lo siguen decidiendo las reglas de
-- seguridad de 1-base-de-datos.sql (puede_publicar).

grant select on public.publicaciones to anon, authenticated;
grant insert, update, delete on public.publicaciones to authenticated;

grant select on public.fechas to anon, authenticated;
grant insert, update, delete on public.fechas to authenticated;

grant execute on function public.es_admin() to anon, authenticated;
grant execute on function public.puede_publicar(text) to anon, authenticated;

-- Las órdenes de los avisos: nadie desde la app; preparar, solo el sistema.
revoke all on function public.avisos_al_publicar() from public, anon, authenticated;
revoke all on function public.avisos_preparar() from public, anon, authenticated;
grant execute on function public.avisos_preparar() to service_role;

-- Comprobación: deben salir los dos campos nuevos de publicaciones y el de fechas.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'publicaciones' and column_name in ('formato', 'salida'))
    or (table_name = 'fechas' and column_name = 'direccion'))
order by table_name, column_name;
