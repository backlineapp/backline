-- backline — conciertos fuera de España (campo "País").
--
-- Se pega ENTERO en Supabase > SQL Editor > New query > Run, ANTES de
-- publicar la versión nueva de la app (ver supabase/GUIA-AVISOS.md).
-- Se puede volver a ejecutar sin miedo: no borra nada.
--
-- Qué hace:
--   · Añade a cada fecha el campo "pais" (España si no se dice otra cosa).
--   · La provincia solo es obligatoria en España.
--   · Admite zonas horarias de otros países (Portugal y Reino Unido van una
--     hora por detrás de Madrid).
--   · Pasa al campo "pais" las fechas que tenían el país escrito en la
--     provincia ("Francia", "Portugal", "Reino Unido"...) y les pone su hora.

-- 1. Campo país
alter table public.fechas add column if not exists pais text not null default 'España';

alter table public.fechas drop constraint if exists fechas_pais_check;
alter table public.fechas add constraint fechas_pais_check
  check (char_length(pais) between 1 and 60);

-- 2. La provincia deja de ser obligatoria (luego se exige solo en España)
alter table public.fechas alter column provincia drop not null;

-- 3. Zonas horarias: cualquier zona con forma "Europe/Lisbon"
alter table public.fechas drop constraint if exists fechas_zona_check;
alter table public.fechas add constraint fechas_zona_check
  check (zona ~ '^[A-Za-z]+(/[A-Za-z_]+)+$');

-- 4. Fechas antiguas con el país escrito en la provincia: el país pasa a su
--    sitio y la provincia se queda vacía.
update public.fechas
set pais = provincia, provincia = null
where pais = 'España'
  and provincia is not null
  and provincia not in (
    'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila',
    'Badajoz', 'Baleares', 'Barcelona', 'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz',
    'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca',
    'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Jaén',
    'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga',
    'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra',
    'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria',
    'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza'
  );

-- 5. Hora de cada país (la misma tabla que usa la app en conciertos.js).
--    La hora escrita no cambia (es la del cartel); solo se apunta de qué país es.
update public.fechas
set zona = case lower(pais)
  when 'portugal' then 'Europe/Lisbon'
  when 'reino unido' then 'Europe/London'
  when 'inglaterra' then 'Europe/London'
  when 'escocia' then 'Europe/London'
  when 'gales' then 'Europe/London'
  when 'irlanda del norte' then 'Europe/London'
  when 'irlanda' then 'Europe/Dublin'
  when 'islandia' then 'Atlantic/Reykjavik'
  when 'grecia' then 'Europe/Athens'
  when 'chipre' then 'Europe/Athens'
  when 'bulgaria' then 'Europe/Athens'
  when 'rumania' then 'Europe/Athens'
  when 'rumanía' then 'Europe/Athens'
  when 'finlandia' then 'Europe/Helsinki'
  when 'estonia' then 'Europe/Helsinki'
  when 'letonia' then 'Europe/Helsinki'
  when 'lituania' then 'Europe/Helsinki'
  else 'Europe/Madrid'
end
where pais <> 'España';

-- 6. En España, la provincia sigue siendo obligatoria.
alter table public.fechas drop constraint if exists fechas_provincia_en_espana;
alter table public.fechas add constraint fechas_provincia_en_espana
  check (pais <> 'España' or provincia is not null);

-- Comprobación: deben salir las fechas fuera de España, con su país y su hora.
select f.fecha, f.ciudad, f.pais, f.provincia, f.zona
from public.fechas f
where f.pais <> 'España'
order by f.fecha;
