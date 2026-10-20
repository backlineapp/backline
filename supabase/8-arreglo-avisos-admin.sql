-- backline — arreglo de los avisos del administrador (20/10/2026).
--
-- Antes, si el móvil del administrador aún no estaba marcado, la solicitud se
-- daba por avisada y el aviso se perdía. Ahora espera en la lista hasta que
-- haya un móvil del administrador. Se pega ENTERO en Supabase > SQL Editor >
-- New query > Run. No hace falta volver a subir la función enviar-avisos.

create or replace function public.avisos_preparar_admin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  vacio jsonb := jsonb_build_object('solicitudes', '[]'::jsonb, 'suscripciones', '[]'::jsonb);
  ids uuid[];
  sols jsonb;
  subs jsonb;
begin
  -- Nada entre las 23:00 y las 9:00 (hora de Madrid).
  if extract(hour from ahora) < 9 or extract(hour from ahora) >= 23 then
    return vacio;
  end if;

  -- Si ya hay otra preparación en marcha, esta no hace nada (nunca se
  -- envía dos veces lo mismo).
  if not pg_try_advisory_xact_lock(hashtext('backline-avisos-admin')) then
    return vacio;
  end if;

  -- Limpieza: lo enviado hace más de 30 días ya no hace falta.
  delete from public.avisos_solicitudes where enviado < now() - interval '30 days';

  select array_agg(solicitud_id) into ids
  from public.avisos_solicitudes
  where enviado is null;

  if ids is null then
    return vacio;
  end if;

  -- Móviles del administrador. Si todavía no hay ninguno marcado, NO se
  -- gasta nada: las solicitudes siguen en la lista de espera y saldrán en
  -- cuanto el administrador active los avisos con su sesión iniciada.
  select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'p256dh', x.p256dh, 'auth', x.auth))
  into subs
  from public.suscripciones x
  where x.admin;

  if subs is null then
    return vacio;
  end if;

  -- Solo las que siguen pendientes (si ya se resolvió, no hace falta avisar).
  select jsonb_agg(jsonb_build_object('id', s.id, 'grupo_id', s.grupo_id, 'tipo', s.tipo) order by s.creado)
  into sols
  from public.solicitudes s
  where s.id = any (ids) and s.estado = 'pendiente';

  update public.avisos_solicitudes set enviado = now()
  where solicitud_id = any (ids) and enviado is null;

  if sols is null then
    return vacio;
  end if;

  return jsonb_build_object('solicitudes', sols, 'suscripciones', subs);
end;
$$;

revoke all on function public.avisos_preparar_admin() from public, anon, authenticated;
grant execute on function public.avisos_preparar_admin() to service_role;

select 'arreglo aplicado' as resultado;
