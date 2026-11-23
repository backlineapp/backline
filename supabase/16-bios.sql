-- Bio de cada grupo: un texto corto que describe al grupo.
-- Lo escribe quien gestiona la ficha (o el administrador).
-- Cualquiera puede leerlo.

create table if not exists public.bios (
  grupo_id text primary key check (grupo_id ~ '^[a-z0-9-]+$'),
  texto text not null default '' check (char_length(texto) <= 500),
  actualizado timestamptz not null default now()
);

-- Cualquiera puede leer las bios.
alter table public.bios enable row level security;

create policy "Cualquiera puede leer bios"
  on public.bios for select
  using (true);

-- Solo quien puede publicar sobre ese grupo puede escribir su bio.
create policy "Miembros y admin pueden crear bio"
  on public.bios for insert
  with check (public.puede_publicar(grupo_id));

create policy "Miembros y admin pueden editar bio"
  on public.bios for update
  using (public.puede_publicar(grupo_id))
  with check (public.puede_publicar(grupo_id));
