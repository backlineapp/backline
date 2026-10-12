-- backline — los grupos gestionan su ficha (solicitudes y miembros).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run, ANTES de
-- aceptar la petición de la app nueva (ver supabase/GUIA-MIEMBROS.md).
-- Se puede volver a ejecutar sin miedo: no borra nada de lo que ya exista.
--
-- Qué crea:
--   · solicitudes -> peticiones de "gestionar esta ficha" o "retirar la
--                    ficha". Cada persona ve solo las suyas; el
--                    administrador las ve todas.
--   · miembros    -> quién gestiona cada grupo. Un grupo puede tener varios
--                    miembros y una persona puede gestionar varios grupos.
--   · resolver_solicitud -> la ÚNICA manera de aprobar o rechazar. Solo la
--                    puede usar el administrador, y nunca con una solicitud
--                    suya.
--   · Amplía la regla única de permisos (puede_publicar): publica el
--     administrador o un miembro aprobado de ESE grupo.
--
-- Nadie puede añadirse como miembro ni cambiar el estado de una solicitud
-- desde la app: la base de datos no da permiso para ello. Solo existe el
-- camino de resolver_solicitud.
--
-- Los nombres, papeles, mensajes y correos se guardan solo en Supabase,
-- nunca en el repositorio (que es público).

-- ---------------------------------------------------------------------------
-- Miembros de cada grupo
-- ---------------------------------------------------------------------------

create table if not exists public.miembros (
  -- Identificador del grupo en grupos.json (por ejemplo "quaoar").
  grupo_id text not null check (grupo_id ~ '^[a-z0-9-]+$'),
  usuario uuid not null references auth.users (id) on delete cascade,
  -- Copiados de la solicitud aprobada, para que el administrador sepa quién es.
  nombre text not null check (char_length(nombre) between 1 and 120),
  papel text not null check (char_length(papel) between 1 and 120),
  correo text,
  aprobado_por uuid references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  primary key (grupo_id, usuario)
);

create index if not exists miembros_usuario on public.miembros (usuario);

alter table public.miembros enable row level security;

-- Cada cuenta ve los grupos que gestiona; el administrador ve todos.
drop policy if exists "cada cuenta ve sus grupos" on public.miembros;
create policy "cada cuenta ve sus grupos"
  on public.miembros for select
  to authenticated
  using (usuario = (select auth.uid()) or public.es_admin());

-- Solo el administrador puede quitar a alguien.
drop policy if exists "el administrador quita miembros" on public.miembros;
create policy "el administrador quita miembros"
  on public.miembros for delete
  to authenticated
  using (public.es_admin());

-- (No hay regla para añadir ni cambiar: solo resolver_solicitud añade miembros.)

