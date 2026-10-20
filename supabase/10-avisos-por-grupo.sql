-- backline — cuántas personas reciben los avisos de cada grupo (solo el
-- administrador).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4-avisos.sql y 7-avisos-admin.sql.
-- Se puede volver a ejecutar sin miedo: no crea tablas ni borra nada.
--
-- Qué hace:
--   · avisos_por_grupo -> para la pantalla "Avisos por grupo" de Mi panel.
--     Devuelve { moviles, grupos: [{ grupo_id, personas }] }:
--       moviles  = móviles con los avisos activados (sin contar los del
--                  administrador).
--       personas = de esos, cuántos reciben los avisos de cada grupo (lo
--                  siguen y no lo han silenciado).
--     Solo cifras: nunca dice quién es nadie. Solo la puede usar el
--     administrador; a cualquier otra cuenta le da error.
--
-- Ojo: quien sigue un grupo SIN activar los avisos no se cuenta (eso se
-- guarda solo en su móvil). La cifra real de seguidores es mayor.

create or replace function public.avisos_por_grupo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total integer;
  grupos jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede ver estas cifras.' using errcode = '42501';
  end if;

  select count(*) into total from public.suscripciones where not admin;

  select coalesce(jsonb_agg(jsonb_build_object('grupo_id', g, 'personas', n) order by n desc, g), '[]'::jsonb)
  into grupos
  from (
    select g, count(*)::int as n
    from public.suscripciones s, unnest(s.grupos) as g
    where not s.admin
    group by g
  ) t;

  return jsonb_build_object('moviles', total, 'grupos', grupos);
end;
$$;

revoke all on function public.avisos_por_grupo() from public, anon, authenticated;
grant execute on function public.avisos_por_grupo() to authenticated;

-- Comprobación: debe salir 1 fila con "avisos_por_grupo".
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'avisos_por_grupo';
