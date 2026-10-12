-- backline — base de datos en Supabase (paso: conciertos y giras)
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin miedo: no borra nada de lo que ya exista.
--
-- Qué crea:
--   · administradores  -> quién es administrador (se rellena aparte, ver guía).
--   · publicaciones    -> todo lo que se publica sobre un grupo. Hoy: conciertos
--                         y giras. Preparado para disco, vídeo y noticia.
--   · fechas           -> las fechas de cada concierto o gira (un concierto
--                         tiene una; una gira, varias).
--   · carteles         -> carpeta de imágenes (Storage) para los carteles.
--   · Reglas de seguridad: todo el mundo puede leer; solo quien tiene permiso
--     para publicar puede crear, editar o borrar.

-- ---------------------------------------------------------------------------
-- Administradores
-- ---------------------------------------------------------------------------

create table if not exists public.administradores (
  usuario uuid primary key references auth.users (id) on delete cascade,
  creado timestamptz not null default now()
);

alter table public.administradores enable row level security;

-- Cada cuenta solo puede ver si ella misma es administradora. Nadie puede
-- añadirse ni quitarse desde la app: solo desde el panel de Supabase.
drop policy if exists "cada cuenta ve si es administradora" on public.administradores;
create policy "cada cuenta ve si es administradora"
  on public.administradores for select
  to authenticated
  using (usuario = (select auth.uid()));

-- ¿La cuenta que hace la petición es administradora?
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores where usuario = (select auth.uid())
  );
$$;

