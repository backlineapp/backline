-- backline — guardar en la cuenta la lista de grupos que sigue cada persona.
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin miedo.
--
-- Qué hace:
--   · seguidos_cuenta -> una fila por cada grupo que una persona sigue (o ha
--     ocultado), ligada a su cuenta. Así, si cambia de móvil o vuelve a
--     instalar la app y entra con el mismo correo, recupera su lista.
--   · Cada persona solo puede ver y cambiar SUS filas (nadie más, ni siquiera
--     los administradores desde la app).
--   · Al borrar la cuenta (supabase/12-borrar-cuenta.sql) las filas se borran
--     solas.
--   · La cuenta sigue siendo opcional: sin ella, la lista se guarda solo en el
--     propio móvil, como hasta ahora (seguidos.js).

create table if not exists public.seguidos_cuenta (
  usuario  uuid        not null references auth.users (id) on delete cascade,
  grupo_id text        not null check (grupo_id ~ '^[a-z0-9-]+$' and char_length(grupo_id) <= 80),
  estado   text        not null default 'siguiendo' check (estado in ('siguiendo', 'oculto')),
  silencio boolean     not null default false,
  desde    timestamptz not null default now(),
  primary key (usuario, grupo_id)
);

alter table public.seguidos_cuenta enable row level security;

-- Nadie sin cuenta toca esta tabla.
revoke all on public.seguidos_cuenta from anon;
grant select, insert, update, delete on public.seguidos_cuenta to authenticated;

drop policy if exists "Cada persona lee sus seguidos" on public.seguidos_cuenta;
create policy "Cada persona lee sus seguidos"
  on public.seguidos_cuenta for select
  to authenticated
  using (usuario = (select auth.uid()));

-- Tope de 1000 grupos por persona, para que nadie llene la tabla.
drop policy if exists "Cada persona apunta sus seguidos" on public.seguidos_cuenta;
create policy "Cada persona apunta sus seguidos"
  on public.seguidos_cuenta for insert
  to authenticated
  with check (
    usuario = (select auth.uid())
    and (select count(*) from public.seguidos_cuenta s where s.usuario = (select auth.uid())) < 1000
  );

drop policy if exists "Cada persona cambia sus seguidos" on public.seguidos_cuenta;
create policy "Cada persona cambia sus seguidos"
  on public.seguidos_cuenta for update
  to authenticated
  using (usuario = (select auth.uid()))
  with check (usuario = (select auth.uid()));

drop policy if exists "Cada persona borra sus seguidos" on public.seguidos_cuenta;
create policy "Cada persona borra sus seguidos"
  on public.seguidos_cuenta for delete
  to authenticated
  using (usuario = (select auth.uid()));

-- Comprobación: debe salir 1 fila con "seguidos_cuenta" y rowsecurity = true.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'seguidos_cuenta';
