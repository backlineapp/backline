-- Localización personalizada de cada grupo.
-- Cuando un grupo la rellena desde su panel, prevalece sobre la ciudad
-- que tiene en grupos.json. Si no la rellena, se sigue usando la de grupos.json.

create table if not exists public.ciudades (
  grupo_id text primary key check (grupo_id ~ '^[a-z0-9-]+$'),
  ciudad   text not null default '' check (char_length(ciudad) <= 120),
  actualizado timestamptz not null default now()
);

alter table public.ciudades enable row level security;

-- Cualquiera puede leerlas (se muestran en la ficha y en las listas).
create policy "Cualquiera puede leer ciudades"
  on public.ciudades for select using (true);

-- Solo los miembros del grupo (o el administrador) pueden crear o editar.
create policy "Miembros y admin pueden crear ciudad"
  on public.ciudades for insert
  with check (public.puede_publicar(grupo_id));

create policy "Miembros y admin pueden editar ciudad"
  on public.ciudades for update
  using   (public.puede_publicar(grupo_id))
  with check (public.puede_publicar(grupo_id));
