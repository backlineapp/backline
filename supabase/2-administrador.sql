-- backline — nombrar administrador.
--
-- Se ejecuta UNA vez, DESPUÉS de haber entrado en la app con tu correo al
-- menos una vez (así Supabase ya conoce tu cuenta).
--
-- Antes de ejecutarlo, cambia TU_CORREO por tu correo, sin quitar las
-- comillas. El correo no se guarda en el repositorio: solo en Supabase.

insert into public.administradores (usuario)
select id from auth.users where email = lower('TU_CORREO')
on conflict (usuario) do nothing;

-- Comprobación: debe salir una fila con tu correo.
select u.email, a.creado
from public.administradores a
join auth.users u on u.id = a.usuario;
