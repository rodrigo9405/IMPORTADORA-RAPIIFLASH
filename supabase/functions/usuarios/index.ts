// =====================================================================
// Rapiiflash · Función "usuarios" (v2, multinegocio)
//
// Clientes (DNI + contraseña): los gestiona el administrador de su
//   negocio o el super administrador.
// Administradores y couriers (correo + contraseña): solo el super.
// Servicio del negocio (pausar, reanudar, terminar, comenzar) y
//   eliminar negocio: solo el super. Al pausar o terminar se bloquean
//   todas las cuentas del negocio; al reanudar se desbloquean.
// Cada contraseña se guarda también cifrada para que el super la vea.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

// Correo interno de los clientes: nunca recibe mensajes (".invalid" no existe).
const DOMINIO_CLIENTES = 'clientes.rapiiflash.invalid';
const BLOQUEO = '876000h'; // ~100 años

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
  } catch { return undefined; }
}

const limpiarDni = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const texto = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const correoValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const correoCliente = (dni: string, codigo: string) => `cliente-${dni.toLowerCase()}-${codigo}@${DOMINIO_CLIENTES}`;
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

function traducir(err: { message?: string } | null | undefined): string {
  const m = err?.message ?? 'Error desconocido';
  if (/at least\s*6|should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/weak|pwned|known to be/i.test(m)) return 'Esa contraseña es muy fácil de adivinar. Elige otra.';
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return 'Ese correo ya tiene una cuenta.';
  if (/duplicate key|clientes_negocio_dni_uq/i.test(m)) return 'Ya existe un cliente con ese DNI en este negocio.';
  return m;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return falla('Método no permitido.', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const servicio = claveServicio();
  const publica = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  if (!url || !servicio) return falla('La función no tiene configurada la clave de servicio.', 500);
  const sb = createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return falla('Solicitud inválida.', 400); }
  const accion = String(body.accion ?? '');

  // ---------------------------------------------------------------- ¿Quién llama?
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  let perfil: Record<string, any> | null = null;
  let miId: string | null = null;
  if (jwt && publica && jwt !== publica) {
    const { data: u } = await sb.auth.getUser(jwt);
    if (u?.user) {
      miId = u.user.id;
      // Se consulta con la sesión de quien llama: así el super solo vale si ya ingresó su código.
      const comoQuienLlama = createClient(url, publica, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await comoQuienLlama.rpc('mi_perfil');
      perfil = data ?? null;
    }
  }
  const esSuper = perfil?.rol === 'super';
  const negocioAdmin: string | null = perfil?.rol === 'admin' && perfil?.negocio_activo ? perfil.negocio_id : null;

  // ---------------------------------------------------------------- Ayudantes
  async function negocio(id: unknown) {
    const { data } = await sb.from('negocios').select('id, codigo, nombre, servicio_estado').eq('id', String(id ?? '')).maybeSingle();
    return data as { id: string; codigo: string; nombre: string; servicio_estado: string } | null;
  }

  async function guardarClave(userId: string, clave: string) {
    const { error } = await sb.rpc('guardar_clave', { p_user: userId, p_clave: clave });
    if (error) console.error('guardar_clave', error.message);
  }

  async function bloquear(ids: string[], bloqueado: boolean) {
    const lotes = [];
    for (let i = 0; i < ids.length; i += 10) lotes.push(ids.slice(i, i + 10));
    for (const lote of lotes) {
      await Promise.all(lote.map((id) => sb.auth.admin.updateUserById(id, { ban_duration: bloqueado ? BLOQUEO : 'none' })));
    }
  }

  async function cuentasDelNegocio(negocioId: string): Promise<string[]> {
    const [a, c, k] = await Promise.all([
      sb.from('administradores').select('user_id').eq('negocio_id', negocioId),
      sb.from('couriers').select('user_id').eq('negocio_id', negocioId),
      sb.from('clientes').select('user_id').eq('negocio_id', negocioId).not('user_id', 'is', null),
    ]);
    return [...(a.data ?? []), ...(c.data ?? []), ...(k.data ?? [])].map((r: any) => r.user_id).filter(Boolean);
  }

  // ¿Este correo ya pertenece a alguien del sistema?
  async function correoEnUso(email: string, excepto?: string) {
    const { data: id } = await sb.rpc('usuario_por_email', { p_email: email });
    if (!id || id === excepto) return false;
    const [s, a, c, k] = await Promise.all([
      sb.from('superadmins').select('user_id').eq('user_id', id).maybeSingle(),
      sb.from('administradores').select('user_id').eq('user_id', id).maybeSingle(),
      sb.from('couriers').select('user_id').eq('user_id', id).maybeSingle(),
      sb.from('clientes').select('id').eq('user_id', id).maybeSingle(),
    ]);
    return !!(s.data || a.data || c.data || k.data);
  }

  // Crea la cuenta; si ya existía una sin ficha (quedó suelta), la reutiliza.
  async function crearAcceso(email: string, password: string, meta: Record<string, unknown>) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta, app_metadata: meta });
    if (!error && data?.user) return { id: data.user.id, nuevo: true };
    if (error && /already|exists|registered/i.test(error.message)) {
      const { data: idPrevio } = await sb.rpc('usuario_por_email', { p_email: email });
      if (idPrevio) {
        const r = await sb.auth.admin.updateUserById(idPrevio as string, { password, email_confirm: true, ban_duration: 'none' });
        if (r.error) throw new Error(traducir(r.error));
        return { id: idPrevio as string, nuevo: false };
      }
    }
    throw new Error(traducir(error));
  }

  try {
    // ==================================================================
    // Clientes
    // ==================================================================
    if (accion === 'crear_cliente') {
      const neg = await negocio(esSuper ? body.negocio_id : negocioAdmin);
      if (!neg || !(esSuper || neg.id === negocioAdmin)) return falla('Solo el administrador del negocio puede crear clientes.', 403);
      const dni = limpiarDni(body.dni);
      const nombres = texto(body.nombres);
      const apellidos = texto(body.apellidos);
      const password = String(body.password ?? '').trim();
      if (!/^[0-9A-Z]{6,15}$/.test(dni)) return falla('El DNI debe tener entre 6 y 15 números o letras.');
      if (!nombres) return falla('Escribe el nombre del cliente.');
      if (!apellidos) return falla('Escribe los apellidos del cliente.');
      if (password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');

      const { data: existe } = await sb.from('clientes').select('id').eq('negocio_id', neg.id).eq('dni', dni).maybeSingle();
      if (existe) return falla(`Ya existe un cliente con el DNI ${dni} en este negocio.`);

      const acceso = await crearAcceso(correoCliente(dni, neg.codigo), password, { rol: 'cliente', dni, negocio: neg.codigo });
      const { data: fila, error } = await sb.from('clientes')
        .insert({ negocio_id: neg.id, user_id: acceso.id, dni, nombres, apellidos }).select().single();
      if (error) {
        if (acceso.nuevo) await sb.auth.admin.deleteUser(acceso.id);
        return falla(traducir(error));
      }
      await guardarClave(acceso.id, password);
      if (neg.servicio_estado !== 'activo') await bloquear([acceso.id], true);
      return responder({ ok: true, cliente: fila, codigo_negocio: neg.codigo });
    }

    if (accion === 'editar_cliente') {
      const { data: actual } = await sb.from('clientes').select('*').eq('id', String(body.id ?? '')).maybeSingle();
      if (!actual) return falla('Este cliente ya no existe.');
      if (!(esSuper || actual.negocio_id === negocioAdmin)) return falla('Solo el administrador del negocio puede editar clientes.', 403);
      const neg = await negocio(actual.negocio_id);
      if (!neg) return falla('El negocio ya no existe.');

      const dni = limpiarDni(body.dni);
      const nombres = texto(body.nombres);
      const apellidos = texto(body.apellidos);
      const password = String(body.password ?? '').trim();
      if (!/^[0-9A-Z]{6,15}$/.test(dni)) return falla('El DNI debe tener entre 6 y 15 números o letras.');
      if (!nombres) return falla('Escribe el nombre del cliente.');
      if (!apellidos) return falla('Escribe los apellidos del cliente.');
      if (password && password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');
      if (dni !== actual.dni) {
        const { data: otro } = await sb.from('clientes').select('id').eq('negocio_id', neg.id).eq('dni', dni).neq('id', actual.id).maybeSingle();
        if (otro) return falla(`Ya existe otro cliente con el DNI ${dni} en este negocio.`);
      }

      let userId: string | null = actual.user_id;
      let correoAnterior: string | null = null;
      if (!userId) {
        if (!password) return falla('Este cliente no tiene acceso. Escribe una contraseña para crearlo.');
        userId = (await crearAcceso(correoCliente(dni, neg.codigo), password, { rol: 'cliente', dni, negocio: neg.codigo })).id;
      } else {
        const cambios: Record<string, unknown> = {};
        if (dni !== actual.dni) {
          const { data: u } = await sb.auth.admin.getUserById(userId);
          correoAnterior = u?.user?.email ?? null;
          cambios.email = correoCliente(dni, neg.codigo);
          cambios.email_confirm = true;
        }
        if (password) cambios.password = password;
        if (Object.keys(cambios).length) {
          const r = await sb.auth.admin.updateUserById(userId, cambios);
          if (r.error) return falla(traducir(r.error));
        }
      }

      const { data: fila, error } = await sb.from('clientes')
        .update({ dni, nombres, apellidos, user_id: userId }).eq('id', actual.id).select().single();
      if (error) {
        if (correoAnterior && userId) await sb.auth.admin.updateUserById(userId, { email: correoAnterior, email_confirm: true });
        return falla(traducir(error));
      }
      if (password && userId) await guardarClave(userId, password);
      if (neg.servicio_estado !== 'activo' && userId) await bloquear([userId], true);
      return responder({ ok: true, cliente: fila, codigo_negocio: neg.codigo });
    }

    if (accion === 'eliminar_cliente') {
      const { data: actual } = await sb.from('clientes').select('id, user_id, negocio_id').eq('id', String(body.id ?? '')).maybeSingle();
      if (!actual) return responder({ ok: true });
      if (!(esSuper || actual.negocio_id === negocioAdmin)) return falla('Solo el administrador del negocio puede eliminar clientes.', 403);
      const { error } = await sb.from('clientes').delete().eq('id', actual.id);
      if (error) return falla(traducir(error));
      if (actual.user_id) await sb.auth.admin.deleteUser(actual.user_id);
      return responder({ ok: true });
    }

    // ==================================================================
    // Administradores y couriers (solo el super)
    // ==================================================================
    if (accion === 'crear_personal' || accion === 'editar_personal' || accion === 'eliminar_personal'
        || accion === 'servicio' || accion === 'eliminar_negocio') {
      if (!esSuper) return falla('Solo el super administrador puede hacer esto.', 403);
    }

    if (accion === 'crear_personal') {
      const rol = String(body.rol ?? '');
      if (rol !== 'admin' && rol !== 'courier') return falla('El tipo de cuenta debe ser administrador o courier.');
      const neg = await negocio(body.negocio_id);
      if (!neg) return falla('El negocio ya no existe.');
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '').trim();
      const nombre = texto(body.nombre) || (rol === 'admin' ? 'Administrador' : 'Courier');
      if (!correoValido(email)) return falla('Escribe un correo válido.');
      if (password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');
      if (await correoEnUso(email)) return falla('Ese correo ya tiene una cuenta en el sistema.');

      const acceso = await crearAcceso(email, password, { rol, negocio: neg.codigo });
      const tabla = rol === 'admin' ? 'administradores' : 'couriers';
      const { error } = await sb.from(tabla).upsert({ user_id: acceso.id, email, nombre, negocio_id: neg.id }, { onConflict: 'user_id' });
      if (error) {
        if (acceso.nuevo) await sb.auth.admin.deleteUser(acceso.id);
        return falla(traducir(error));
      }
      await guardarClave(acceso.id, password);
      if (neg.servicio_estado !== 'activo') await bloquear([acceso.id], true);
      return responder({ ok: true, user_id: acceso.id });
    }

    if (accion === 'editar_personal') {
      const userId = String(body.user_id ?? '');
      const [a, c] = await Promise.all([
        sb.from('administradores').select('*').eq('user_id', userId).maybeSingle(),
        sb.from('couriers').select('*').eq('user_id', userId).maybeSingle(),
      ]);
      const fila = a.data || c.data;
      if (!fila) return falla('Esta cuenta ya no existe.');
      const tabla = a.data ? 'administradores' : 'couriers';
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '').trim();
      const nombre = texto(body.nombre) || fila.nombre;
      if (!correoValido(email)) return falla('Escribe un correo válido.');
      if (password && password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');
      const cambios: Record<string, unknown> = {};
      if (email !== fila.email) {
        if (await correoEnUso(email, userId)) return falla('Ese correo ya tiene una cuenta en el sistema.');
        cambios.email = email; cambios.email_confirm = true;
      }
      if (password) cambios.password = password;
      if (Object.keys(cambios).length) {
        const r = await sb.auth.admin.updateUserById(userId, cambios);
        if (r.error) return falla(traducir(r.error));
      }
      const { error } = await sb.from(tabla).update({ email, nombre }).eq('user_id', userId);
      if (error) return falla(traducir(error));
      if (password) await guardarClave(userId, password);
      return responder({ ok: true });
    }

    if (accion === 'eliminar_personal') {
      const userId = String(body.user_id ?? '');
      const [a, c] = await Promise.all([
        sb.from('administradores').select('user_id').eq('user_id', userId).maybeSingle(),
        sb.from('couriers').select('user_id').eq('user_id', userId).maybeSingle(),
      ]);
      if (!a.data && !c.data) return responder({ ok: true });
      const r = await sb.auth.admin.deleteUser(userId);
      if (r.error) return falla(traducir(r.error));
      return responder({ ok: true });
    }

    // ==================================================================
    // Servicio del negocio
    // ==================================================================
    if (accion === 'servicio') {
      const neg = await negocio(body.negocio_id);
      if (!neg) return falla('El negocio ya no existe.');
      const tipo = String(body.tipo ?? '');
      const nota = texto(body.nota) || null;
      const actual = neg.servicio_estado;
      let cambios: Record<string, unknown>;
      let titulo: string;
      if (tipo === 'pausar') {
        if (actual !== 'activo') return falla('Solo se puede pausar un servicio activo.');
        cambios = { servicio_estado: 'pausado' }; titulo = 'Servicio pausado';
      } else if (tipo === 'reanudar') {
        if (actual !== 'pausado') return falla('Solo se puede reanudar un servicio pausado.');
        cambios = { servicio_estado: 'activo' }; titulo = 'Servicio reanudado';
      } else if (tipo === 'terminar') {
        if (actual === 'terminado') return falla('El servicio ya está terminado.');
        cambios = { servicio_estado: 'terminado', servicio_fin: hoyLima() }; titulo = 'Servicio terminado';
      } else if (tipo === 'comenzar') {
        if (actual !== 'terminado') return falla('El servicio ya está en curso.');
        const inicio = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha ?? '')) ? String(body.fecha) : hoyLima();
        cambios = { servicio_estado: 'activo', servicio_inicio: inicio, servicio_fin: null }; titulo = 'Servicio iniciado de nuevo';
      } else {
        return falla('Acción de servicio desconocida.');
      }
      const { error } = await sb.from('negocios').update(cambios).eq('id', neg.id);
      if (error) return falla(traducir(error));
      await sb.from('negocio_servicio').insert({ negocio_id: neg.id, accion: titulo, nota, actor: (perfil?.nombre || 'Super administrador') + ' · super administrador' });
      const ids = await cuentasDelNegocio(neg.id);
      await bloquear(ids, cambios.servicio_estado !== 'activo');
      return responder({ ok: true, estado: cambios.servicio_estado, cuentas: ids.length });
    }

    if (accion === 'eliminar_negocio') {
      const neg = await negocio(body.negocio_id);
      if (!neg) return responder({ ok: true });
      if (texto(body.confirmacion).toLowerCase() !== neg.nombre.trim().toLowerCase()) {
        return falla('Escribe el nombre exacto del negocio para confirmar.');
      }
      const ids = await cuentasDelNegocio(neg.id);
      // Fotos de los pedidos
      const { data: peds } = await sb.from('pedidos').select('id').eq('negocio_id', neg.id);
      const pedIds = (peds ?? []).map((p: any) => p.id);
      let rutas: string[] = [];
      for (let i = 0; i < pedIds.length; i += 200) {
        const { data: ev } = await sb.from('evidencias').select('ruta').in('pedido_id', pedIds.slice(i, i + 200));
        rutas = rutas.concat((ev ?? []).map((e: any) => e.ruta));
      }
      for (let i = 0; i < rutas.length; i += 100) await sb.storage.from('evidencias').remove(rutas.slice(i, i + 100));
      const { data: logos } = await sb.storage.from('logos').list(neg.id, { limit: 1000 });
      if (logos?.length) await sb.storage.from('logos').remove(logos.map((l: any) => `${neg.id}/${l.name}`));
      // Datos (se borran en cascada) y cuentas
      const { error } = await sb.from('negocios').delete().eq('id', neg.id);
      if (error) return falla(traducir(error));
      for (const id of ids) await sb.auth.admin.deleteUser(id);
      return responder({ ok: true, cuentas: ids.length, fotos: rutas.length });
    }

    // ==================================================================
    // Cambiar mi propia contraseña
    // ==================================================================
    if (accion === 'cambiar_mi_clave') {
      if (!miId || !perfil) return falla('Vuelve a ingresar e inténtalo otra vez.', 401);
      const password = String(body.password ?? '').trim();
      if (password.length < 6) return falla('La contraseña debe tener al menos 6 caracteres.');
      const r = await sb.auth.admin.updateUserById(miId, { password });
      if (r.error) return falla(traducir(r.error));
      if (perfil.rol !== 'super' && perfil.rol !== 'super_pendiente') await guardarClave(miId, password);
      return responder({ ok: true });
    }

    // ==================================================================
    // Primera cuenta de super administrador (solo si aún no hay ninguna)
    // ==================================================================
    if (accion === 'alta_super') {
      const { count } = await sb.from('superadmins').select('user_id', { count: 'exact', head: true });
      if ((count ?? 0) > 0) return falla('Ya existe un super administrador.', 403);
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '').trim();
      if (!correoValido(email) || password.length < 6) return falla('Datos inválidos.');
      const acceso = await crearAcceso(email, password, { rol: 'super' });
      return responder({ ok: true, user_id: acceso.id });
    }

    return falla('Acción desconocida.', 400);
  } catch (e) {
    return falla(e instanceof Error ? e.message : String(e));
  }
});
