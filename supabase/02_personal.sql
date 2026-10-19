-- =====================================================================
-- Importadora Rapiiflash · Agregar otro administrador o courier
--
-- 1. En Supabase ve a Authentication → Users → Add user → Create new user.
--    Escribe el correo y la contraseña y marca "Auto Confirm User".
-- 2. Cambia el correo y el nombre de abajo y ejecuta SOLO la parte que
--    necesites en el SQL Editor.
-- =====================================================================

-- Nuevo courier
insert into public.couriers (user_id, email, nombre)
select id, email, 'Nombre del courier'
from auth.users
where lower(email) = lower('CORREO-DEL-COURIER@ejemplo.com')
on conflict (user_id) do update set nombre = excluded.nombre;

-- Nuevo administrador
-- insert into public.administradores (user_id, email, nombre)
-- select id, email, 'Nombre del administrador'
-- from auth.users
-- where lower(email) = lower('CORREO-DEL-ADMIN@ejemplo.com')
-- on conflict (user_id) do update set nombre = excluded.nombre;
