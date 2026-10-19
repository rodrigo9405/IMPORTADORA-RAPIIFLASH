// =====================================================================
// Importadora Rapiiflash · Función "usuarios"
// Crea, edita y elimina las cuentas de los clientes (DNI + contraseña).
// Solo la puede usar un administrador conectado.
//
// También tiene "alta_personal" para que el equipo técnico cree cuentas
// de administrador o courier (no se usa desde la web).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

// Los clientes entran con su DNI. Por dentro, cada DNI se convierte en un
// correo interno que nunca recibe mensajes (".invalid" no existe).
const DOMINIO_CLIENTES = 'clientes.rapiiflash.invalid';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const falla = (mensaje: string, status = 200) => responder({ ok: false, error: mensaje }, status);

function claveServicio(): string | undefined {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (k) return k;
  try {
    const s = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return s.default ?? (Object.values(s)[0] as string | undefined);
  } catch {
    return undefined;
  }
}

const limpiarDni = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const texto = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const correoCliente = (dni: string) => `cliente-${dni.toLowerCase()}@${DOMINIO_CLIENTES}`;

function traducir(err: { message?: string } | null | undefined): string {
  const m = err?.message ?? 'Error desconocido';
  if (/at least\s*6|should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/weak|pwned|known to be/i.test(m)) return 'Esa contraseña es muy fácil de adivinar. Elige otra.';
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return 'Ya existe una cuenta con esos datos.';
  if (/duplicate key|clientes_dni_uq/i.test(m)) return 'Ya existe un cliente con ese DNI.';
  return m;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return falla('Método no permitido.', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const servicio = claveServicio();
  if (!url || !servicio) return falla('La función no tiene configurada la clave de servicio.', 500);
  const sb = createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return falla('Solicitud inválida.', 400);
  }
  const accion = String(body.accion ?? '');

  // ¿Quién llama? (se verifica el token de su sesión)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let esAdmin = false;
  if (jwt) {
    const { data } = await sb.auth.getUser(jwt);
    if (data?.user) {
      const { data: fila } = await sb.from('administradores').select('user_id').eq('user_id', data.user.id).maybeSingle();
      esAdmin = !!fila;
    }
  }

  // Crea la cuenta de acceso; si ya existía una sin ficha, la reutiliza.
  async function crearAcceso(email: string, password: string, meta: Record<string, unknown>) {
    const { data, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: meta, app_metadata: meta,
    });
    if (!error && data?.user) return { id: data.user.id, nuevo: true };
    if (error && /already|exists|registered/i.test(error.message)) {
      const { data: idPrevio } = await sb.rpc('usuario_por_email', { p_email: email });
      if (idPrevio) {
        const r = await sb.auth.admin.updateUserById(idPrevio as string, { password, email_confirm: true });
        if (r.error) throw new Error(traducir(r.error));
        return { id: idPrevio as string, nuevo: false };
      }
    }
    throw new Error(traducir(error));
  }

  try {
    // ------------------------------------------------------------------
    // Clientes
    // ------------------------------------------------------------------
    if (accion === 'crear_cliente' || accion === 'editar_cliente' || accion === 'eliminar_cliente') {
      if (!esAdmin) return falla('Solo el administrador puede gestionar clientes.', 403);
    }

    if (accion === 'crear_cliente') {
      const dni = limpiarDni(body.dni);
      const nombres = texto(body.nombres);
      const apellidos = texto(body.apellidos);
      const password = String(body.password ?? '');
      if (!/^[0-9A-Z]{6,15}$/.test(dni)) return falla('El DNI debe tener entre 6 y 15 números o letras.');
      if (!nombres) return falla('Escribe el nombre del cliente.');
      if (!apellidos) return falla('Escribe los apellidos del cliente.');
      if (password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');

      const { data: existe } = await sb.from('clientes').select('id').eq('dni', dni).maybeSingle();
      if (existe) return falla(`Ya existe un cliente con el DNI ${dni}.`);

      const acceso = await crearAcceso(correoCliente(dni), password, { rol: 'cliente', dni });
      const { data: fila, error } = await sb.from('clientes')
        .insert({ user_id: acceso.id, dni, nombres, apellidos }).select().single();
      if (error) {
        if (acceso.nuevo) await sb.auth.admin.deleteUser(acceso.id);
        return falla(traducir(error));
      }
      return responder({ ok: true, cliente: fila });
    }

    if (accion === 'editar_cliente') {
      const id = String(body.id ?? '');
      const { data: actual } = await sb.from('clientes').select('*').eq('id', id).maybeSingle();
      if (!actual) return falla('Este cliente ya no existe.');

      const dni = limpiarDni(body.dni);
      const nombres = texto(body.nombres);
      const apellidos = texto(body.apellidos);
      const password = String(body.password ?? '');
      if (!/^[0-9A-Z]{6,15}$/.test(dni)) return falla('El DNI debe tener entre 6 y 15 números o letras.');
      if (!nombres) return falla('Escribe el nombre del cliente.');
      if (!apellidos) return falla('Escribe los apellidos del cliente.');
      if (password && password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');

      if (dni !== actual.dni) {
        const { data: otro } = await sb.from('clientes').select('id').eq('dni', dni).neq('id', id).maybeSingle();
        if (otro) return falla(`Ya existe otro cliente con el DNI ${dni}.`);
      }

      let userId: string | null = actual.user_id;
      let correoCambiado = false;
      if (!userId) {
        if (!password) return falla('Este cliente no tiene acceso. Escribe una contraseña para crearlo.');
        userId = (await crearAcceso(correoCliente(dni), password, { rol: 'cliente', dni })).id;
      } else {
        const cambios: Record<string, unknown> = {};
        if (dni !== actual.dni) { cambios.email = correoCliente(dni); cambios.email_confirm = true; correoCambiado = true; }
        if (password) cambios.password = password;
        if (Object.keys(cambios).length) {
          const r = await sb.auth.admin.updateUserById(userId, cambios);
          if (r.error) return falla(traducir(r.error));
        }
      }

      const { data: fila, error } = await sb.from('clientes')
        .update({ dni, nombres, apellidos, user_id: userId }).eq('id', id).select().single();
      if (error) {
        if (correoCambiado && userId) await sb.auth.admin.updateUserById(userId, { email: correoCliente(actual.dni), email_confirm: true });
        return falla(traducir(error));
      }
      return responder({ ok: true, cliente: fila });
    }

    if (accion === 'eliminar_cliente') {
      const id = String(body.id ?? '');
      const { data: actual } = await sb.from('clientes').select('id, user_id').eq('id', id).maybeSingle();
      if (!actual) return responder({ ok: true });
      const { error } = await sb.from('clientes').delete().eq('id', id);
      if (error) return falla(traducir(error));
      if (actual.user_id) await sb.auth.admin.deleteUser(actual.user_id);
      return responder({ ok: true });
    }

    // ------------------------------------------------------------------
    // Personal (administradores y couriers). Lo usa el equipo técnico.
    // El primer administrador se puede crear sin sesión; después, solo
    // un administrador puede dar de alta a otro miembro del personal.
    // ------------------------------------------------------------------
    if (accion === 'alta_personal') {
      const rol = String(body.rol ?? '');
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const nombre = texto(body.nombre) || (rol === 'admin' ? 'Administrador' : 'Courier');
      if (rol !== 'admin' && rol !== 'courier') return falla('El rol debe ser admin o courier.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falla('Correo inválido.');
      if (password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');

      let permitido = esAdmin;
      if (!permitido && rol === 'admin') {
        const { count } = await sb.from('administradores').select('user_id', { count: 'exact', head: true });
        permitido = (count ?? 0) === 0;
      }
      if (!permitido) return falla('No tienes permiso para crear cuentas del personal.', 403);

      const acceso = await crearAcceso(email, password, { rol });
      const tabla = rol === 'admin' ? 'administradores' : 'couriers';
      const { error } = await sb.from(tabla).upsert({ user_id: acceso.id, email, nombre }, { onConflict: 'user_id' });
      if (error) return falla(traducir(error));
      return responder({ ok: true, user_id: acceso.id, rol, email });
    }

    return falla('Acción desconocida.', 400);
  } catch (e) {
    return falla(e instanceof Error ? e.message : String(e));
  }
});
