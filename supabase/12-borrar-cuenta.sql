-- backline — borrar la propia cuenta desde la app (lo exige Apple).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin miedo.
--
-- Qué hace:
--   · borrar_mi_cuenta -> borra la cuenta de quien la usa, y nada más.
--     Al borrarla, la base de datos borra sola sus solicitudes y su acceso a
--     las fichas que gestionaba. Lo que haya publicado se queda en la ficha
--     del grupo, sin autor. Sus móviles con avisos siguen recibiendo los
--     avisos de los grupos que siguen, pero ya no están ligados a ninguna
--     cuenta.
--   · El administrador NO puede borrar su cuenta desde la app (para no
--     quedarse sin administrador por un toque sin querer).

create or replace function public.borrar_mi_cuenta()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Tienes que haber entrado con tu correo para borrar tu cuenta.';
  end if;
  if public.es_admin() then
    raise exception 'La cuenta del administrador no se puede borrar desde la app.';
  end if;

  delete from auth.users where id = yo;
  return found;
end;
$$;

revoke all on function public.borrar_mi_cuenta() from public, anon, authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- Comprobación: debe salir 1 fila con "borrar_mi_cuenta".
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'borrar_mi_cuenta';
