-- backline — denunciar una publicación (lo exige Apple a las apps donde los
-- usuarios publican contenido: norma 1.2 del App Store).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4, 7, 9 y 11. Se puede volver a ejecutar
-- sin miedo: no borra nada. (Si un día se vuelve a ejecutar 11-comunicados.sql,
-- hay que ejecutar después este archivo otra vez.)
--
-- Qué crea:
--   · denuncias -> lo que cualquiera denuncia de una publicación (concierto,
--                  gira, disco, vídeo o noticia): motivo, comentario y, si
--                  quiere, un correo de contacto. Solo la ve el administrador.
--   · denunciar -> la única manera de denunciar (con o sin cuenta). Frena los
--                  abusos: como mucho 30 denuncias por hora en total.
--   · resolver_denuncia -> solo el administrador: la da por revisada y, si
--                  quiere, retira la publicación.
--   · Aviso al móvil del administrador de cada denuncia nueva (nunca de
--     noche), con la misma función "enviar-avisos".

-- ---------------------------------------------------------------------------
-- 1. Denuncias
-- ---------------------------------------------------------------------------

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  -- Si se borra la publicación, la denuncia se queda (para el historial).
  publicacion_id uuid references public.publicaciones (id) on delete set null,
  grupo_id text not null,
  titulo text,
  motivo text not null check (motivo in ('ofensivo', 'no-es-del-grupo', 'derechos', 'falso', 'otro')),
  texto text check (char_length(texto) <= 1000),
  contacto text check (char_length(contacto) <= 200),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisada')),
  creado timestamptz not null default now(),
  resuelto timestamptz
);

create index if not exists denuncias_estado on public.denuncias (estado, creado desc);

alter table public.denuncias enable row level security;

-- Solo el administrador las ve. Nadie las escribe directamente: solo con
-- "denunciar" y "resolver_denuncia".
drop policy if exists "solo el administrador ve las denuncias" on public.denuncias;
create policy "solo el administrador ve las denuncias"
  on public.denuncias for select
  to authenticated
  using (public.es_admin());

create or replace function public.denunciar(
  p_publicacion uuid, p_motivo text, p_texto text, p_contacto text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub public.publicaciones;
begin
  select * into pub from public.publicaciones where id = p_publicacion;
  if not found then
    raise exception 'Esa publicación ya no existe.';
  end if;
  if p_motivo is null or p_motivo not in ('ofensivo', 'no-es-del-grupo', 'derechos', 'falso', 'otro') then
    raise exception 'Elige un motivo.';
  end if;
  if (select count(*) from public.denuncias where creado > now() - interval '1 hour') >= 30 then
    raise exception 'Ahora mismo no se pueden enviar más denuncias. Inténtalo dentro de un rato o escribe a hibackline@gmail.com.';
  end if;

  insert into public.denuncias (publicacion_id, grupo_id, titulo, motivo, texto, contacto)
  values (pub.id, pub.grupo_id, left(pub.titulo, 200), p_motivo,
          nullif(left(btrim(coalesce(p_texto, '')), 1000), ''),
          nullif(left(btrim(coalesce(p_contacto, '')), 200), ''));
  return true;
end;
$$;

create or replace function public.resolver_denuncia(p_id uuid, p_retirar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.denuncias;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede revisar denuncias.' using errcode = '42501';
  end if;
  select * into d from public.denuncias where id = p_id for update;
  if not found then
    raise exception 'Esa denuncia ya no existe.';
  end if;
  if p_retirar and d.publicacion_id is not null then
    delete from public.publicaciones where id = d.publicacion_id;
  end if;
  update public.denuncias set estado = 'revisada', resuelto = now() where id = p_id;
  return case when p_retirar then 'retirada' else 'revisada' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Aviso al móvil del administrador
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_denuncias (
  denuncia_id uuid primary key references public.denuncias (id) on delete cascade,
  creado timestamptz not null default now(),
  enviado timestamptz
);

alter table public.avisos_denuncias enable row level security;

create or replace function public.avisos_al_denunciar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.avisos_denuncias (denuncia_id) values (new.id)
  on conflict (denuncia_id) do nothing;
  return new;
end;
$$;

drop trigger if exists avisos_al_denunciar on public.denuncias;
create trigger avisos_al_denunciar
  after insert on public.denuncias
  for each row execute function public.avisos_al_denunciar();

-- ¿Hay algo que enviar? Igual que en 11-comunicados.sql y, además, cualquier
-- denuncia pendiente de avisar.
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
  ) or exists (
    select 1 from public.avisos_denuncias where enviado is null
  );
$$;

-- Devuelve { denuncias: [{ id, grupo_id, motivo }], suscripciones: [...] }
-- con los móviles del administrador. Si aún no hay ninguno, espera.
create or replace function public.avisos_preparar_denuncias()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  vacio jsonb := jsonb_build_object('denuncias', '[]'::jsonb, 'suscripciones', '[]'::jsonb);
  ids uuid[];
  dens jsonb;
  subs jsonb;
begin
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return vacio;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos-denuncias')) then
    return vacio;
  end if;

  delete from public.avisos_denuncias where enviado < now() - interval '30 days';

  select array_agg(denuncia_id) into ids from public.avisos_denuncias where enviado is null;
  if ids is null then
    return vacio;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth))
  into subs
  from public.suscripciones x
  where x.admin;
  if subs is null then
    return vacio;
  end if;

  select jsonb_agg(jsonb_build_object('id', d.id, 'grupo_id', d.grupo_id, 'motivo', d.motivo) order by d.creado)
  into dens
  from public.denuncias d
  where d.id = any (ids) and d.estado = 'pendiente';

  update public.avisos_denuncias set enviado = now()
  where denuncia_id = any (ids) and enviado is null;

  if dens is null then
    return vacio;
  end if;
  return jsonb_build_object('denuncias', dens, 'suscripciones', subs);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permisos (el proyecto NO expone las tablas nuevas automáticamente)
-- ---------------------------------------------------------------------------

grant select on public.denuncias to authenticated;
revoke all on public.denuncias from anon;
revoke all on public.avisos_denuncias from anon, authenticated;

revoke all on function public.denunciar(uuid, text, text, text) from public;
grant execute on function public.denunciar(uuid, text, text, text) to anon, authenticated;

revoke all on function public.resolver_denuncia(uuid, boolean) from public, anon;
grant execute on function public.resolver_denuncia(uuid, boolean) to authenticated;

revoke all on function public.avisos_al_denunciar() from public, anon, authenticated;
revoke all on function public.avisos_hay_listos() from public, anon, authenticated;
revoke all on function public.avisos_preparar_denuncias() from public, anon, authenticated;
grant execute on function public.avisos_preparar_denuncias() to service_role;

-- Comprobación: deben salir 2 filas, "avisos_denuncias" y "denuncias".
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('denuncias', 'avisos_denuncias')
order by table_name;
