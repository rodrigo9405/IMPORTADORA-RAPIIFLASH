-- =====================================================================
-- Rapiiflash · 03 · Varios negocios, super administrador y boletas
--
-- Se ejecuta DESPUÉS de 01_esquema.sql. Convierte el sistema en
-- multinegocio y pasa los datos que ya existían al negocio
-- «Importadora Rapiiflash». Se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Negocios
-- ---------------------------------------------------------------------
create table if not exists public.negocios (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique check (codigo ~ '^[a-z0-9-]{3,40}$'),
  nombre            text not null check (length(trim(nombre)) > 0),
  telefono          text,
  ruc               text,
  instagram         text,
  direccion         text,
  dueno_nombre      text,
  dueno_dni         text,
  logo_ruta         text,
  color_primario    text not null default '#FFC400' check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  color_secundario  text not null default '#121821' check (color_secundario ~ '^#[0-9A-Fa-f]{6}$'),
  datos_por         text not null default 'super' check (datos_por in ('super','admin')),
  datos_completos   boolean not null default true,
  servicio_estado   text not null default 'activo' check (servicio_estado in ('activo','pausado','terminado')),
  servicio_inicio   date not null default ((now() at time zone 'America/Lima')::date),
  servicio_fin      date,
  ultimo_pedido     integer not null default 1000,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);

-- Historial del servicio (solo lo ve el super administrador)
create table if not exists public.negocio_servicio (
  id          bigint generated always as identity primary key,
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  accion      text not null,
  nota        text,
  actor       text,
  creado      timestamptz not null default now()
);
create index if not exists negocio_servicio_negocio_idx on public.negocio_servicio (negocio_id);

-- ---------------------------------------------------------------------
-- 2. Super administrador (correo + contraseña + código de 4 dígitos)
-- ---------------------------------------------------------------------
create table if not exists public.superadmins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  nombre       text not null default 'Super administrador',
  codigo_hash  text not null
);
create table if not exists public.super_sesiones (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  verificado  timestamptz not null default now()
);
create table if not exists public.super_intentos (
  id       bigint generated always as identity primary key,
  user_id  uuid not null,
  ok       boolean not null,
  creado   timestamptz not null default now()
);
create table if not exists public.ingreso_intentos (
  id      bigint generated always as identity primary key,
  dni     text not null,
  ok      boolean not null,
  creado  timestamptz not null default now()
);
create index if not exists ingreso_intentos_dni_idx on public.ingreso_intentos (dni, creado);

-- ---------------------------------------------------------------------
-- 3. Copia cifrada de contraseñas (solo la lee el super administrador)
-- ---------------------------------------------------------------------
create table if not exists public.accesos (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  clave_cifrada  bytea not null,
  actualizado    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rapiiflash_accesos') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rapiiflash_accesos',
      'Clave para cifrar las contraseñas que ve el super administrador');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Cada cuenta, producto y pedido pertenece a un negocio
-- ---------------------------------------------------------------------
alter table public.administradores add column if not exists negocio_id uuid references public.negocios(id) on delete cascade;
alter table public.couriers        add column if not exists negocio_id uuid references public.negocios(id) on delete cascade;
alter table public.clientes        add column if not exists negocio_id uuid references public.negocios(id) on delete cascade;
alter table public.productos       add column if not exists negocio_id uuid references public.negocios(id) on delete cascade;
alter table public.pedidos         add column if not exists negocio_id uuid references public.negocios(id) on delete cascade;

alter table public.productos    add column if not exists precio_ref numeric(12,2);
alter table public.pedidos      add column if not exists courier_id uuid references public.couriers(user_id) on delete set null;
alter table public.pedidos      add column if not exists vendedor_nombre text;
alter table public.pedidos      add column if not exists boleta jsonb;
alter table public.pedido_items add column if not exists precio numeric(12,2) check (precio is null or precio >= 0);

-- Los datos que ya existían pasan a «Importadora Rapiiflash»
do $$
declare v_neg uuid;
begin
  if exists (select 1 from public.administradores where negocio_id is null)
     or exists (select 1 from public.couriers where negocio_id is null)
     or exists (select 1 from public.clientes where negocio_id is null)
     or exists (select 1 from public.productos where negocio_id is null)
     or exists (select 1 from public.pedidos where negocio_id is null) then
    select id into v_neg from public.negocios where codigo = 'rapiiflash';
    if v_neg is null then
      insert into public.negocios (codigo, nombre, datos_por, datos_completos, ultimo_pedido)
      values ('rapiiflash', 'Importadora Rapiiflash', 'super', true,
              greatest(1000, coalesce((select max(numero) from public.pedidos), 1000)))
      returning id into v_neg;
      insert into public.negocio_servicio (negocio_id, accion, actor) values (v_neg, 'Servicio iniciado', 'Sistema');
    end if;
    update public.administradores set negocio_id = v_neg where negocio_id is null;
    update public.couriers        set negocio_id = v_neg where negocio_id is null;
    update public.clientes        set negocio_id = v_neg where negocio_id is null;
    update public.productos       set negocio_id = v_neg where negocio_id is null;
    update public.pedidos         set negocio_id = v_neg where negocio_id is null;
  end if;
end $$;

