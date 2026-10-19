-- =====================================================================
-- Importadora Rapiiflash · Sistema de pedidos
-- 01 · Esquema: tablas, seguridad, stock, estados y fotos
--
-- Cómo usarlo: en Supabase → SQL Editor → New query, pega TODO este
-- archivo y presiona "Run". Se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Cuentas
--    Administradores y couriers entran con correo (cuentas creadas por el
--    equipo técnico). Los clientes entran con DNI + contraseña (la cuenta
--    la crea el administrador desde la web).
-- ---------------------------------------------------------------------
create table if not exists public.administradores (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text not null,
  nombre   text not null default 'Administrador',
  creado   timestamptz not null default now()
);

create table if not exists public.clientes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null,
  dni          text not null,
  nombres      text not null,
  apellidos    text not null,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  constraint clientes_dni_ck check (dni ~ '^[0-9A-Z]{6,15}$')
);
create unique index if not exists clientes_dni_uq on public.clientes (dni);

-- Couriers: cuentas con correo, creadas por el equipo técnico (no desde la web)
create table if not exists public.couriers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text not null,
  nombre   text not null default 'Courier',
  creado   timestamptz not null default now()
);

-- ¿Quién está conectado?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

create or replace function public.mi_cliente_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clientes where user_id = auth.uid();
$$;

create or replace function public.es_courier()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couriers where user_id = auth.uid());
$$;

-- Nombre que queda registrado en el historial del pedido
create or replace function public.nombre_actor()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when lower(nombre) like 'administrador%' then nombre else nombre || ' · administrador' end
       from public.administradores where user_id = auth.uid()),
    (select case when lower(nombre) like 'courier%' then nombre else nombre || ' · courier' end
       from public.couriers where user_id = auth.uid()),
    'Sistema'
  );
$$;

-- Perfil de quien inició sesión (lo usa la web para saber qué vista mostrar)
create or replace function public.mi_perfil()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('rol','admin','nombre',nombre,'email',email)
       from public.administradores where user_id = auth.uid()),
    (select jsonb_build_object('rol','courier','nombre',nombre,'email',email)
       from public.couriers where user_id = auth.uid()),
    (select jsonb_build_object('rol','cliente','id',id,'nombre',nombres || ' ' || apellidos,'nombres',nombres,'dni',dni)
       from public.clientes where user_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Inventario
-- ---------------------------------------------------------------------
create table if not exists public.productos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(trim(nombre)) > 0),
  descripcion  text,
  cantidad     integer not null default 0 check (cantidad >= 0),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Pedidos
--    Estados: creado → empaquetado → cerrado
--    Se guarda una copia del DNI y nombre del cliente para que el pedido
--    siga legible aunque el cliente se elimine.
-- ---------------------------------------------------------------------
create sequence if not exists public.pedidos_numero_seq start 1001;

create table if not exists public.pedidos (
  id              uuid primary key default gen_random_uuid(),
  numero          integer not null unique default nextval('public.pedidos_numero_seq'),
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_dni     text not null,
  cliente_nombre  text not null,
  direccion       text not null,
  envio           text not null check (envio in ('motorizado','shalom')),
  estado          text not null default 'creado' check (estado in ('creado','empaquetado','cerrado')),
  shalom_clave    text,
  creado          timestamptz not null default now(),
  creado_por      text,
  empaquetado_en  timestamptz,
  empaquetado_por text,
  cerrado_en      timestamptz,
  cerrado_por     text,
  actualizado     timestamptz not null default now()
);
alter sequence public.pedidos_numero_seq owned by public.pedidos.numero;
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id);
create index if not exists pedidos_estado_idx on public.pedidos (estado);

create table if not exists public.pedido_items (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.pedidos(id) on delete cascade,
  producto_id  uuid references public.productos(id) on delete set null,
  nombre       text not null,
  descripcion  text,
  cantidad     integer not null check (cantidad > 0),
  orden        integer not null default 0
);
create index if not exists pedido_items_pedido_idx on public.pedido_items (pedido_id);
create index if not exists pedido_items_producto_idx on public.pedido_items (producto_id);

-- Fotos: productos, empaquetado, motorizado y boleta (Shalom)
create table if not exists public.evidencias (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  tipo        text not null check (tipo in ('productos','empaquetado','motorizado','boleta')),
  ruta        text not null unique,
  subido_por  text,
  subido_uid  uuid default auth.uid(),
  creado      timestamptz not null default now()
);
create index if not exists evidencias_pedido_idx on public.evidencias (pedido_id);

-- Historial de cada pedido (solo lo ve el administrador)
create table if not exists public.pedido_eventos (
  id         bigint generated always as identity primary key,
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  accion     text not null,
  detalle    text,
  actor      text,
  creado     timestamptz not null default now()
);
create index if not exists pedido_eventos_pedido_idx on public.pedido_eventos (pedido_id);