-- ¿Puede la cuenta que hace la petición publicar sobre este grupo?
-- ÚNICO sitio donde se decide el permiso para publicar. Hoy solo el
-- administrador. Más adelante, cuando haya miembros de grupos, se añadirá
-- aquí algo como: "or exists (select 1 from public.miembros where ...)".
create or replace function public.puede_publicar(grupo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin();
$$;

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  -- Identificador del grupo en grupos.json (por ejemplo "quaoar").
  grupo_id text not null check (grupo_id ~ '^[a-z0-9-]+$'),
  -- Hoy solo se usan 'concierto' y 'gira'. Los demás quedan reservados.
  tipo text not null check (tipo in ('concierto', 'gira', 'disco', 'video', 'noticia')),
  -- Nombre de la gira (y, más adelante, título del disco, vídeo o noticia).
  titulo text check (char_length(titulo) <= 200),
  -- Texto libre, reservado para más adelante (noticias).
  texto text check (char_length(texto) <= 5000),
  -- Enlace principal, reservado para más adelante (disco, vídeo).
  enlace text check (enlace ~ '^https?://'),
  -- Ruta del cartel dentro de la carpeta "carteles" (por ejemplo "quaoar/abc.jpg").
  cartel text check (cartel ~ '^[a-z0-9-]+/[a-z0-9-]+\.jpg$'),
  -- Cuenta que lo publicó.
  autor uuid default auth.uid() references auth.users (id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists publicaciones_grupo on public.publicaciones (grupo_id);

alter table public.publicaciones enable row level security;

drop policy if exists "todo el mundo lee publicaciones" on public.publicaciones;
create policy "todo el mundo lee publicaciones"
  on public.publicaciones for select
  to anon, authenticated
  using (true);

drop policy if exists "publica quien tiene permiso" on public.publicaciones;
create policy "publica quien tiene permiso"
  on public.publicaciones for insert
  to authenticated
  with check (public.puede_publicar(grupo_id));

drop policy if exists "edita quien tiene permiso" on public.publicaciones;
create policy "edita quien tiene permiso"
  on public.publicaciones for update
  to authenticated
  using (public.puede_publicar(grupo_id))
  with check (public.puede_publicar(grupo_id));

drop policy if exists "borra quien tiene permiso" on public.publicaciones;
create policy "borra quien tiene permiso"
  on public.publicaciones for delete
  to authenticated
  using (public.puede_publicar(grupo_id));

-- ---------------------------------------------------------------------------
-- Fechas de conciertos y giras
-- ---------------------------------------------------------------------------

create table if not exists public.fechas (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,
  -- Día y hora LOCALES del lugar del concierto, tal cual salen en el cartel.
  fecha date not null,
  hora time,
  -- Zona horaria del lugar: península, Baleares, Ceuta y Melilla, o Canarias.
  zona text not null default 'Europe/Madrid' check (zona in ('Europe/Madrid', 'Atlantic/Canary')),
  ciudad text not null check (char_length(ciudad) between 1 and 120),
  provincia text not null check (char_length(provincia) between 1 and 60),
  sala text not null check (char_length(sala) between 1 and 160),
  precio text check (char_length(precio) <= 80),
  entradas text check (entradas ~ '^https?://'),
  creado timestamptz not null default now()
);

create index if not exists fechas_publicacion on public.fechas (publicacion_id);
create index if not exists fechas_fecha on public.fechas (fecha);

alter table public.fechas enable row level security;

drop policy if exists "todo el mundo lee fechas" on public.fechas;
create policy "todo el mundo lee fechas"
  on public.fechas for select
  to anon, authenticated
  using (true);

-- El permiso de cada fecha es el de su publicación (su grupo).
drop policy if exists "añade fechas quien tiene permiso" on public.fechas;
create policy "añade fechas quien tiene permiso"
  on public.fechas for insert
  to authenticated
  with check (public.puede_publicar(
    (select p.grupo_id from public.publicaciones p where p.id = publicacion_id)));

drop policy if exists "edita fechas quien tiene permiso" on public.fechas;
create policy "edita fechas quien tiene permiso"
  on public.fechas for update
  to authenticated
  using (public.puede_publicar(
    (select p.grupo_id from public.publicaciones p where p.id = publicacion_id)))
  with check (public.puede_publicar(
    (select p.grupo_id from public.publicaciones p where p.id = publicacion_id)));

drop policy if exists "borra fechas quien tiene permiso" on public.fechas;
create policy "borra fechas quien tiene permiso"
  on public.fechas for delete
  to authenticated
  using (public.puede_publicar(
    (select p.grupo_id from public.publicaciones p where p.id = publicacion_id)));

-- Apunta la hora de cada cambio en una publicación.
create or replace function public.marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists publicaciones_actualizado on public.publicaciones;
create trigger publicaciones_actualizado
  before update on public.publicaciones
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- Carteles (Supabase Storage)
-- ---------------------------------------------------------------------------

-- Carpeta pública: cualquiera ve los carteles. Solo imágenes JPEG de hasta 2 MB
-- (la app las reduce a unos 1200 px antes de subirlas).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carteles', 'carteles', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

-- Solo quien puede publicar sobre un grupo sube, cambia o borra carteles en la
-- carpeta de ese grupo (la primera parte de la ruta es el grupo).
drop policy if exists "carteles: ver quien publica" on storage.objects;
create policy "carteles: ver quien publica"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'carteles' and public.puede_publicar((storage.foldername(name))[1]));

drop policy if exists "carteles: subir quien publica" on storage.objects;
create policy "carteles: subir quien publica"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'carteles' and public.puede_publicar((storage.foldername(name))[1]));

drop policy if exists "carteles: cambiar quien publica" on storage.objects;
create policy "carteles: cambiar quien publica"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'carteles' and public.puede_publicar((storage.foldername(name))[1]));

drop policy if exists "carteles: borrar quien publica" on storage.objects;
create policy "carteles: borrar quien publica"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'carteles' and public.puede_publicar((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- Permisos de acceso a través de la API (Data API)
-- ---------------------------------------------------------------------------
-- El proyecto se creó con "Automatically expose new tables" desactivado, así
-- que las tablas nuevas no tienen permisos automáticos. Sin estas líneas la
-- app recibiría "permission denied" (error 42501).
-- Estos permisos solo abren la puerta: lo que cada cuenta puede ver o cambiar
-- lo siguen decidiendo las reglas de seguridad de arriba.
-- Se pueden ejecutar varias veces: dar un permiso que ya existe no hace nada.

grant select on public.administradores to authenticated;

grant select on public.publicaciones to anon, authenticated;
grant insert, update, delete on public.publicaciones to authenticated;

grant select on public.fechas to anon, authenticated;
grant insert, update, delete on public.fechas to authenticated;

-- Las reglas de seguridad usan estas funciones, así que quien hace la
-- petición tiene que poder ejecutarlas.
grant execute on function public.es_admin() to anon, authenticated;
grant execute on function public.puede_publicar(text) to anon, authenticated;
