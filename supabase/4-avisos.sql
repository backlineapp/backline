-- backline — avisos al móvil (notificaciones).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin miedo: no borra suscripciones ni avisos.
-- Los pasos completos están en supabase/GUIA-AVISOS.md.
--
-- Qué crea:
--   · suscripciones      -> cada móvil con avisos: su "dirección de avisos",
--                           sus claves y la lista de grupos que sigue sin
--                           silenciar. Nada de correo ni nombre. NADIE puede
--                           leerla desde la app.
--   · avisos_pendientes  -> lista de espera: cada concierto o gira que se
--                           publica por PRIMERA vez entra aquí solo.
--                           Editarlo después no lo vuelve a meter.
--   · avisos_grupos      -> qué día se avisó por última vez de cada grupo
--                           (máximo un aviso por grupo y día).
--   · Órdenes (funciones) para apuntarse y borrarse desde la app, y para que
--     el sistema prepare y envíe los avisos.
--   · Tarea programada: cada 5 minutos mira si hay algo que enviar y, si lo
--     hay, llama a la función "enviar-avisos".
--
-- Reglas para no agobiar (todas aquí, en preparar_avisos):
--   · Se espera 10 minutos desde que se publica (para poder añadir fechas o
--     corregir algo). Si se borra antes, no se avisa.
--   · Una gira = un solo aviso.
--   · Como máximo un aviso por grupo y día. Si un grupo publica varias cosas
--     a la vez, van juntas en el mismo aviso.
--   · Nada entre las 23:00 y las 9:00 (hora de Madrid): lo de la noche sale
--     a las 9:00.
--   · Lo que ya estaba publicado antes de ejecutar este archivo nunca avisa.

-- ---------------------------------------------------------------------------
-- Extensiones: tareas programadas (pg_cron) y llamadas a internet (pg_net)
-- ---------------------------------------------------------------------------
-- (Si ya estaban activadas desde el panel, estas líneas no hacen nada.)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Suscripciones (cada móvil con avisos)
-- ---------------------------------------------------------------------------