alter table public.administradores alter column negocio_id set not null;
alter table public.couriers        alter column negocio_id set not null;
alter table public.clientes        alter column negocio_id set not null;
alter table public.productos       alter column negocio_id set not null;
alter table public.pedidos         alter column negocio_id set not null;

create index if not exists administradores_negocio_idx on public.administradores (negocio_id);
create index if not exists couriers_negocio_idx on public.couriers (negocio_id);
create index if not exists clientes_negocio_idx on public.clientes (negocio_id);
create index if not exists productos_negocio_idx on public.productos (negocio_id);
create index if not exists pedidos_negocio_idx on public.pedidos (negocio_id);

-- DNI único dentro de cada negocio; número de pedido propio de cada negocio
drop index if exists public.clientes_dni_uq;
create unique index if not exists clientes_negocio_dni_uq on public.clientes (negocio_id, dni);
alter table public.pedidos drop constraint if exists pedidos_numero_key;
alter table public.pedidos alter column numero drop default;
create unique index if not exists pedidos_negocio_numero_uq on public.pedidos (negocio_id, numero);

create or replace trigger negocios_actualizado before update on public.negocios
  for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------------------
-- 5. ¿Quién está conectado y de qué negocio?
-- ---------------------------------------------------------------------
create or replace function public.es_super()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.superadmins where user_id = auth.uid())
     and exists (select 1 from public.super_sesiones s
                 where s.user_id = auth.uid()
                   and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                   and s.verificado > now() - interval '12 hours');
$$;

-- Negocio del administrador conectado (solo si el servicio está activo)
create or replace function public.admin_negocio()
returns uuid language sql stable security definer set search_path = public as $$
  select a.negocio_id from public.administradores a
  join public.negocios n on n.id = a.negocio_id
  where a.user_id = auth.uid() and n.servicio_estado = 'activo';
$$;

create or replace function public.courier_negocio()
returns uuid language sql stable security definer set search_path = public as $$
  select c.negocio_id from public.couriers c
  join public.negocios n on n.id = c.negocio_id
  where c.user_id = auth.uid() and n.servicio_estado = 'activo';
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_negocio() is not null;
$$;

create or replace function public.es_courier()
returns boolean language sql stable security definer set search_path = public as $$
  select public.courier_negocio() is not null;
$$;

create or replace function public.mi_cliente_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.clientes c
  join public.negocios n on n.id = c.negocio_id
  where c.user_id = auth.uid() and n.servicio_estado = 'activo';
$$;

-- ¿Puede administrar este negocio? (su administrador o el super administrador)
create or replace function public.gestiona_negocio(p_negocio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_negocio is not null and (public.es_super() or public.admin_negocio() = p_negocio);
$$;

create or replace function public.nombre_actor()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nombre || ' · super administrador' from public.superadmins where user_id = auth.uid()),
    (select case when lower(nombre) like 'administrador%' then nombre else nombre || ' · administrador' end
       from public.administradores where user_id = auth.uid()),
    (select case when lower(nombre) like 'courier%' then nombre else nombre || ' · courier' end
       from public.couriers where user_id = auth.uid()),
    'Sistema'
  );
$$;

-- Perfil de quien inició sesión
create or replace function public.mi_perfil()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when public.es_super()
                 then jsonb_build_object('rol','super','nombre',s.nombre,'email',s.email)
                 else jsonb_build_object('rol','super_pendiente','email',s.email) end
       from public.superadmins s where s.user_id = auth.uid()),
    (select jsonb_build_object('rol','admin','nombre',a.nombre,'email',a.email,'negocio_id',a.negocio_id,
                               'negocio_activo', n.servicio_estado = 'activo','datos_completos', n.datos_completos)
       from public.administradores a join public.negocios n on n.id = a.negocio_id where a.user_id = auth.uid()),
    (select jsonb_build_object('rol','courier','nombre',c.nombre,'email',c.email,'negocio_id',c.negocio_id,
                               'negocio_activo', n.servicio_estado = 'activo')
       from public.couriers c join public.negocios n on n.id = c.negocio_id where c.user_id = auth.uid()),
    (select jsonb_build_object('rol','cliente','id',c.id,'nombre',c.nombres || ' ' || c.apellidos,'nombres',c.nombres,
                               'dni',c.dni,'negocio_id',c.negocio_id,'negocio_activo', n.servicio_estado = 'activo')
       from public.clientes c join public.negocios n on n.id = c.negocio_id where c.user_id = auth.uid())
  );
$$;

-- Marca del negocio (nombre, logo, colores y datos de la boleta) para quien trabaja o compra en él.
-- No incluye dueño, DNI ni datos del servicio: esos solo los ve el super administrador.
create or replace function public.mi_negocio_marca()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', n.id, 'codigo', n.codigo, 'nombre', n.nombre, 'logo_ruta', n.logo_ruta,
                            'color_primario', n.color_primario, 'color_secundario', n.color_secundario,
                            'telefono', n.telefono, 'ruc', n.ruc, 'instagram', n.instagram, 'direccion', n.direccion)
  from public.negocios n
  where n.servicio_estado = 'activo'
    and n.id = coalesce(public.admin_negocio(), public.courier_negocio(),
                        (select negocio_id from public.clientes where id = public.mi_cliente_id()));
$$;