-- ---------------------------------------------------------------------
-- 4. Reglas de acceso a pedidos y fotos
-- ---------------------------------------------------------------------
create or replace function public.puede_ver_pedido(p_pedido uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_pedido
      and ( public.es_admin()
         or (public.es_courier() and p.estado <> 'cerrado')
         or (p.cliente_id is not null and p.cliente_id = public.mi_cliente_id()) )
  );
$$;

-- El cliente solo ve la foto del motorizado o la boleta de Shalom.
create or replace function public.evidencia_visible(p_pedido uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.es_admin() then true
    when public.es_courier() then exists (select 1 from public.pedidos where id = p_pedido and estado <> 'cerrado')
    else p_tipo in ('motorizado','boleta') and exists (
      select 1 from public.pedidos
      where id = p_pedido and cliente_id is not null and cliente_id = public.mi_cliente_id())
  end;
$$;

-- Cada foto solo se puede subir (o quitar) en su etapa:
--   pedido creado      → productos y empaquetado
--   pedido empaquetado → motorizado (si va por motorizado) o boleta (si va por Shalom)
create or replace function public.puede_subir_evidencia(p_pedido uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.es_admin() or public.es_courier()) and exists (
    select 1 from public.pedidos p
    where p.id = p_pedido and (
         (p.estado = 'creado' and p_tipo in ('productos','empaquetado'))
      or (p.estado = 'empaquetado' and (
            (p.envio = 'motorizado' and p_tipo = 'motorizado')
         or (p.envio = 'shalom' and p_tipo = 'boleta')))
    )
  );
$$;

-- Ruta de archivo: <pedido_id>/<tipo>/<nombre>.jpg
create or replace function public.ruta_pedido(p_ruta text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(p_ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_ruta, '/', 1)::uuid end;
$$;

create or replace function public.archivo_visible(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
      or (public.ruta_pedido(p_ruta) is not null
          and public.evidencia_visible(public.ruta_pedido(p_ruta), split_part(p_ruta, '/', 2)));
$$;

create or replace function public.archivo_subible(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.ruta_pedido(p_ruta) is not null
     and public.puede_subir_evidencia(public.ruta_pedido(p_ruta), split_part(p_ruta, '/', 2));
$$;

-- ---------------------------------------------------------------------
-- 5. Fechas de modificación y copias del cliente
-- ---------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clientes','productos','pedidos'] loop
    
    execute format('create or replace trigger %I before update on public.%I for each row execute function public.tocar_actualizado()', t || '_actualizado', t);
  end loop;
end $$;

-- Si el administrador corrige el nombre o DNI de un cliente, sus pedidos se actualizan.
create or replace function public.sincronizar_cliente_en_pedidos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dni is distinct from old.dni or new.nombres is distinct from old.nombres or new.apellidos is distinct from old.apellidos then
    update public.pedidos
       set cliente_dni = new.dni, cliente_nombre = new.nombres || ' ' || new.apellidos
     where cliente_id = new.id;
  end if;
  return new;
end;
$$;

create or replace trigger clientes_sincronizar after update on public.clientes
  for each row execute function public.sincronizar_cliente_en_pedidos();

-- Quién subió cada foto, y registro cuando alguien la quita
create or replace function public.evidencia_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.subido_por := public.nombre_actor();
  new.subido_uid := auth.uid();
  new.creado := now();
  return new;
end;
$$;

create or replace trigger evidencias_autor before insert on public.evidencias
  for each row execute function public.evidencia_autor();

create or replace function public.evidencia_borrada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pedidos where id = old.pedido_id) then
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (old.pedido_id, 'Foto eliminada',
            case old.tipo when 'productos' then 'Evidencia de productos'
                          when 'empaquetado' then 'Evidencia de pedido empaquetado'
                          when 'motorizado' then 'Evidencia del motorizado'
                          else 'Boleta de Shalom' end,
            public.nombre_actor());
  end if;
  return old;
end;
$$;

create or replace trigger evidencias_borrada after delete on public.evidencias
  for each row execute function public.evidencia_borrada();

-- ---------------------------------------------------------------------
-- 6. Seguridad por fila (RLS)
-- ---------------------------------------------------------------------
alter table public.administradores enable row level security;
alter table public.clientes        enable row level security;
alter table public.couriers        enable row level security;
alter table public.productos       enable row level security;
alter table public.pedidos         enable row level security;
alter table public.pedido_items    enable row level security;
alter table public.evidencias      enable row level security;
alter table public.pedido_eventos  enable row level security;

drop policy if exists "administradores: se ven a sí mismos" on public.administradores;
create policy "administradores: se ven a sí mismos" on public.administradores
  for select to authenticated using (user_id = (select auth.uid()));

-- Clientes: el administrador gestiona; cada cliente ve su propia ficha
drop policy if exists "clientes: administrador" on public.clientes;
create policy "clientes: administrador" on public.clientes
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "clientes: ve su ficha" on public.clientes;
create policy "clientes: ve su ficha" on public.clientes
  for select to authenticated using (user_id = (select auth.uid()));

-- Couriers: cada uno ve su ficha (las cuentas se crean fuera de la web)
drop policy if exists "couriers: ve su ficha" on public.couriers;
create policy "couriers: ve su ficha" on public.couriers
  for select to authenticated using (user_id = (select auth.uid()));

-- Inventario: solo el administrador
drop policy if exists "productos: administrador" on public.productos;
create policy "productos: administrador" on public.productos
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- Pedidos: se leen según el rol; se escriben solo con las funciones de abajo
drop policy if exists "pedidos: lectura" on public.pedidos;
create policy "pedidos: lectura" on public.pedidos
  for select to authenticated using (
    (select public.es_admin())
    or ((select public.es_courier()) and estado <> 'cerrado')
    or (cliente_id is not null and cliente_id = (select public.mi_cliente_id()))
  );

drop policy if exists "pedido_items: lectura" on public.pedido_items;
create policy "pedido_items: lectura" on public.pedido_items
  for select to authenticated using (public.puede_ver_pedido(pedido_id));

drop policy if exists "evidencias: lectura" on public.evidencias;
create policy "evidencias: lectura" on public.evidencias
  for select to authenticated using (public.evidencia_visible(pedido_id, tipo));
drop policy if exists "evidencias: subir" on public.evidencias;
create policy "evidencias: subir" on public.evidencias
  for insert to authenticated with check (
    public.puede_subir_evidencia(pedido_id, tipo)
    and ruta like pedido_id::text || '/' || tipo || '/%'
  );
drop policy if exists "evidencias: quitar" on public.evidencias;
create policy "evidencias: quitar" on public.evidencias
  for delete to authenticated using ((select public.es_admin()) or public.puede_subir_evidencia(pedido_id, tipo));

drop policy if exists "pedido_eventos: administrador" on public.pedido_eventos;
create policy "pedido_eventos: administrador" on public.pedido_eventos
  for select to authenticated using ((select public.es_admin()));

-- ---------------------------------------------------------------------
-- 7. Guardar pedido (crear o editar) con control de stock
--    p_items: [{"producto_id": "...", "cantidad": 10}, ...]
--    Al editar, p_items = null deja los productos como están.
-- ---------------------------------------------------------------------
create or replace function public.guardar_pedido(
  p_id uuid, p_cliente_id uuid, p_direccion text, p_envio text, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ant      public.pedidos%rowtype;
  v_cliente  public.clientes%rowtype;
  v_prod     public.productos%rowtype;
  v_item     record;
  v_id       uuid;
  v_cambios  text[] := '{}';
  v_total    integer := 0;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede guardar pedidos.' using errcode = '42501';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then raise exception 'Elige un cliente.'; end if;
  if coalesce(trim(p_direccion), '') = '' then raise exception 'Escribe la dirección de entrega.'; end if;
  if p_envio is null or p_envio not in ('motorizado','shalom') then
    raise exception 'Elige si el envío es por motorizado o por Shalom.';
  end if;

  if p_id is not null then
    select * into v_ant from public.pedidos where id = p_id for update;
    if not found then raise exception 'Este pedido ya no existe.'; end if;
    if v_ant.estado = 'cerrado' and p_envio <> v_ant.envio then
      raise exception 'El pedido ya está cerrado: no se puede cambiar el tipo de envío.';
    end if;
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
    insert into public.pedidos (cliente_id, cliente_dni, cliente_nombre, direccion, envio, creado_por)
    values (v_cliente.id, v_cliente.dni, v_cliente.nombres || ' ' || v_cliente.apellidos,
            trim(p_direccion), p_envio, public.nombre_actor())
    returning id into v_id;
  else
    v_id := p_id;
    if v_ant.cliente_id is distinct from v_cliente.id then v_cambios := v_cambios || 'cliente'::text; end if;
    if v_ant.direccion is distinct from trim(p_direccion) then v_cambios := v_cambios || 'dirección'::text; end if;
    if v_ant.envio is distinct from p_envio then v_cambios := v_cambios || 'tipo de envío'::text; end if;
    update public.pedidos
       set cliente_id = v_cliente.id,
           cliente_dni = v_cliente.dni,
           cliente_nombre = v_cliente.nombres || ' ' || v_cliente.apellidos,
           direccion = trim(p_direccion),
           envio = p_envio
     where id = v_id;
  end if;

  if p_items is not null then
    -- Devolver al inventario lo que tenía el pedido antes de editarlo
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

    -- Descontar del inventario (agrupado por producto, en orden fijo para evitar bloqueos)
    for v_item in
      select (e ->> 'producto_id')::uuid as producto_id,
             sum((e ->> 'cantidad')::int)::int as cantidad,
             min(ord)::int as orden
        from jsonb_array_elements(p_items) with ordinality as t(e, ord)
       group by 1
       order by 1
    loop
      if v_item.producto_id is null then raise exception 'Hay un producto sin elegir en el pedido.'; end if;
      if v_item.cantidad is null or v_item.cantidad <= 0 then
        raise exception 'La cantidad de cada producto debe ser mayor que cero.';
      end if;
      select * into v_prod from public.productos where id = v_item.producto_id for update;
      if not found then raise exception 'Uno de los productos ya no existe en el inventario.'; end if;
      if v_prod.cantidad < v_item.cantidad then
        raise exception 'No hay suficiente stock de «%»: quedan % y el pedido necesita %.',
          v_prod.nombre, v_prod.cantidad, v_item.cantidad;
      end if;
      update public.productos set cantidad = cantidad - v_item.cantidad where id = v_prod.id;
      insert into public.pedido_items (pedido_id, producto_id, nombre, descripcion, cantidad, orden)
      values (v_id, v_prod.id, v_prod.nombre, v_prod.descripcion, v_item.cantidad, v_item.orden);
      v_total := v_total + v_item.cantidad;
    end loop;
  end if;

  if p_id is null then
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (v_id, 'Pedido creado',
            v_total || ' unidades · envío por ' || case p_envio when 'shalom' then 'Shalom' else 'motorizado' end,
            public.nombre_actor());
  elsif array_length(v_cambios, 1) > 0 then
    insert into public.pedido_eventos (pedido_id, accion, detalle, actor)
    values (v_id, 'Pedido editado', 'Cambió: ' || array_to_string(v_cambios, ', '), public.nombre_actor());
  end if;

  return v_id;
end;
$$;

-- Eliminar pedido. Si aún no se despachó, los productos vuelven al inventario.
-- Devuelve las rutas de las fotos para que la web las borre del depósito.
create or replace function public.eliminar_pedido(p_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_ped   public.pedidos%rowtype;
  v_rutas text[];
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede eliminar pedidos.' using errcode = '42501';
  end if;
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then return '{}'; end if;

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

-- ---------------------------------------------------------------------
-- 8. Pasos del courier
-- ---------------------------------------------------------------------
create or replace function public.marcar_empaquetado(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ped  public.pedidos%rowtype;
  v_np   integer;
  v_ne   integer;
begin
  if not (public.es_admin() or public.es_courier()) then
    raise exception 'Tu cuenta no puede empaquetar pedidos.' using errcode = '42501';
  end if;
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Este pedido ya no existe.'; end if;
  if v_ped.estado <> 'creado' then raise exception 'Este pedido ya fue empaquetado.'; end if;

  select count(*) filter (where tipo = 'productos'), count(*) filter (where tipo = 'empaquetado')
    into v_np, v_ne
    from public.evidencias where pedido_id = p_id;
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
  if not (public.es_admin() or public.es_courier()) then
    raise exception 'Tu cuenta no puede cerrar pedidos.' using errcode = '42501';
  end if;
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Este pedido ya no existe.'; end if;
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

-- Lo usa la función "usuarios" (con la clave de servicio) para recuperar
-- una cuenta que quedó sin ficha.
create or replace function public.usuario_por_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Permisos de ejecución
do $$
declare f text;
begin
  foreach f in array array[
    'es_admin()','mi_cliente_id()','es_courier()','nombre_actor()','mi_perfil()',
    'puede_ver_pedido(uuid)','evidencia_visible(uuid, text)','puede_subir_evidencia(uuid, text)',
    'ruta_pedido(text)','archivo_visible(text)','archivo_subible(text)',
    'guardar_pedido(uuid, uuid, text, text, jsonb)','eliminar_pedido(uuid)',
    'marcar_empaquetado(uuid)','cerrar_pedido(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;

revoke all on function public.sincronizar_cliente_en_pedidos() from public, anon, authenticated;
revoke all on function public.evidencia_autor() from public, anon, authenticated;
revoke all on function public.evidencia_borrada() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Cambios en vivo (el courier ve aparecer pedidos nuevos)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pedidos','evidencias'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Depósito privado de fotos: "evidencias" (máx. 10 MB por foto)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias: ver fotos" on storage.objects;
create policy "evidencias: ver fotos" on storage.objects
  for select to authenticated using (bucket_id = 'evidencias' and public.archivo_visible(name));

drop policy if exists "evidencias: subir fotos" on storage.objects;
create policy "evidencias: subir fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'evidencias' and public.archivo_subible(name));

drop policy if exists "evidencias: borrar fotos" on storage.objects;
create policy "evidencias: borrar fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'evidencias' and (public.es_admin() or public.archivo_subible(name)));
