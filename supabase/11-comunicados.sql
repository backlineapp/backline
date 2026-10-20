-- backline — avisos del administrador a los grupos ("Novedades de Backline").
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4-avisos.sql, 5-miembros.sql,
-- 7-avisos-admin.sql y 9-aviso-aprobacion.sql.
-- Se puede volver a ejecutar sin miedo: no borra nada.
-- (Si un día se vuelve a ejecutar 7-avisos-admin.sql o 9-aviso-aprobacion.sql,
-- hay que ejecutar después este archivo otra vez.)
--
-- Qué crea:
--   · comunicados -> lo que el administrador escribe a los grupos (título y
--                    texto). Solo lo ven el administrador y quienes gestionan
--                    alguna ficha. Los fans y los visitantes, nunca.
--                    Solo el administrador puede escribir y borrar.
--   · avisos_comunicados -> lista de espera: cada comunicado nuevo entra aquí
--                    solo, para avisar al móvil.
--   · avisos_preparar_comunicados -> la usa la función "enviar-avisos" para
--                    mandar "Backline · [título]" a los móviles de quienes
--                    gestionan alguna ficha.
--
-- Reglas de estos avisos:
--   · Uno por comunicado y por móvil, aunque esa persona gestione varias
--     fichas.
--   · Nada entre las 23:00 y las 9:00 (hora de Madrid): lo de la noche sale
--     a las 9:00.
--   · Solo llega a los móviles con los avisos activados y la sesión iniciada.
--     Quien no los tenga lo verá igualmente en su Mi panel.

-- ---------------------------------------------------------------------------
-- 1. Comunicados
-- ---------------------------------------------------------------------------

create table if not exists public.comunicados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  creado timestamptz not null default now()
);

create index if not exists comunicados_creado on public.comunicados (creado desc);

alter table public.comunicados enable row level security;

-- Los ven el administrador y quien gestiona alguna ficha.
drop policy if exists "los ven los grupos" on public.comunicados;
create policy "los ven los grupos"
  on public.comunicados for select
  to authenticated
  using (
    public.es_admin()
    or exists (select 1 from public.miembros m where m.usuario = (select auth.uid()))
  );

-- Solo el administrador escribe y borra.
drop policy if exists "el administrador escribe" on public.comunicados;
create policy "el administrador escribe"
  on public.comunicados for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "el administrador borra" on public.comunicados;
create policy "el administrador borra"
  on public.comunicados for delete
  to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------------
-- 2. Lista de espera de avisos
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_comunicados (
  -- Si se borra el comunicado antes de avisar, se borra de la lista de espera.
  comunicado_id uuid primary key references public.comunicados (id) on delete cascade,
  creado timestamptz not null default now(),
  -- Cuándo se envió (o se descartó). Vacío = pendiente.
  enviado timestamptz
);

-- Reglas de seguridad activadas y SIN ninguna regla que deje entrar: desde la
-- app nadie puede leerla ni tocarla.
alter table public.avisos_comunicados enable row level security;

create or replace function public.avisos_al_comunicar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.avisos_comunicados (comunicado_id) values (new.id)
  on conflict (comunicado_id) do nothing;
  return new;
end;
$$;

drop trigger if exists avisos_al_comunicar on public.comunicados;
create trigger avisos_al_comunicar
  after insert on public.comunicados
  for each row execute function public.avisos_al_comunicar();

-- ---------------------------------------------------------------------------
-- 3. Órdenes del sistema (solo la función "enviar-avisos")
-- ---------------------------------------------------------------------------

-- ¿Hay algo que enviar? Igual que en 9-aviso-aprobacion.sql y, además,
-- cualquier comunicado pendiente de avisar.
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
  ) or exists (
    select 1 from public.avisos_comunicados where enviado is null
  );
$$;

-- Prepara los avisos de comunicados y los marca como enviados.
-- Devuelve { comunicados: [{ id, titulo, texto }], suscripciones: [...] }
-- con los móviles de quienes gestionan alguna ficha (cada móvil una vez).
create or replace function public.avisos_preparar_comunicados()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  vacio jsonb := jsonb_build_object('comunicados', '[]'::jsonb, 'suscripciones', '[]'::jsonb);
  ids uuid[];
  coms jsonb;
  subs jsonb;
begin
  -- Nada entre las 23:00 y las 9:00 (hora de Madrid).
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return vacio;
  end if;

  -- Si ya hay otra preparación en marcha, esta no hace nada (nunca se
  -- envía dos veces lo mismo).
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos-comunicados')) then
    return vacio;
  end if;

  -- Limpieza: lo enviado hace más de 30 días ya no hace falta.
  delete from public.avisos_comunicados where enviado < now() - interval '30 days';

  select array_agg(comunicado_id) into ids
  from public.avisos_comunicados
  where enviado is null;

  if ids is null then
    return vacio;
  end if;

  select jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'texto', c.texto) order by c.creado)
  into coms
  from public.comunicados c
  where c.id = any (ids);

  -- Móviles de quienes gestionan alguna ficha (no los del administrador).
  select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth))
  into subs
  from public.suscripciones x
  where not x.admin
    and x.usuario in (select m.usuario from public.miembros m);

  -- Se dan por avisados aunque nadie tenga los avisos activados: lo verán
  -- en su Mi panel.
  update public.avisos_comunicados set enviado = now()
  where comunicado_id = any (ids) and enviado is null;

  if coms is null or subs is null then
    return vacio;
  end if;

  return jsonb_build_object('comunicados', coms, 'suscripciones', subs);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------

-- Comunicados: leer, escribir (solo título y texto) y borrar. Lo que cada
-- cuenta puede hacer de verdad lo deciden las reglas de arriba.
grant select, delete on public.comunicados to authenticated;
grant insert (titulo, texto) on public.comunicados to authenticated;
revoke all on public.comunicados from anon;

-- Lista de espera: ningún permiso para la app.
revoke all on public.avisos_comunicados from anon, authenticated;

revoke all on function public.avisos_al_comunicar() from public, anon, authenticated;
revoke all on function public.avisos_hay_listos() from public, anon, authenticated;
revoke all on function public.avisos_preparar_comunicados() from public, anon, authenticated;

-- El sistema (la función "enviar-avisos"): preparar los avisos de comunicados.
grant execute on function public.avisos_preparar_comunicados() to service_role;

-- Comprobación: deben salir 2 filas, "comunicados" y "avisos_comunicados".
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('comunicados', 'avisos_comunicados')
order by table_name;
