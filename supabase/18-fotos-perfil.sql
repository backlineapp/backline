-- Foto de perfil personalizada de cada grupo.
-- Cuando un grupo sube su foto desde el panel, se guarda en Supabase Storage
-- (carpeta carteles) y la ruta se apunta aquí. Prevalece sobre la portada
-- de Bandcamp que tiene en grupos.json.

create table if not exists public.fotos_perfil (
  grupo_id    text primary key check (grupo_id ~ '^[a-z0-9-]+$'),
  ruta        text not null check (char_length(ruta) <= 500),
  actualizado timestamptz not null default now()
);

alter table public.fotos_perfil enable row level security;

-- Cualquiera puede leerlas (se muestran en la ficha y en las listas).
create policy "Cualquiera puede leer fotos de perfil"
  on public.fotos_perfil for select using (true);

-- Solo los miembros del grupo (o el administrador) pueden crear o editar.
create policy "Miembros y admin pueden crear foto de perfil"
  on public.fotos_perfil for insert
  with check (public.puede_publicar(grupo_id));

create policy "Miembros y admin pueden editar foto de perfil"
  on public.fotos_perfil for update
  using   (public.puede_publicar(grupo_id))
  with check (public.puede_publicar(grupo_id));
