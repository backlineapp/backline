-- backline — avisos en la app de las tiendas (Android; iPhone más adelante).
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Hace falta haber ejecutado antes 4 y 9. Se puede volver a ejecutar sin
-- miedo: no borra nada.
--
-- Qué cambia:
--   · La tabla de móviles con avisos (suscripciones) acepta también los
--     móviles de la app de las tiendas. Su "dirección de avisos" empieza por
--     "fcm:" (Android, a través de Google Firebase) o "apns:" (iPhone, a
--     través de Apple). No llevan claves de cifrado: el propio sistema del
--     móvil protege el aviso. Sí llevan una clave aleatoria creada en el
--     móvil, que hace falta para borrarse.
--   · avisos_apuntar_nativo -> apunta un móvil de la app (o le cambia la
--     lista de grupos). Igual que avisos_apuntar: la base de datos decide si
--     el móvil es del administrador y de qué cuenta es.
--   · Para borrarse se usa la misma orden de siempre, avisos_borrar.
--
-- Todo lo demás (qué avisos tocan, cuándo, a quién, nunca de noche) no
-- cambia: los móviles de la app entran solos en las mismas listas.

-- ---------------------------------------------------------------------------
-- 1. La tabla acepta móviles de la app
-- ---------------------------------------------------------------------------

alter table public.suscripciones drop constraint if exists suscripciones_endpoint_check;
alter table public.suscripciones add constraint suscripciones_endpoint_check
  check (char_length(endpoint) <= 1000 and endpoint ~ '^(https://|fcm:|apns:)');

-- Las claves de cifrado solo las llevan los navegadores (direcciones https).
alter table public.suscripciones alter column p256dh drop not null;
alter table public.suscripciones drop constraint if exists suscripciones_p256dh_check;
alter table public.suscripciones add constraint suscripciones_p256dh_check
  check (coalesce(p256dh ~ '^[A-Za-z0-9_-]{80,100}$', false)
         or (p256dh is null and endpoint !~ '^https://'));

-- ---------------------------------------------------------------------------
-- 2. Apuntar un móvil de la app
-- ---------------------------------------------------------------------------

create or replace function public.avisos_apuntar_nativo(
  p_endpoint text, p_auth text, p_grupos text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  limpios text[];
  soy_admin boolean := public.es_admin();
  yo uuid := (select auth.uid());
begin
  -- Solo direcciones de Firebase (Android) o de Apple (iPhone).
  if p_endpoint is null or char_length(p_endpoint) not between 24 and 1000 or not (
       p_endpoint ~ '^fcm:[A-Za-z0-9_:-]+$'
    or p_endpoint ~ '^apns:[0-9a-f]{64,200}$')
  then
    raise exception 'Dirección de avisos no válida';
  end if;
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'Clave del móvil no válida';
  end if;
  if coalesce(cardinality(p_grupos), 0) > 500 then
    raise exception 'Demasiados grupos';
  end if;

  select coalesce(array_agg(distinct g), '{}') into limpios
  from unnest(coalesce(p_grupos, '{}')) as g
  where g ~ '^[a-z0-9-]{1,80}$';

  -- La dirección de la app solo la conoce ese móvil: con ella basta para
  -- cambiar su lista (por ejemplo, si se ha reinstalado la app).
  insert into public.suscripciones (endpoint, p256dh, auth, grupos, admin, usuario)
  values (p_endpoint, null, p_auth, limpios, soy_admin, yo)
  on conflict (endpoint) do update
    set auth = excluded.auth, grupos = excluded.grupos, admin = excluded.admin,
        usuario = excluded.usuario, actualizado = now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------

revoke all on function public.avisos_apuntar_nativo(text, text, text[]) from public, anon, authenticated;
grant execute on function public.avisos_apuntar_nativo(text, text, text[]) to anon, authenticated;

-- Comprobación: debe salir 1 fila con "avisos_apuntar_nativo".
select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'avisos_apuntar_nativo';
