-- backline — qué grupos ya tienen a alguien que gestiona su ficha.
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run. Se puede volver a
-- ejecutar sin miedo: no borra nada.
--
-- Para qué: la ficha del grupo muestra «¿Es tu grupo? Gestiona o retira tu
-- ficha» solo si nadie la gestiona todavía. La tabla `miembros` es privada
-- (nombres, papeles y correos), así que la app no puede leerla. Esta función
-- devuelve ÚNICAMENTE los identificadores de grupo (por ejemplo «le-mur»),
-- nada de personas ni de correos.

create or replace function public.grupos_con_gestor()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.grupo_id from public.miembros m;
$$;

revoke all on function public.grupos_con_gestor() from public;
grant execute on function public.grupos_con_gestor() to anon, authenticated;
