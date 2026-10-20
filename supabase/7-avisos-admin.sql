-- backline — avisos al móvil del administrador cuando llega una solicitud.
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4-avisos.sql, 5-miembros.sql y
-- 6-novedades.sql. Se puede volver a ejecutar sin miedo: no borra nada.
-- (Si un día se vuelve a ejecutar 4-avisos.sql, hay que ejecutar después
-- 6-novedades.sql y este archivo otra vez.)
-- Los pasos completos están en supabase/GUIA-AVISOS-ADMIN.md.
--
-- Qué hace:
--   · Marca como "del administrador" el móvil que activa los avisos con la
--     sesión del administrador iniciada. Si en ese móvil se cierra la sesión,
--     deja de estar marcado la próxima vez que la app repase sus avisos.
--   · avisos_solicitudes -> lista de espera: cada solicitud nueva (gestionar o
--                           retirar una ficha) entra aquí sola.
--   · avisos_preparar_admin -> la usa la función "enviar-avisos" para mandar
--                           al administrador "Backline · [Grupo] quiere
--                           gestionar su ficha" o "… pide retirar su ficha".
--
-- Reglas de estos avisos (distintas de las de los grupos):
--   · Sin espera de 10 minutos y sin límite de uno al día: uno por solicitud.
--   · Nada entre las 23:00 y las 9:00 (hora de Madrid): lo de la noche sale
--     a las 9:00.
--   · Si la solicitud ya se ha resuelto antes de avisar, no se avisa.
--   · Las solicitudes que ya existían antes de ejecutar este archivo nunca
--     avisan.

-- ---------------------------------------------------------------------------
-- 1. Móvil del administrador
-- ---------------------------------------------------------------------------

alter table public.suscripciones
  add column if not exists admin boolean not null default false;

create index if not exists suscripciones_admin on public.suscripciones (admin) where admin;

-- Igual que en 4-avisos.sql y, además, apunta si el móvil es del
-- administrador. Eso lo decide la base de datos con la sesión que trae la
-- petición (es_admin), nunca la app: nadie puede marcarse a sí mismo.
create or replace function public.avisos_apuntar(
  p_endpoint text, p_p256dh text, p_auth text, p_grupos text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limpios text[];
  soy_admin boolean := public.es_admin();
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

  insert into public.suscripciones (endpoint, p256dh, auth, grupos, admin)
  values (p_endpoint, p_p256dh, p_auth, limpios, soy_admin)
  on conflict (endpoint) do update
    set grupos = excluded.grupos, admin = excluded.admin, actualizado = now()
    where public.suscripciones.auth = excluded.auth
      and public.suscripciones.p256dh = excluded.p256dh;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lista de espera de solicitudes
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_solicitudes (
  -- Si se borra la solicitud, se borra de la lista de espera.
  solicitud_id uuid primary key references public.solicitudes (id) on delete cascade,
  creado timestamptz not null default now(),
  -- Cuándo se envió (o se descartó). Vacío = pendiente.
  enviado timestamptz
);

-- Reglas de seguridad activadas y SIN ninguna regla que deje entrar: desde la
-- app nadie puede leerla ni tocarla.
alter table public.avisos_solicitudes enable row level security;

-- Al crear una solicitud, entra en la lista de espera.
create or replace function public.avisos_al_solicitar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.avisos_solicitudes (solicitud_id) values (new.id)
  on conflict (solicitud_id) do nothing;
  return new;
end;
$$;

drop trigger if exists avisos_al_solicitar on public.solicitudes;
create trigger avisos_al_solicitar
  after insert on public.solicitudes
  for each row execute function public.avisos_al_solicitar();

-- ---------------------------------------------------------------------------
-- 3. Órdenes del sistema (solo la función "enviar-avisos")
-- ---------------------------------------------------------------------------

-- ¿Hay algo que enviar? Lo de los grupos (igual que en 4-avisos.sql: más de
-- 10 minutos y grupos de los que hoy aún no se ha avisado) o cualquier
-- solicitud pendiente de avisar (sin espera).
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
  ) or exists (
    select 1 from public.avisos_solicitudes where enviado is null
  );
$$;

-- Prepara los avisos de solicitudes y los marca como enviados.
-- Devuelve { solicitudes: [{id, grupo_id, tipo}], suscripciones: [...] }
-- con los móviles del administrador. Nunca lleva nombres, correos ni
-- mensajes de quien pide: eso solo se ve en Mi panel.
create or replace function public.avisos_preparar_admin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  vacio jsonb := jsonb_build_object('solicitudes', '[]'::jsonb, 'suscripciones', '[]'::jsonb);
  ids uuid[];
  sols jsonb;
  subs jsonb;
begin
  -- Nada entre las 23:00 y las 9:00 (hora de Madrid).
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return vacio;
  end if;

  -- Si ya hay otra preparación en marcha, esta no hace nada (nunca se
  -- envía dos veces lo mismo).
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos-admin')) then
    return vacio;
  end if;

  -- Limpieza: lo enviado hace más de 30 días ya no hace falta.
  delete from public.avisos_solicitudes where enviado < now() - interval '30 days';

  select array_agg(solicitud_id) into ids
  from public.avisos_solicitudes
  where enviado is null;

  if ids is null then
    return vacio;
  end if;

  -- Solo las que siguen pendientes (si ya se resolvió, no hace falta avisar).
  select jsonb_agg(jsonb_build_object('id', s.id, 'grupo_id', s.grupo_id, 'tipo', s.tipo) order by s.creado)
  into sols
  from public.solicitudes s
  where s.id = any (ids) and s.estado = 'pendiente';

  update public.avisos_solicitudes set enviado = now()
  where solicitud_id = any (ids) and enviado is null;

  select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth))
  into subs
  from public.suscripciones x
  where x.admin;

  -- Sin móviles del administrador no se envía nada (el número del panel
  -- sigue avisando al abrir la app).
  if sols is null or subs is null then
    return vacio;
  end if;

  return jsonb_build_object('solicitudes', sols, 'suscripciones', subs);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------

-- Tablas: ningún permiso para la app. Solo se usan a través de las órdenes.
revoke all on public.suscripciones from anon, authenticated;
revoke all on public.avisos_solicitudes from anon, authenticated;

-- Por defecto cualquiera puede ejecutar una función nueva: se quita a todos
-- y se da solo a quien la necesita.
revoke all on function public.avisos_apuntar(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.avisos_al_solicitar() from public, anon, authenticated;
revoke all on function public.avisos_hay_listos() from public, anon, authenticated;
revoke all on function public.avisos_preparar_admin() from public, anon, authenticated;

-- La app (con o sin cuenta): apuntarse. Usa es_admin para saber si es el
-- administrador.
grant execute on function public.avisos_apuntar(text, text, text, text[]) to anon, authenticated;
grant execute on function public.es_admin() to anon, authenticated;

-- El sistema (la función "enviar-avisos"): preparar los avisos de solicitudes.
grant execute on function public.avisos_preparar_admin() to service_role;

-- Comprobación: deben salir 2 filas, el campo "admin" de suscripciones y la
-- lista de espera "avisos_solicitudes".
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'suscripciones' and column_name = 'admin')
    or (table_name = 'avisos_solicitudes' and column_name = 'solicitud_id'));