-- Marca pública para la pantalla de ingreso de un negocio (enlace ?n=codigo)
create or replace function public.negocio_publico(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('codigo', codigo, 'nombre', nombre, 'logo_ruta', logo_ruta,
                            'color_primario', color_primario, 'color_secundario', color_secundario)
  from public.negocios where codigo = lower(p_codigo) and servicio_estado = 'activo';
$$;

-- ---------------------------------------------------------------------
-- 6. Ingreso
-- ---------------------------------------------------------------------
-- Código del super administrador (5 intentos fallidos = 15 minutos de espera)
create or replace function public.verificar_codigo_super(p_codigo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash   text;
  v_fallos integer;
  v_sesion uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  select codigo_hash into v_hash from public.superadmins where user_id = auth.uid();
  if v_hash is null or v_sesion is null then
    raise exception 'Esta cuenta no es de super administrador.' using errcode = '42501';
  end if;
  select count(*) into v_fallos from public.super_intentos
   where user_id = auth.uid() and not ok and creado > now() - interval '15 minutes';
  if v_fallos >= 5 then
    raise exception 'Demasiados intentos con el código. Espera 15 minutos e inténtalo otra vez.';
  end if;
  if extensions.crypt(coalesce(p_codigo, ''), v_hash) = v_hash then
    insert into public.super_intentos (user_id, ok) values (auth.uid(), true);
    insert into public.super_sesiones (session_id, user_id) values (v_sesion, auth.uid())
      on conflict (session_id) do update set verificado = now();
    return true;
  end if;
  insert into public.super_intentos (user_id, ok) values (auth.uid(), false);
  return false;
end;
$$;

-- Clientes: entran con DNI. Devuelve la cuenta solo si la contraseña es correcta.
-- (8 intentos fallidos con un DNI = 15 minutos de espera)
create or replace function public.cuentas_por_dni(p_dni text, p_clave text, p_negocio text default null)
returns table (email text, negocio_codigo text, negocio_nombre text, logo_ruta text)
language plpgsql security definer set search_path = public as $$
declare
  v_dni    text := upper(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'));
  v_fallos integer;
begin
  if v_dni = '' or coalesce(p_clave, '') = '' then return; end if;
  select count(*) into v_fallos from public.ingreso_intentos
   where dni = v_dni and not ok and creado > now() - interval '15 minutes';
  if v_fallos >= 8 then
    raise exception 'Demasiados intentos con este DNI. Espera 15 minutos e inténtalo otra vez.';
  end if;

  return query
    select u.email::text, n.codigo, n.nombre, n.logo_ruta
      from public.clientes c
      join public.negocios n on n.id = c.negocio_id
      join auth.users u on u.id = c.user_id
     where c.dni = v_dni
       and n.servicio_estado = 'activo'
       and (p_negocio is null or n.codigo = lower(p_negocio))
       and u.encrypted_password is not null
       and u.encrypted_password = extensions.crypt(p_clave, u.encrypted_password)
     order by n.nombre;

  insert into public.ingreso_intentos (dni, ok) values (v_dni, found);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Contraseñas visibles para el super administrador
-- ---------------------------------------------------------------------
-- La clave de cifrado vive en un esquema privado que la API no expone.
create schema if not exists privado;

create or replace function privado.clave_accesos()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rapiiflash_accesos' limit 1;
$$;

-- Solo la usa la función "usuarios" con la clave de servicio.
create or replace function public.guardar_clave(p_user uuid, p_clave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No permitido.' using errcode = '42501';
  end if;
  insert into public.accesos (user_id, clave_cifrada, actualizado)
  values (p_user, extensions.pgp_sym_encrypt(p_clave, privado.clave_accesos()), now())
  on conflict (user_id) do update set clave_cifrada = excluded.clave_cifrada, actualizado = now();
end;
$$;

create or replace function public.ver_clave(p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_super() then
    raise exception 'Solo el super administrador puede ver contraseñas.' using errcode = '42501';
  end if;
  return (select extensions.pgp_sym_decrypt(clave_cifrada, privado.clave_accesos())
            from public.accesos where user_id = p_user);
end;
$$;

-- Lista de cuentas de un negocio (sin contraseñas; se piden una por una con ver_clave)
create or replace function public.accesos_negocio(p_negocio uuid)
returns table (user_id uuid, rol text, usuario text, nombre text, tiene_clave boolean, ref_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_super() then
    raise exception 'Solo el super administrador puede ver los accesos.' using errcode = '42501';
  end if;
  return query
    select a.user_id, 'admin'::text, a.email, a.nombre, exists (select 1 from public.accesos x where x.user_id = a.user_id), a.user_id
      from public.administradores a where a.negocio_id = p_negocio
    union all
    select c.user_id, 'courier'::text, c.email, c.nombre, exists (select 1 from public.accesos x where x.user_id = c.user_id), c.user_id
      from public.couriers c where c.negocio_id = p_negocio
    union all
    select c.user_id, 'cliente'::text, c.dni, c.nombres || ' ' || c.apellidos,
           c.user_id is not null and exists (select 1 from public.accesos x where x.user_id = c.user_id), c.id
      from public.clientes c where c.negocio_id = p_negocio;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Negocios: crear, editar, resumen y datos iniciales del administrador
-- ---------------------------------------------------------------------
create or replace function public.guardar_negocio(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_codigo text;
  v_base   text;
  v_n      integer := 1;
begin
  if not public.es_super() then
    raise exception 'Solo el super administrador puede guardar negocios.' using errcode = '42501';
  end if;
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'Escribe el nombre del negocio.'; end if;

  if p_id is null then
    v_base := left(trim(both '-' from regexp_replace(lower(coalesce(nullif(p ->> 'codigo', ''), p ->> 'nombre')), '[^a-z0-9]+', '-', 'g')), 30);
    if length(v_base) < 3 then v_base := 'negocio'; end if;
    v_codigo := v_base;
    while exists (select 1 from public.negocios where codigo = v_codigo) loop
      v_n := v_n + 1;
      v_codigo := v_base || '-' || v_n;
    end loop;
    insert into public.negocios (codigo, nombre, telefono, ruc, instagram, direccion, dueno_nombre, dueno_dni,
                                 color_primario, color_secundario, datos_por, datos_completos, servicio_inicio)
    values (v_codigo, trim(p ->> 'nombre'), nullif(trim(p ->> 'telefono'), ''), nullif(trim(p ->> 'ruc'), ''),
            nullif(trim(p ->> 'instagram'), ''), nullif(trim(p ->> 'direccion'), ''),
            nullif(trim(p ->> 'dueno_nombre'), ''), nullif(trim(p ->> 'dueno_dni'), ''),
            coalesce(nullif(p ->> 'color_primario', ''), '#FFC400'), coalesce(nullif(p ->> 'color_secundario', ''), '#121821'),
            coalesce(nullif(p ->> 'datos_por', ''), 'super'),
            coalesce(nullif(p ->> 'datos_por', ''), 'super') = 'super',
            coalesce(nullif(p ->> 'servicio_inicio', '')::date, (now() at time zone 'America/Lima')::date))
    returning id into v_id;
    insert into public.negocio_servicio (negocio_id, accion, nota, actor)
    values (v_id, 'Servicio iniciado', 'Inicio: ' || to_char((select servicio_inicio from public.negocios where id = v_id), 'DD/MM/YYYY'),
            public.nombre_actor());
  else
    update public.negocios set
      nombre           = trim(p ->> 'nombre'),
      telefono         = nullif(trim(p ->> 'telefono'), ''),
      ruc              = nullif(trim(p ->> 'ruc'), ''),
      instagram        = nullif(trim(p ->> 'instagram'), ''),
      direccion        = nullif(trim(p ->> 'direccion'), ''),
      dueno_nombre     = nullif(trim(p ->> 'dueno_nombre'), ''),
      dueno_dni        = nullif(trim(p ->> 'dueno_dni'), ''),
      color_primario   = coalesce(nullif(p ->> 'color_primario', ''), color_primario),
      color_secundario = coalesce(nullif(p ->> 'color_secundario', ''), color_secundario),
      servicio_inicio  = coalesce(nullif(p ->> 'servicio_inicio', '')::date, servicio_inicio),
      logo_ruta        = case when p ? 'logo_ruta' then nullif(p ->> 'logo_ruta', '') else logo_ruta end,
      datos_completos  = case when coalesce((p ->> 'marcar_completo')::boolean, false) then true else datos_completos end
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Este negocio ya no existe.'; end if;
  end if;
  return v_id;
end;
$$;

-- El administrador llena los datos de su negocio una sola vez (cuando el super lo dejó a su cargo)
create or replace function public.completar_negocio(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_neg uuid := public.admin_negocio();
begin
  if v_neg is null then raise exception 'Tu cuenta no puede completar estos datos.' using errcode = '42501'; end if;
  if (select datos_completos from public.negocios where id = v_neg) then
    raise exception 'Los datos de tu negocio ya fueron registrados.';
  end if;
  if coalesce(trim(p ->> 'nombre'), '') = '' then raise exception 'Escribe el nombre del negocio.'; end if;
  if coalesce(trim(p ->> 'telefono'), '') = '' then raise exception 'Escribe el teléfono.'; end if;
  if coalesce(trim(p ->> 'direccion'), '') = '' then raise exception 'Escribe la dirección.'; end if;
  if coalesce(trim(p ->> 'dueno_nombre'), '') = '' then raise exception 'Escribe el nombre del dueño.'; end if;
  if coalesce(trim(p ->> 'dueno_dni'), '') = '' then raise exception 'Escribe el DNI del dueño.'; end if;
  update public.negocios set
    nombre = trim(p ->> 'nombre'), telefono = trim(p ->> 'telefono'), ruc = nullif(trim(p ->> 'ruc'), ''),
    instagram = nullif(trim(p ->> 'instagram'), ''), direccion = trim(p ->> 'direccion'),
    dueno_nombre = trim(p ->> 'dueno_nombre'), dueno_dni = trim(p ->> 'dueno_dni'),
    logo_ruta = coalesce(nullif(p ->> 'logo_ruta', ''), logo_ruta),
    color_primario = coalesce(nullif(p ->> 'color_primario', ''), color_primario),
    color_secundario = coalesce(nullif(p ->> 'color_secundario', ''), color_secundario),
    datos_completos = true
  where id = v_neg;
  insert into public.negocio_servicio (negocio_id, accion, actor)
  values (v_neg, 'Datos del negocio completados por el administrador', public.nombre_actor());
end;
$$;

-- Resumen de todos los negocios para el panel del super administrador
create or replace function public.resumen_negocios()
returns table (
  id uuid, codigo text, nombre text, logo_ruta text, color_primario text, color_secundario text,
  servicio_estado text, servicio_inicio date, servicio_fin date, creado timestamptz, datos_completos boolean,
  n_admins bigint, n_couriers bigint, n_clientes bigint, n_productos bigint, unidades bigint,
  n_pedidos bigint, n_creados bigint, n_empaquetados bigint, n_cerrados bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_super() then
    raise exception 'Solo el super administrador puede ver el resumen.' using errcode = '42501';
  end if;
  return query
    select n.id, n.codigo, n.nombre, n.logo_ruta, n.color_primario, n.color_secundario,
           n.servicio_estado, n.servicio_inicio, n.servicio_fin, n.creado, n.datos_completos,
           (select count(*) from public.administradores a where a.negocio_id = n.id),
           (select count(*) from public.couriers c where c.negocio_id = n.id),
           (select count(*) from public.clientes c where c.negocio_id = n.id),
           (select count(*) from public.productos p where p.negocio_id = n.id),
           (select coalesce(sum(p.cantidad), 0) from public.productos p where p.negocio_id = n.id),
           (select count(*) from public.pedidos x where x.negocio_id = n.id),
           (select count(*) from public.pedidos x where x.negocio_id = n.id and x.estado = 'creado'),
           (select count(*) from public.pedidos x where x.negocio_id = n.id and x.estado = 'empaquetado'),
           (select count(*) from public.pedidos x where x.negocio_id = n.id and x.estado = 'cerrado')
      from public.negocios n
     order by n.nombre;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Reglas de acceso a pedidos y fotos (por negocio)
-- ---------------------------------------------------------------------
create or replace function public.puede_ver_pedido(p_pedido uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_pedido
      and ( public.es_super()
         or p.negocio_id = public.admin_negocio()
         or (p.negocio_id = public.courier_negocio() and p.estado <> 'cerrado')
         or (p.cliente_id is not null and p.cliente_id = public.mi_cliente_id()) )
  );
$$;

create or replace function public.evidencia_visible(p_pedido uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_pedido
      and ( public.es_super()
         or p.negocio_id = public.admin_negocio()
         or (p.negocio_id = public.courier_negocio() and p.estado <> 'cerrado')
         or (p_tipo in ('motorizado','boleta') and p.cliente_id is not null and p.cliente_id = public.mi_cliente_id()) )
  );
$$;

create or replace function public.puede_subir_evidencia(p_pedido uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_pedido
      and ( public.es_super() or p.negocio_id = public.admin_negocio() or p.negocio_id = public.courier_negocio() )
      and ( (p.estado = 'creado' and p_tipo in ('productos','empaquetado'))
         or (p.estado = 'empaquetado' and (
               (p.envio = 'motorizado' and p_tipo = 'motorizado')
            or (p.envio = 'shalom' and p_tipo = 'boleta'))) )
  );
$$;

create or replace function public.archivo_visible(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super()
      or (public.ruta_pedido(p_ruta) is not null
          and public.evidencia_visible(public.ruta_pedido(p_ruta), split_part(p_ruta, '/', 2)));
$$;

-- Borrar fotos: en su etapa, o el administrador/super antes de eliminar el pedido completo
create or replace function public.archivo_borrable(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super()
      or public.archivo_subible(p_ruta)
      or exists (select 1 from public.pedidos p
                 where p.id = public.ruta_pedido(p_ruta) and p.negocio_id = public.admin_negocio());
$$;

-- ---------------------------------------------------------------------
-- 10. Seguridad por fila (RLS)
-- ---------------------------------------------------------------------
alter table public.negocios          enable row level security;
alter table public.negocio_servicio  enable row level security;
alter table public.superadmins       enable row level security;
alter table public.super_sesiones    enable row level security;
alter table public.super_intentos    enable row level security;
alter table public.ingreso_intentos  enable row level security;
alter table public.accesos           enable row level security;

drop policy if exists "negocios: super" on public.negocios;
create policy "negocios: super" on public.negocios
  for all to authenticated using ((select public.es_super())) with check ((select public.es_super()));

drop policy if exists "negocio_servicio: super" on public.negocio_servicio;
create policy "negocio_servicio: super" on public.negocio_servicio
  for select to authenticated using ((select public.es_super()));

drop policy if exists "superadmins: se ve a sí mismo" on public.superadmins;
create policy "superadmins: se ve a sí mismo" on public.superadmins
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "administradores: se ven a sí mismos" on public.administradores;
drop policy if exists "administradores: lectura" on public.administradores;
create policy "administradores: lectura" on public.administradores
  for select to authenticated using (user_id = (select auth.uid()) or (select public.es_super()));

drop policy if exists "couriers: ve su ficha" on public.couriers;
drop policy if exists "couriers: lectura" on public.couriers;
create policy "couriers: lectura" on public.couriers
  for select to authenticated using (
    user_id = (select auth.uid()) or (select public.es_super()) or negocio_id = (select public.admin_negocio()));

drop policy if exists "clientes: administrador" on public.clientes;
drop policy if exists "clientes: ve su ficha" on public.clientes;
drop policy if exists "clientes: gestion" on public.clientes;
drop policy if exists "clientes: su ficha" on public.clientes;
create policy "clientes: gestion" on public.clientes
  for all to authenticated
  using ((select public.es_super()) or negocio_id = (select public.admin_negocio()))
  with check ((select public.es_super()) or negocio_id = (select public.admin_negocio()));
create policy "clientes: su ficha" on public.clientes
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "productos: administrador" on public.productos;
drop policy if exists "productos: gestion" on public.productos;
create policy "productos: gestion" on public.productos
  for all to authenticated
  using ((select public.es_super()) or negocio_id = (select public.admin_negocio()))
  with check ((select public.es_super()) or negocio_id = (select public.admin_negocio()));

drop policy if exists "pedidos: lectura" on public.pedidos;
create policy "pedidos: lectura" on public.pedidos
  for select to authenticated using (
    (select public.es_super())
    or negocio_id = (select public.admin_negocio())
    or (negocio_id = (select public.courier_negocio()) and estado <> 'cerrado')
    or (cliente_id is not null and cliente_id = (select public.mi_cliente_id()))
  );

drop policy if exists "pedido_eventos: administrador" on public.pedido_eventos;
create policy "pedido_eventos: administrador" on public.pedido_eventos
  for select to authenticated using (
    exists (select 1 from public.pedidos p where p.id = pedido_id
            and ((select public.es_super()) or p.negocio_id = (select public.admin_negocio()))));

drop policy if exists "evidencias: quitar" on public.evidencias;
create policy "evidencias: quitar" on public.evidencias
  for delete to authenticated using (
    public.puede_subir_evidencia(pedido_id, tipo)
    or exists (select 1 from public.pedidos p where p.id = pedido_id
               and ((select public.es_super()) or p.negocio_id = (select public.admin_negocio()))));

-- ---------------------------------------------------------------------
-- 11. Pedidos: guardar (con stock, vendedor, precios y boleta), eliminar y pasos del courier
-- ---------------------------------------------------------------------
drop function if exists public.guardar_pedido(uuid, uuid, text, text, jsonb);

create or replace function public.guardar_pedido(
  p_id uuid, p_cliente_id uuid, p_direccion text, p_envio text, p_items jsonb,
  p_courier uuid default null, p_negocio uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_neg      uuid;
  v_ant      public.pedidos%rowtype;
  v_cliente  public.clientes%rowtype;
  v_courier  public.couriers%rowtype;
  v_prod     public.productos%rowtype;
  v_negocio  public.negocios%rowtype;
  v_item     record;
  v_id       uuid;
  v_num      integer;
  v_cambios  text[] := '{}';
  v_total    integer := 0;
begin
  if p_id is not null then
    select * into v_ant from public.pedidos where id = p_id for update;
    if not found then raise exception 'Este pedido ya no existe.'; end if;
    v_neg := v_ant.negocio_id;
  else
    v_neg := case when public.es_super() then p_negocio else public.admin_negocio() end;
  end if;
  if not public.gestiona_negocio(v_neg) then
    raise exception 'Solo el administrador del negocio puede guardar pedidos.' using errcode = '42501';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id and negocio_id = v_neg;
  if not found then raise exception 'Elige un cliente.'; end if;
  if coalesce(trim(p_direccion), '') = '' then raise exception 'Escribe la dirección de entrega.'; end if;
  if p_envio is null or p_envio not in ('motorizado','shalom') then
    raise exception 'Elige si el envío es por motorizado o por Shalom.';
  end if;
  if p_courier is not null then
    select * into v_courier from public.couriers where user_id = p_courier and negocio_id = v_neg;
    if not found then raise exception 'El courier elegido no es de este negocio.'; end if;
  end if;
  if p_id is not null and v_ant.estado = 'cerrado' and p_envio <> v_ant.envio then
    raise exception 'El pedido ya está cerrado: no se puede cambiar el tipo de envío.';
  end if;

  if p_id is null or p_items is not null then
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Agrega al menos un producto al pedido.';
    end if;
    if p_id is not null and v_ant.estado <> 'creado' then
      raise exception 'Los productos ya no se pueden cambiar porque el pedido ya fue empaquetado.';
    end if;
  end if;

  if p_id is null then
    update public.negocios set ultimo_pedido = ultimo_pedido + 1 where id = v_neg
    returning * into v_negocio;
    v_num := v_negocio.ultimo_pedido;
    insert into public.pedidos (negocio_id, numero, cliente_id, cliente_dni, cliente_nombre, direccion, envio,
                                courier_id, vendedor_nombre, creado_por, boleta)
    values (v_neg, v_num, v_cliente.id, v_cliente.dni, v_cliente.nombres || ' ' || v_cliente.apellidos,
            trim(p_direccion), p_envio, p_courier, v_courier.nombre, public.nombre_actor(),
            jsonb_build_object('nombre', v_negocio.nombre, 'ruc', v_negocio.ruc, 'telefono', v_negocio.telefono,
                               'instagram', v_negocio.instagram, 'direccion', v_negocio.direccion,
                               'logo_ruta', v_negocio.logo_ruta, 'color_primario', v_negocio.color_primario,
                               'color_secundario', v_negocio.color_secundario))
    returning id into v_id;
  else
    v_id := p_id;
    if v_ant.cliente_id is distinct from v_cliente.id then v_cambios := v_cambios || 'cliente'::text; end if;
    if v_ant.direccion is distinct from trim(p_direccion) then v_cambios := v_cambios || 'dirección'::text; end if;
    if v_ant.envio is distinct from p_envio then v_cambios := v_cambios || 'tipo de envío'::text; end if;
    if v_ant.courier_id is distinct from p_courier then v_cambios := v_cambios || 'vendedor'::text; end if;
    update public.pedidos
       set cliente_id = v_cliente.id,
           cliente_dni = v_cliente.dni,
           cliente_nombre = v_cliente.nombres || ' ' || v_cliente.apellidos,
           direccion = trim(p_direccion),
           envio = p_envio,
           courier_id = p_courier,
           vendedor_nombre = v_courier.nombre
     where id = v_id;
  end if;

  if p_items is not null then
    if p_id is not null then
      update public.productos pr
         set cantidad = pr.cantidad + s.total
        from (select producto_id, sum(cantidad)::int as total
                from public.pedido_items
               where pedido_id = v_id and producto_id is not null
               group by producto_id) s
       where pr.id = s.producto_id;
      delete from public.pedido_items where pedido_id = v_id;
      v_cambios := v_cambios || 'productos'::text;
    end if;

    for v_item in
      select (e ->> 'producto_id')::uuid as producto_id,
             sum((e ->> 'cantidad')::int)::int as cantidad,
             max(nullif(e ->> 'precio', '')::numeric) as precio,
             min(ord)::int as orden
        from jsonb_array_elements(p_items) with ordinality as t(e, ord)
       group by 1
       order by 1
    loop
      if v_item.producto_id is null then raise exception 'Hay un producto sin elegir en el pedido.'; end if;
      if v_item.cantidad is null or v_item.cantidad <= 0 then
        raise exception 'La cantidad de cada producto debe ser mayor que cero.';
      end if;
      if v_item.precio is not null and v_item.precio < 0 then
        raise exception 'El precio no puede ser negativo.';
      end if;
      select * into v_prod from public.productos where id = v_item.producto_id and negocio_id = v_neg for update;
      if not found then raise exception 'Uno de los productos ya no existe en el inventario.'; end if;
      if v_prod.cantidad < v_item.cantidad then
        raise exception 'No hay suficiente stock de «%»: quedan % y el pedido necesita %.',
          v_prod.nombre, v_prod.cantidad, v_item.cantidad;
      end if;
      update public.productos
         set cantidad = cantidad - v_item.cantidad,
             precio_ref = coalesce(v_item.precio, precio_ref)
       where id = v_prod.id;
      insert into public.pedido_items (pedido_id, producto_id, nombre, descripcion, cantidad, precio, orden)
      values (v_id, v_prod.id, v_prod.nombre, v_prod.descripcion, v_item.cantidad, round(v_item.precio, 2), v_item.orden);
      v_total := v_total + v_item.cantidad;
    end loop;
  end if;

  if p_id is null then
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (v_id, 'Pedido creado',
            v_total || ' unidades · envío por ' || case p_envio when 'shalom' then 'Shalom' else 'motorizado' end
              || coalesce(' · vendedor: ' || v_courier.nombre, ''),
            public.nombre_actor());
  elsif array_length(v_cambios, 1) > 0 then
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (v_id, 'Pedido editado', 'Cambió: ' || array_to_string(v_cambios, ', '), public.nombre_actor());
  end if;

  return v_id;
end;
$$;

create or replace function public.eliminar_pedido(p_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_ped   public.pedidos%rowtype;
  v_rutas text[];
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then return '{}'; end if;
  if not public.gestiona_negocio(v_ped.negocio_id) then
    raise exception 'Solo el administrador del negocio puede eliminar pedidos.' using errcode = '42501';
  end if;
  if v_ped.estado <> 'cerrado' then
    update public.productos pr
       set cantidad = pr.cantidad + s.total
      from (select producto_id, sum(cantidad)::int as total
              from public.pedido_items
             where pedido_id = p_id and producto_id is not null
             group by producto_id) s
     where pr.id = s.producto_id;
  end if;
  select coalesce(array_agg(ruta), '{}') into v_rutas from public.evidencias where pedido_id = p_id;
  delete from public.pedidos where id = p_id;
  return v_rutas;
end;
$$;

create or replace function public.marcar_empaquetado(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ped  public.pedidos%rowtype;
  v_np   integer;
  v_ne   integer;
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Este pedido ya no existe.'; end if;
  if not (public.es_super() or v_ped.negocio_id = public.admin_negocio() or v_ped.negocio_id = public.courier_negocio()) then
    raise exception 'Tu cuenta no puede empaquetar este pedido.' using errcode = '42501';
  end if;
  if v_ped.estado <> 'creado' then raise exception 'Este pedido ya fue empaquetado.'; end if;
  select count(*) filter (where tipo = 'productos'), count(*) filter (where tipo = 'empaquetado')
    into v_np, v_ne from public.evidencias where pedido_id = p_id;
  if v_np = 0 then raise exception 'Falta al menos una foto en «Evidencia de productos».'; end if;
  if v_ne = 0 then raise exception 'Falta al menos una foto en «Evidencia de pedido empaquetado».'; end if;
  update public.pedidos
     set estado = 'empaquetado', empaquetado_en = now(), empaquetado_por = public.nombre_actor()
   where id = p_id;
  insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
  values (p_id, 'Pedido empaquetado',
          v_np || case when v_np = 1 then ' foto' else ' fotos' end || ' de productos y '
            || v_ne || case when v_ne = 1 then ' foto' else ' fotos' end || ' del paquete',
          public.nombre_actor());
end;
$$;

create or replace function public.cerrar_pedido(p_id uuid, p_clave text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ped  public.pedidos%rowtype;
  v_n    integer;
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Este pedido ya no existe.'; end if;
  if not (public.es_super() or v_ped.negocio_id = public.admin_negocio() or v_ped.negocio_id = public.courier_negocio()) then
    raise exception 'Tu cuenta no puede cerrar este pedido.' using errcode = '42501';
  end if;
  if v_ped.estado = 'creado' then raise exception 'Primero hay que empaquetar el pedido.'; end if;
  if v_ped.estado = 'cerrado' then raise exception 'Este pedido ya está cerrado.'; end if;
  if v_ped.envio = 'motorizado' then
    select count(*) into v_n from public.evidencias where pedido_id = p_id and tipo = 'motorizado';
    if v_n = 0 then raise exception 'Falta al menos una foto del motorizado con el pedido.'; end if;
    update public.pedidos
       set estado = 'cerrado', cerrado_en = now(), cerrado_por = public.nombre_actor()
     where id = p_id;
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (p_id, 'Entregado al motorizado',
            v_n || case when v_n = 1 then ' foto' else ' fotos' end || ' del motorizado con el pedido',
            public.nombre_actor());
  else
    select count(*) into v_n from public.evidencias where pedido_id = p_id and tipo = 'boleta';
    if v_n = 0 then raise exception 'Falta la foto de la boleta de Shalom.'; end if;
    if coalesce(trim(p_clave), '') = '' then raise exception 'Escribe la clave de Shalom.'; end if;
    update public.pedidos
       set estado = 'cerrado', shalom_clave = trim(p_clave), cerrado_en = now(), cerrado_por = public.nombre_actor()
     where id = p_id;
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (p_id, 'Enviado por Shalom', 'Clave de recojo: ' || trim(p_clave), public.nombre_actor());
  end if;
end;
$$;

-- Pedidos que ya existían: su boleta toma los datos actuales del negocio
update public.pedidos p
   set boleta = jsonb_build_object('nombre', n.nombre, 'ruc', n.ruc, 'telefono', n.telefono,
                                   'instagram', n.instagram, 'direccion', n.direccion, 'logo_ruta', n.logo_ruta,
                                   'color_primario', n.color_primario, 'color_secundario', n.color_secundario)
  from public.negocios n
 where n.id = p.negocio_id and p.boleta is null;

-- ---------------------------------------------------------------------
-- 12. Logos de los negocios (depósito público: el logo sale en las boletas)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- El super sube logos de cualquier negocio; el administrador solo mientras completa sus datos.
create or replace function public.puede_subir_logo(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_super() or exists (
    select 1 from public.negocios n
    where n.id = public.admin_negocio() and not n.datos_completos
      and split_part(p_ruta, '/', 1) = n.id::text);
$$;

drop policy if exists "logos: subir" on storage.objects;
create policy "logos: subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos' and public.puede_subir_logo(name));
drop policy if exists "logos: borrar" on storage.objects;
create policy "logos: borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'logos' and public.es_super());

drop policy if exists "evidencias: borrar fotos" on storage.objects;
create policy "evidencias: borrar fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'evidencias' and public.archivo_borrable(name));

-- ---------------------------------------------------------------------
-- 13. Permisos de ejecución
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'es_super()','admin_negocio()','courier_negocio()','es_admin()','es_courier()','mi_cliente_id()',
    'gestiona_negocio(uuid)','nombre_actor()','mi_perfil()','mi_negocio_marca()',
    'verificar_codigo_super(text)','ver_clave(uuid)','accesos_negocio(uuid)',
    'guardar_negocio(uuid, jsonb)','completar_negocio(jsonb)','resumen_negocios()',
    'puede_ver_pedido(uuid)','evidencia_visible(uuid, text)','puede_subir_evidencia(uuid, text)',
    'ruta_pedido(text)','archivo_visible(text)','archivo_subible(text)','archivo_borrable(text)','puede_subir_logo(text)',
    'guardar_pedido(uuid, uuid, text, text, jsonb, uuid, uuid)','eliminar_pedido(uuid)',
    'marcar_empaquetado(uuid)','cerrar_pedido(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Las usa la pantalla de ingreso (sin sesión)
revoke all on function public.negocio_publico(text) from public;
grant execute on function public.negocio_publico(text) to anon, authenticated;
revoke all on function public.cuentas_por_dni(text, text, text) from public;
grant execute on function public.cuentas_por_dni(text, text, text) to anon, authenticated;

-- Solo para la función "usuarios" (clave de servicio)
revoke all on function privado.clave_accesos() from public, anon, authenticated;
revoke all on function public.guardar_clave(uuid, text) from public, anon, authenticated;
grant execute on function public.guardar_clave(uuid, text) to service_role;
revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;

select 'Listo: sistema multinegocio instalado' as resultado;
