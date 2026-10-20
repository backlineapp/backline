-- backline — aviso al móvil del grupo cuando se aprueba su solicitud.
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4-avisos.sql, 5-miembros.sql,
-- 6-novedades.sql, 7-avisos-admin.sql y 8-arreglo-avisos-admin.sql.
-- Se puede volver a ejecutar sin miedo: no borra nada.
-- (Si un día se vuelve a ejecutar 4-avisos.sql o 7-avisos-admin.sql, hay que
-- ejecutar después este archivo otra vez.)
--
-- Qué hace:
--   · Apunta a qué cuenta pertenece cada móvil con avisos, si tiene la sesión
--     iniciada. Lo decide la base de datos con la sesión que trae la
--     petición, nunca la app. Nadie puede leerlo desde la app.
--   · avisos_aprobaciones -> lista de espera: cada solicitud de "gestionar la
--                            ficha" que se aprueba entra aquí sola.
--   · avisos_preparar_aprobaciones -> la usa la función "enviar-avisos" para
--                            mandar a esa persona "Backline · Ya gestionáis
--                            la ficha de [Grupo]".
--
-- Reglas de estos avisos:
--   · Uno por aprobación, sin espera.
--   · Nada entre las 23:00 y las 9:00 (hora de Madrid): lo de la noche sale
--     a las 9:00.
--   · Solo llega a los móviles donde esa persona tiene los avisos activados
--     y la sesión iniciada. Si no tiene ninguno, no se avisa (lo verá al
--     abrir la app).
--   · Las aprobaciones anteriores a este archivo nunca avisan.

-- ---------------------------------------------------------------------------
-- 1. De quién es cada móvil
-- ---------------------------------------------------------------------------

alter table public.suscripciones
  add column if not exists usuario uuid references auth.users (id) on delete set null;

create index if not exists suscripciones_usuario on public.suscripciones (usuario) where usuario is not null;

-- Igual que en 7-avisos-admin.sql y, además, apunta la cuenta con la sesión
-- iniciada (o nada, si no hay sesión).
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
  yo uuid := (select auth.uid());
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

  insert into public.suscripciones (endpoint, p256dh, auth, grupos, admin, usuario)
  values (p_endpoint, p_p256dh, p_auth, limpios, soy_admin, yo)
  on conflict (endpoint) do update
    set grupos = excluded.grupos, admin = excluded.admin, usuario = excluded.usuario, actualizado = now()
    where public.suscripciones.auth = excluded.auth
      and public.suscripciones.p256dh = excluded.p256dh;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lista de espera de aprobaciones
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_aprobaciones (
  -- Si se borra la solicitud, se borra de la lista de espera.
  solicitud_id uuid primary key references public.solicitudes (id) on delete cascade,
  creado timestamptz not null default now(),
  -- Cuándo se envió (o se descartó). Vacío = pendiente.
  enviado timestamptz
);

-- Reglas de seguridad activadas y SIN ninguna regla que deje entrar: desde la
-- app nadie puede leerla ni tocarla.
alter table public.avisos_aprobaciones enable row level security;

-- Cuando una solicitud de "gestionar" pasa de pendiente a aprobada, entra en
-- la lista de espera. (Rechazar o "retirar la ficha" no avisan.)
create or replace function public.avisos_al_aprobar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'gestionar' and new.estado = 'aprobada' and old.estado = 'pendiente' then
    insert into public.avisos_aprobaciones (solicitud_id) values (new.id)
    on conflict (solicitud_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists avisos_al_aprobar on public.solicitudes;
create trigger avisos_al_aprobar
  after update of estado on public.solicitudes
  for each row execute function public.avisos_al_aprobar();

-- ---------------------------------------------------------------------------
-- 3. Órdenes del sistema (solo la función "enviar-avisos")
-- ---------------------------------------------------------------------------

-- ¿Hay algo que enviar? Igual que en 7-avisos-admin.sql y, además, cualquier
-- aprobación pendiente de avisar.
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
  ) or exists (
    select 1 from public.avisos_aprobaciones where enviado is null
  );
$$;

-- Prepara los avisos de aprobación y los marca como enviados.
-- Devuelve [{ solicitud_id, grupo_id, suscripciones: [...] }], solo con los
-- móviles de la persona aprobada. Nunca lleva nombres ni correos.
create or replace function public.avisos_preparar_aprobaciones()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  ids uuid[];
  lotes jsonb;
begin
  -- Nada entre las 23:00 y las 9:00 (hora de Madrid).
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return '[]'::jsonb;
  end if;

  -- Si ya hay otra preparación en marcha, esta no hace nada (nunca se
  -- envía dos veces lo mismo).
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos-aprobaciones')) then
    return '[]'::jsonb;
  end if;

  -- Limpieza: lo enviado hace más de 30 días ya no hace falta.
  delete from public.avisos_aprobaciones where enviado < now() - interval '30 days';

  select array_agg(solicitud_id) into ids
  from public.avisos_aprobaciones
  where enviado is null;

  if ids is null then
    return '[]'::jsonb;
  end if;

  -- Cada aprobación, con los móviles de esa persona. Si no tiene ninguno, no
  -- sale en la lista (y se da por avisada: lo verá al abrir la app).
  select jsonb_agg(jsonb_build_object(
           'solicitud_id', s.id,
           'grupo_id', s.grupo_id,
           'suscripciones', m.subs) order by s.resuelto)
  into lotes
  from public.solicitudes s
  join lateral (
    select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth)) as subs
    from public.suscripciones x
    where x.usuario = s.usuario
  ) m on m.subs is not null
  where s.id = any (ids)
    and s.estado = 'aprobada'
    -- Solo si sigue siendo miembro (si ya se le quitó, no se avisa).
    and exists (
      select 1 from public.miembros mm
      where mm.grupo_id = s.grupo_id and mm.usuario = s.usuario
    );

  update public.avisos_aprobaciones set enviado = now()
  where solicitud_id = any (ids) and enviado is null;

  return coalesce(lotes, '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------

-- Tablas: ningún permiso para la app. Solo se usan a través de las órdenes.
revoke all on public.suscripciones from anon, authenticated;
revoke all on public.avisos_aprobaciones from anon, authenticated;

-- Por defecto cualquiera puede ejecutar una función nueva: se quita a todos
-- y se da solo a quien la necesita.
revoke all on function public.avisos_apuntar(text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.avisos_al_aprobar() from public, anon, authenticated;
revoke all on function public.avisos_hay_listos() from public, anon, authenticated;
revoke all on function public.avisos_preparar_aprobaciones() from public, anon, authenticated;

-- La app (con o sin cuenta): apuntarse.
grant execute on function public.avisos_apuntar(text, text, text, text[]) to anon, authenticated;

-- El sistema (la función "enviar-avisos"): preparar los avisos de aprobación.
grant execute on function public.avisos_preparar_aprobaciones() to service_role;

-- Comprobación: deben salir 2 filas, el campo "usuario" de suscripciones y la
-- lista de espera "avisos_aprobaciones".
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'suscripciones' and column_name = 'usuario')
    or (table_name = 'avisos_aprobaciones' and column_name = 'solicitud_id'));