create table if not exists public.suscripciones (
  -- Dirección de avisos que da el navegador del móvil (Google, Apple, Mozilla...).
  endpoint text primary key check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  -- Claves del móvil para cifrar el aviso (solo ese móvil puede leerlo).
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  -- Grupos que sigue sin silenciar (identificadores de grupos.json).
  grupos text[] not null default '{}',
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists suscripciones_grupos on public.suscripciones using gin (grupos);

-- Reglas de seguridad activadas y SIN ninguna regla que deje entrar: desde la
-- app nadie puede leer, cambiar ni borrar filas directamente. Solo a través
-- de las órdenes de abajo, que comprueban que cada móvil es quien dice ser.
alter table public.suscripciones enable row level security;

-- ---------------------------------------------------------------------------
-- Lista de espera de avisos
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_pendientes (
  -- Si se borra la publicación, se borra de la lista de espera.
  publicacion_id uuid primary key references public.publicaciones (id) on delete cascade,
  creado timestamptz not null default now(),
  -- Cuándo se envió (o se descartó). Vacío = pendiente.
  enviado timestamptz
);

alter table public.avisos_pendientes enable row level security;

create table if not exists public.avisos_grupos (
  grupo_id text primary key,
  -- Último día (de Madrid) en que se avisó de este grupo.
  ultimo_dia date not null
);

alter table public.avisos_grupos enable row level security;

-- Al publicar algo POR PRIMERA VEZ (solo al crear, no al editar), entra en la
-- lista de espera.
create or replace function public.avisos_al_publicar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo in ('concierto', 'gira') then
    insert into public.avisos_pendientes (publicacion_id) values (new.id)
    on conflict (publicacion_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_al_publicar on public.publicaciones;
create trigger avisos_al_publicar
  after insert on public.publicaciones
  for each row execute function public.avisos_al_publicar();

-- ---------------------------------------------------------------------------
-- Órdenes para la app (cualquier móvil, sin cuenta)
-- ---------------------------------------------------------------------------

-- Clave PÚBLICA de los avisos (se guarda en la caja fuerte de Supabase, ver guía).
create or replace function public.avisos_clave_publica()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'avisos_clave_publica'
  limit 1;
$$;

-- Apunta un móvil o le cambia la lista de grupos. Si el móvil ya estaba
-- apuntado, solo se cambia si trae su misma clave "auth" (que solo conoce
-- ese móvil): así nadie puede tocar la lista de otro.
create or replace function public.avisos_apuntar(
  p_endpoint text, p_p256dh text, p_auth text, p_grupos text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limpios text[];
begin
  -- Solo direcciones de los servicios de avisos de los navegadores.
  if p_endpoint is null or char_length(p_endpoint) > 1000 or p_endpoint !~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  then
    raise exception 'Dirección de avisos no válida';
  end if;
  if coalesce(cardinality(p_grupos), 0) > 500 then
    raise exception 'Demasiados grupos';
  end if;

  select coalesce(array_agg(distinct g), '{}') into limpios
  from unnest(coalesce(p_grupos, '{}')) as g
  where g ~ '^[a-z0-9-]{1,80}$';

  insert into public.suscripciones (endpoint, p256dh, auth, grupos)
  values (p_endpoint, p_p256dh, p_auth, limpios)
  on conflict (endpoint) do update
    set grupos = excluded.grupos, actualizado = now()
    where public.suscripciones.auth = excluded.auth
      and public.suscripciones.p256dh = excluded.p256dh;
  return found;
end;
$$;

-- Borra un móvil de los avisos (también con su clave "auth").
create or replace function public.avisos_borrar(p_endpoint text, p_auth text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.suscripciones where endpoint = p_endpoint and auth = p_auth;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Órdenes del sistema (solo la función "enviar-avisos" con la clave secreta)
-- ---------------------------------------------------------------------------

-- Condición común: avisos ya listos para enviar (pendientes, con más de 10
-- minutos y de grupos de los que hoy aún no se ha avisado).
create or replace function public.avisos_hay_listos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.avisos_pendientes a
    join public.publicaciones p on p.id = a.publicacion_id
    where a.enviado is null
      and a.creado <= now() - interval '10 minutes'
      and not exists (
        select 1 from public.avisos_grupos ag
        where ag.grupo_id = p.grupo_id
          and ag.ultimo_dia >= (now() at time zone 'Europe/Madrid')::date
      )
  );
$$;

-- Prepara los avisos que tocan ahora y los marca como enviados.
-- Devuelve una lista: por cada grupo, sus publicaciones nuevas (con sus
-- fechas próximas) y los móviles que lo siguen.
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
    -- Publicaciones del grupo con sus fechas que aún no han pasado.
    select jsonb_agg(x order by x.creado) into pubs
    from (
      select p.id, p.tipo, p.titulo, p.creado,
        (select jsonb_agg(jsonb_build_object(
            'id', f.id, 'fecha', f.fecha, 'ciudad', f.ciudad, 'pais', f.pais, 'sala', f.sala)
            order by f.fecha, f.hora)
         from public.fechas f
         where f.publicacion_id = p.id and f.fecha >= hoy) as fechas
      from public.publicaciones p
      where p.id = any (g.ids)
    ) x
    where x.fechas is not null;

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

-- Borra los móviles que ya no aceptan avisos (el móvil canceló la suscripción).
create or replace function public.avisos_quitar(p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.suscripciones where endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lo que hace la tarea programada cada 5 minutos: si es de día y hay algo
-- listo, llama a la función "enviar-avisos" con la clave de las tareas.
create or replace function public.avisos_llamar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'Europe/Madrid');
  clave text;
begin
  if hora < 9 or hora >= 23 or not public.avisos_hay_listos() then
    return;
  end if;
  select decrypted_secret into clave from vault.decrypted_secrets
  where name = 'avisos_clave_tareas' limit 1;
  if clave is null then
    raise warning 'backline: falta la clave avisos_clave_tareas en Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://zyvrmiqqqdawskurvuvw.supabase.co/functions/v1/enviar-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave-tareas', clave),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------
-- Tablas: ningún permiso para la app. Solo se usan a través de las órdenes.
revoke all on public.suscripciones from anon, authenticated;
revoke all on public.avisos_pendientes from anon, authenticated;
revoke all on public.avisos_grupos from anon, authenticated;

-- Por defecto cualquiera puede ejecutar una función nueva: se quita a todos
-- y se da solo a quien la necesita.
revoke all on function public.avisos_al_publicar() from public, anon, authenticated;
revoke all on function public.avisos_clave_publica() from public, anon, authenticated;
revoke all on function public.avisos_apuntar(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.avisos_borrar(text, text) from public, anon, authenticated;
revoke all on function public.avisos_hay_listos() from public, anon, authenticated;
revoke all on function public.avisos_preparar() from public, anon, authenticated;
revoke all on function public.avisos_quitar(text[]) from public, anon, authenticated;
revoke all on function public.avisos_llamar() from public, anon, authenticated;

-- La app (con o sin cuenta): leer la clave pública, apuntarse y borrarse.
grant execute on function public.avisos_clave_publica() to anon, authenticated;
grant execute on function public.avisos_apuntar(text, text, text, text[]) to anon, authenticated;
grant execute on function public.avisos_borrar(text, text) to anon, authenticated;

-- El sistema (la función "enviar-avisos"): preparar y limpiar.
grant execute on function public.avisos_preparar() to service_role;
grant execute on function public.avisos_quitar(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Tarea programada: cada 5 minutos
-- ---------------------------------------------------------------------------
-- Si ya existía con este nombre, se actualiza (no se duplica).
select cron.schedule('enviar-avisos', '*/5 * * * *', 'select public.avisos_llamar()');