-- ---------------------------------------------------------------------------
-- La regla única de permisos, ampliada
-- ---------------------------------------------------------------------------
-- ¿Puede la cuenta que hace la petición publicar sobre este grupo?
-- ÚNICO sitio donde se decide. Sí, si es administrador o miembro aprobado de
-- ese grupo. La usan las publicaciones, las fechas y los carteles.
-- (1-base-de-datos.sql lleva una copia idéntica, por si se vuelve a ejecutar.)
create or replace function public.puede_publicar(grupo text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.es_admin() then
    return true;
  end if;
  if to_regclass('public.miembros') is null then
    return false;
  end if;
  return exists (
    select 1 from public.miembros m
    where m.usuario = (select auth.uid()) and m.grupo_id = grupo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Solicitudes
-- ---------------------------------------------------------------------------

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  grupo_id text not null check (grupo_id ~ '^[a-z0-9-]+$'),
  -- 'gestionar' = gestionar la ficha; 'retirar' = que se retire la ficha.
  tipo text not null check (tipo in ('gestionar', 'retirar')),
  -- Quién la pide. Lo rellena la base de datos (no se puede inventar).
  usuario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  correo text,
  nombre text not null check (char_length(nombre) between 1 and 120),
  papel text not null check (char_length(papel) between 1 and 120),
  mensaje text check (char_length(mensaje) <= 2000),
  -- Casilla "Formo parte del grupo o lo represento, y tengo derecho a
  -- publicar lo que suba". Obligatoria para gestionar la ficha.
  acepta boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  creado timestamptz not null default now(),
  resuelto timestamptz,
  resuelto_por uuid references auth.users (id) on delete set null,
  constraint solicitudes_casilla check (tipo <> 'gestionar' or acepta)
);

create index if not exists solicitudes_estado on public.solicitudes (estado);
create index if not exists solicitudes_usuario on public.solicitudes (usuario);

-- Una sola solicitud pendiente por persona, grupo y tipo.
create unique index if not exists solicitudes_una_pendiente
  on public.solicitudes (usuario, grupo_id, tipo)
  where estado = 'pendiente';

alter table public.solicitudes enable row level security;

-- Cada cuenta ve las suyas; el administrador, todas.
drop policy if exists "cada cuenta ve sus solicitudes" on public.solicitudes;
create policy "cada cuenta ve sus solicitudes"
  on public.solicitudes for select
  to authenticated
  using (usuario = (select auth.uid()) or public.es_admin());

-- Cualquiera con cuenta puede pedir, siempre a su nombre y como pendiente.
drop policy if exists "cada cuenta pide a su nombre" on public.solicitudes;
create policy "cada cuenta pide a su nombre"
  on public.solicitudes for insert
  to authenticated
  with check (usuario = (select auth.uid()) and estado = 'pendiente');

-- (No hay regla para cambiar ni borrar: solo resolver_solicitud cambia el estado.)

-- Al crear una solicitud, la base de datos pone ella misma quién la pide, su
-- correo y el estado "pendiente", diga lo que diga la app. Además frena los
-- abusos: como mucho 5 solicitudes pendientes por persona.
create or replace function public.solicitudes_al_crear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Tienes que entrar con tu correo para enviar una solicitud.';
  end if;
  new.usuario := yo;
  new.correo := (select u.email from auth.users u where u.id = yo);
  new.estado := 'pendiente';
  new.creado := now();
  new.resuelto := null;
  new.resuelto_por := null;
  new.nombre := btrim(new.nombre);
  new.papel := btrim(new.papel);
  new.mensaje := nullif(btrim(coalesce(new.mensaje, '')), '');

  if new.tipo = 'gestionar' and exists (
    select 1 from public.miembros m where m.usuario = yo and m.grupo_id = new.grupo_id
  ) then
    raise exception 'Ya gestionas esta ficha.';
  end if;

  if exists (
    select 1 from public.solicitudes s
    where s.usuario = yo and s.grupo_id = new.grupo_id and s.tipo = new.tipo and s.estado = 'pendiente'
  ) then
    raise exception 'Ya tienes una solicitud pendiente como esta. Espera a que la revisemos.';
  end if;

  if (select count(*) from public.solicitudes s where s.usuario = yo and s.estado = 'pendiente') >= 5 then
    raise exception 'Tienes demasiadas solicitudes pendientes. Espera a que las revisemos.';
  end if;

  return new;
end;
$$;

drop trigger if exists solicitudes_al_crear on public.solicitudes;
create trigger solicitudes_al_crear
  before insert on public.solicitudes
  for each row execute function public.solicitudes_al_crear();

-- ---------------------------------------------------------------------------
-- Aprobar o rechazar (solo el administrador)
-- ---------------------------------------------------------------------------
-- Aprobar "gestionar" añade a la persona como miembro del grupo.
-- Aprobar "retirar" solo deja la solicitud como aprobada: la ficha se quita a
-- mano, borrando el grupo de grupos.json.
create or replace function public.resolver_solicitud(p_id uuid, p_aprobar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
  s public.solicitudes;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede aprobar o rechazar solicitudes.' using errcode = '42501';
  end if;

  select * into s from public.solicitudes where id = p_id for update;
  if not found then
    raise exception 'Esa solicitud ya no existe.';
  end if;
  if s.usuario = yo then
    raise exception 'Nadie puede resolver su propia solicitud.';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Esa solicitud ya estaba resuelta.';
  end if;

  update public.solicitudes
    set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
        resuelto = now(),
        resuelto_por = yo
    where id = p_id;

  if p_aprobar and s.tipo = 'gestionar' then
    insert into public.miembros (grupo_id, usuario, nombre, papel, correo, aprobado_por)
    values (s.grupo_id, s.usuario, s.nombre, s.papel, s.correo, yo)
    on conflict (grupo_id, usuario) do nothing;
  end if;

  return case when p_aprobar then 'aprobada' else 'rechazada' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de acceso a través de la API (Data API)
-- ---------------------------------------------------------------------------
-- "Automatically expose new tables" está desactivado: sin estas líneas la app
-- recibiría "permission denied" (error 42501). Solo abren la puerta; lo que
-- cada cuenta ve o cambia lo deciden las reglas de arriba.
-- Los visitantes sin cuenta (anon) no tienen ningún permiso aquí.

grant select, delete on public.miembros to authenticated;

grant select on public.solicitudes to authenticated;
-- Al pedir, la app solo puede rellenar estos campos. El resto (quién, correo,
-- estado, fechas) lo pone la base de datos.
grant insert (grupo_id, tipo, nombre, papel, mensaje, acepta) on public.solicitudes to authenticated;

-- Las funciones nuevas no se pueden usar sin cuenta.
revoke execute on function public.resolver_solicitud(uuid, boolean) from public, anon;
grant execute on function public.resolver_solicitud(uuid, boolean) to authenticated;

-- La regla de permisos la siguen usando todos (también los visitantes, al leer).
grant execute on function public.puede_publicar(text) to anon, authenticated;
