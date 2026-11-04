-- backline — cuenta de revisión para Google Play y la App Store.
--
-- Los revisores de las tiendas no pueden recibir el código por correo, así
-- que entran con una cuenta con contraseña (hibackline+revision@gmail.com)
-- que gestiona un grupo de prueba ("grupo-de-prueba") que nadie más ve:
-- no sale en Explorar, ni en el kit, ni se puede seguir sin su enlace.
--
-- ANTES de ejecutar esto hay que crear la cuenta a mano en Supabase:
--   Authentication > Users > Add user > Create new user
--   Email: hibackline+revision@gmail.com
--   Password: la misma que se puso en Google Play (Sign-in details)
--   Marcar "Auto Confirm User".
--
-- Luego se pega ENTERO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin miedo.

insert into public.miembros (grupo_id, usuario, nombre, papel, correo)
select 'grupo-de-prueba', u.id, 'Revisión de las tiendas',
       'Cuenta de revisión (Google Play y App Store)', u.email
from auth.users u
where lower(u.email) = 'hibackline+revision@gmail.com'
on conflict (grupo_id, usuario) do nothing;

-- Comprobación: debe salir 1 fila con "grupo-de-prueba" y el correo de
-- revisión. Si sale vacío, la cuenta aún no está creada (paso de arriba).
select m.grupo_id, m.correo
from public.miembros m
where m.grupo_id = 'grupo-de-prueba';
