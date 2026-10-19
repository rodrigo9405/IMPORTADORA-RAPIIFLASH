/* =====================================================================
   Importadora Rapiiflash · Sistema de pedidos
   Tres vistas en una sola web:
     · Administrador: pedidos, inventario y clientes
     · Courier: empaquetar y despachar con fotos de evidencia
     · Cliente: sus pedidos, foto del motorizado o boleta y clave de Shalom
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.RAPIIFLASH_CONFIG || {};
  const EMPRESA = CFG.empresa || 'Importadora Rapiiflash';
  const raiz = document.getElementById('raiz');
  const modalRaiz = document.getElementById('modal-raiz');
  const toastEl = document.getElementById('toast');

  let sb;
  try {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rapiiflash-sesion' },
    });
  } catch (e) {
    raiz.innerHTML = '<div class="cargando-inicial">No se pudo cargar el sistema. Revisa js/config.js.</div>';
    return;
  }

  // ===================================================================
  // Utilidades
  // ===================================================================
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const limpiarDni = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const correoCliente = (dni) => `cliente-${dni.toLowerCase()}@${CFG.dominioClientes}`;
  const esUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s || '');

  const TZ = 'America/Lima';
  const fFecha = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  const fCorta = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: TZ });
  const fHora = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
  const fecha = (iso) => (iso ? fFecha.format(new Date(iso)) : '');
  const fechaHora = (iso) => (iso ? `${fFecha.format(new Date(iso))} · ${fHora.format(new Date(iso))}` : '');
  const fechaCorta = (iso) => (iso ? `${fCorta.format(new Date(iso))} · ${fHora.format(new Date(iso))}` : '');

  const unidades = (items) => (items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
  const ordenarItems = (items) => [...(items || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // ===================================================================
  // Iconos (trazo 2px, 24×24)
  // ===================================================================
  const P = {
    pedidos: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    inventario: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    volver: '<path d="m15 18-6-6 6-6"/>',
    adelante: '<path d="m9 18 6-6-6-6"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    borrar: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    camara: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
    imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    moto: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M8.5 16.5h5.5l3-6.5h-3.5M14 6h2.5l2 4.5"/><path d="M6 10h5l2 3"/>',
    shalom: '<path d="M3 21V9.5L12 4l9 5.5V21"/><path d="M8 21v-7h8v7M8 17.5h8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
    ubicacion: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    caja: '<path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><path d="M1.5 3.5h21v4.5h-21zM10 12h4"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7 10h4M7 14h7"/><circle cx="17" cy="11" r="1.6"/>',
  };
  const icono = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  const rayo = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M36.5 8 15 36h14.5L25 56l24-30H34.5L40 8z" fill="#FFC400"/></svg>';

  const marcaHTML = (sub) => `
    <a class="marca" href="#/">
      <span class="marca-logo">${rayo}</span>
      <span class="marca-texto"><span class="marca-nombre">RAPIIFLASH</span><span class="marca-sub">${esc(sub)}</span></span>
    </a>`;

  // Etiquetas de estado y envío
  const NOMBRE_ESTADO = { creado: 'Creado', empaquetado: 'Empaquetado', cerrado: 'Cerrado' };
  const estadoHTML = (estado) => `<span class="estado ${esc(estado)}">${esc(NOMBRE_ESTADO[estado] || estado)}</span>`;
  const estadoClienteTexto = (p) => {
    if (p.estado === 'creado') return 'Pedido creado';
    if (p.estado === 'empaquetado') return 'Empaquetado';
    return p.envio === 'shalom' ? 'Enviado por Shalom' : 'Enviado con motorizado';
  };
  const estadoClienteHTML = (p) => `<span class="estado ${esc(p.estado)}">${esc(estadoClienteTexto(p))}</span>`;
  const envioHTML = (envio) => envio === 'shalom'
    ? `<span class="envio">${icono('shalom')}Shalom</span>`
    : `<span class="envio">${icono('moto')}Motorizado</span>`;

  // ===================================================================
  // Aviso flotante, modal, confirmación y visor de fotos
  // ===================================================================
  let tToast;
  function aviso(mensaje, tipo = 'ok') {
    toastEl.textContent = mensaje;
    toastEl.className = 'ver' + (tipo === 'error' ? ' error' : '');
    clearTimeout(tToast);
    tToast = setTimeout(() => { toastEl.className = ''; }, tipo === 'error' ? 5200 : 2800);
  }

  let alCerrarModal = null;
  function abrirModal({ titulo, html, ancho, alCerrar }) {
    alCerrarModal = alCerrar || null;
    modalRaiz.innerHTML = `
      <div class="modal-fondo" data-accion="fondo-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" ${ancho ? `style="max-width:${ancho}px"` : ''}>
          <div class="modal-cab">
            <h2 id="modal-titulo">${esc(titulo)}</h2>
            <button class="btn btn-texto btn-icono peq" type="button" data-accion="cerrar-modal" aria-label="Cerrar">${icono('x')}</button>
          </div>
          ${html}
        </div>
      </div>`;
    const primero = modalRaiz.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, .modal-pie .btn');
    setTimeout(() => primero && primero.focus(), 30);
  }
  function cerrarModal(valor) {
    if (!modalRaiz.innerHTML) return;
    modalRaiz.innerHTML = '';
    const fn = alCerrarModal; alCerrarModal = null;
    if (fn) fn(valor);
  }
  const modalAbierto = () => !!modalRaiz.innerHTML || !!document.querySelector('.visor');

  function confirmar({ titulo, mensaje, boton = 'Eliminar', peligro = true }) {
    return new Promise((resolver) => {
      abrirModal({
        titulo,
        alCerrar: (v) => resolver(v === true),
        html: `
          <div class="modal-cuerpo"><p>${mensaje}</p></div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn ${peligro ? 'btn-peligro-lleno' : 'btn-flash'}" type="button" data-accion="confirmar-si">${esc(boton)}</button>
          </div>`,
      });
    });
  }

  let visor = null;
  function abrirVisor(grupo, indice) {
    const fotos = [...document.querySelectorAll(`[data-grupo="${CSS.escape(grupo)}"] [data-accion="ver-foto"]`)];
    if (!fotos.length) return;
    visor = { fotos: fotos.map((b) => ({ url: b.dataset.url, pie: b.dataset.pie })), i: indice };
    pintarVisor();
  }
  function pintarVisor() {
    document.querySelector('.visor')?.remove();
    if (!visor) return;
    const f = visor.fotos[visor.i];
    const varias = visor.fotos.length > 1;
    const div = document.createElement('div');
    div.className = 'visor';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-label', 'Foto');
    div.innerHTML = `
      <div class="visor-cab">
        <span class="mono">${varias ? `${visor.i + 1} / ${visor.fotos.length}` : ''}</span>
        <div style="display:flex;gap:.4rem">
          ${varias ? `<button class="btn btn-icono" data-accion="visor-ant" aria-label="Foto anterior">${icono('volver')}</button>
          <button class="btn btn-icono" data-accion="visor-sig" aria-label="Foto siguiente">${icono('adelante')}</button>` : ''}
          <button class="btn btn-icono" data-accion="visor-cerrar" aria-label="Cerrar">${icono('x')}</button>
        </div>
      </div>
      <div class="visor-img" data-accion="visor-cerrar-fondo"><img src="${esc(f.url)}" alt="Foto de evidencia"></div>
      <div class="visor-pie">${esc(f.pie || '')}</div>`;
    document.body.appendChild(div);
    div.querySelector('[data-accion="visor-cerrar"]').focus();
  }
  function cerrarVisor() { visor = null; document.querySelector('.visor')?.remove(); }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso('Copiado');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); aviso('Copiado'); } catch { aviso('No se pudo copiar. Selecciona el texto y cópialo.', 'error'); }
      ta.remove();
    }
  }

  // ===================================================================
  // Datos (Supabase)
  // ===================================================================
  function mensajeError(err) {
    const m = err?.message || String(err || 'Error desconocido');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
    if (/jwt|token.*expired|not authenticated/i.test(m)) return 'Tu sesión venció. Vuelve a ingresar.';
    if (/row-level security|permission denied|violates row-level/i.test(m)) return 'No tienes permiso para hacer esto.';
    if (/duplicate key/i.test(m)) return 'Ese dato ya existe.';
    return m;
  }
  async function q(promesa) {
    const { data, error } = await promesa;
    if (error) throw new Error(mensajeError(error));
    return data;
  }

  const urlsCache = new Map();
  const API = {
    perfil: () => q(sb.rpc('mi_perfil')),

    // Inventario
    productos: () => q(sb.from('productos').select('*').order('nombre')),
    guardarProducto: (p) => p.id
      ? q(sb.from('productos').update({ nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad }).eq('id', p.id).select().single())
      : q(sb.from('productos').insert({ nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad }).select().single()),
    eliminarProducto: (id) => q(sb.from('productos').delete().eq('id', id)),

    // Clientes
    clientes: () => q(sb.from('clientes').select('id, dni, nombres, apellidos, user_id, creado, pedidos(count)').order('apellidos').order('nombres')),
    async usuarios(cuerpo) {
      const { data, error } = await sb.functions.invoke('usuarios', { body: cuerpo });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
        throw new Error(mensajeError({ message: msg }));
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo completar.');
      return data;
    },
    ultimaDireccion: async (clienteId) => {
      const r = await q(sb.from('pedidos').select('direccion').eq('cliente_id', clienteId).order('numero', { ascending: false }).limit(1));
      return r?.[0]?.direccion || '';
    },

    // Pedidos
    pedidosAdmin: () => q(sb.from('pedidos')
      .select('id, numero, cliente_id, cliente_dni, cliente_nombre, direccion, envio, estado, creado, empaquetado_en, cerrado_en, pedido_items(cantidad)')
      .order('numero', { ascending: false })),
    pedidosCourier: () => q(sb.from('pedidos')
      .select('id, numero, cliente_dni, cliente_nombre, direccion, envio, estado, creado, empaquetado_en, pedido_items(cantidad)')
      .in('estado', ['creado', 'empaquetado'])
      .order('numero', { ascending: true })),
    pedidosCliente: () => q(sb.from('pedidos')
      .select('id, numero, envio, estado, creado, empaquetado_en, cerrado_en, pedido_items(nombre, cantidad)')
      .order('numero', { ascending: false })),
    pedido: (id) => q(sb.from('pedidos')
      .select('*, pedido_items(*), evidencias(*)')
      .eq('id', id).maybeSingle()),
    eventos: (id) => q(sb.from('pedido_eventos').select('*').eq('pedido_id', id).order('creado').order('id')),
    guardarPedido: (d) => q(sb.rpc('guardar_pedido', {
      p_id: d.id || null, p_cliente_id: d.cliente_id, p_direccion: d.direccion, p_envio: d.envio, p_items: d.items,
    })),
    async eliminarPedido(id) {
      const rutas = await q(sb.rpc('eliminar_pedido', { p_id: id }));
      if (rutas?.length) await sb.storage.from('evidencias').remove(rutas);
    },
    empaquetar: (id) => q(sb.rpc('marcar_empaquetado', { p_id: id })),
    cerrar: (id, clave) => q(sb.rpc('cerrar_pedido', { p_id: id, p_clave: clave || null })),

    // Fotos
    async subirFoto(pedidoId, tipo, archivo) {
      const blob = await comprimir(archivo);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : /hei[cf]/.test(blob.type) ? 'heic' : 'jpg';
      const ruta = `${pedidoId}/${tipo}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const sub = await sb.storage.from('evidencias').upload(ruta, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (sub.error) throw new Error(mensajeError(sub.error));
      const ins = await sb.from('evidencias').insert({ pedido_id: pedidoId, tipo, ruta });
      if (ins.error) {
        await sb.storage.from('evidencias').remove([ruta]);
        throw new Error(mensajeError(ins.error));
      }
    },
    async quitarFoto(ev) {
      await q(sb.from('evidencias').delete().eq('id', ev.id));
      await sb.storage.from('evidencias').remove([ev.ruta]);
      urlsCache.delete(ev.ruta);
    },
    async urls(rutas) {
      const ahora = Date.now();
      const faltan = rutas.filter((r) => !(urlsCache.get(r)?.vence > ahora));
      if (faltan.length) {
        const { data } = await sb.storage.from('evidencias').createSignedUrls(faltan, 3600);
        (data || []).forEach((d) => { if (d.signedUrl) urlsCache.set(d.path, { url: d.signedUrl, vence: ahora + 50 * 60 * 1000 }); });
      }
      const m = {};
      rutas.forEach((r) => { m[r] = urlsCache.get(r)?.url || ''; });
      return m;
    },
  };

  // Reduce las fotos del celular (máx. 1600 px, JPEG) para que suban rápido.
  async function comprimir(archivo) {
    try {
      if (!/^image\//.test(archivo.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(archivo.name)) throw new Error('tipo');
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      const max = 1600;
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k);
      const h = Math.round(bmp.height * k);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
      if (blob && blob.size > 0) return blob;
    } catch { /* se sube el original */ }
    return archivo;
  }

  // ===================================================================
  // Estado y navegación
  // ===================================================================
  const S = {
    perfil: null,
    shell: null,
    tabAcceso: 'cliente',
    mensajeAcceso: '',
    filtro: 'todos',
    buscar: { pedidos: '', productos: '', clientes: '' },
    datos: { pedidos: [], productos: [], clientes: [] },
    tabCourier: 'creado',
    tabCliente: 'actuales',
    empaquetando: {},
    clave: {},
    subiendo: 0,
    preCliente: null,
    form: null,
    turno: 0,
    canal: null,
  };

  const ruta = () => location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  const ir = (r) => { if (ruta() === r) render(); else location.hash = '#/' + r; };
  const inicioDe = (rol) => (rol === 'admin' ? 'pedidos' : rol === 'courier' ? 'courier' : 'mis-pedidos');
  const nombreRol = (rol) => (rol === 'admin' ? 'administrador' : rol === 'courier' ? 'courier' : 'cliente');

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (data?.session) await entrarConSesion();
    else mostrarAcceso();

    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        S.perfil = null; S.shell = null;
        cerrarCanal(); cerrarModal(); cerrarVisor();
        mostrarAcceso();
      }
    });
    window.addEventListener('hashchange', () => {
      cerrarVisor();
      if (S.perfil) render(); else mostrarAcceso();
    });
  }

  async function entrarConSesion() {
    try {
      const perfil = await API.perfil();
      if (!perfil) {
        S.mensajeAcceso = 'Tu cuenta no tiene acceso a este sistema.';
        await sb.auth.signOut({ scope: 'local' });
        mostrarAcceso();
        return;
      }
      S.perfil = perfil;
      abrirCanal();
      render();
    } catch (e) {
      raiz.innerHTML = `<div class="cargando-inicial" style="flex-direction:column;gap:1rem">
        <p>${esc(e.message)}</p><button class="btn" data-accion="recargar">Reintentar</button></div>`;
    }
  }

  function render(opciones = {}) {
    if (!S.perfil) return mostrarAcceso();
    const rol = S.perfil.rol;
    let r = ruta();
    if (!r || ['cliente', 'courier', 'admin'].includes(r)) {
      history.replaceState(null, '', '#/' + inicioDe(rol));
      r = inicioDe(rol);
    }
    const p = r.split('/');

    if (rol === 'admin') {
      shellAdmin();
      if (p[0] === 'inventario') return vistaInventario(opciones);
      if (p[0] === 'clientes') return vistaClientes(opciones);
      if (p[0] === 'pedido' && p[1] === 'nuevo') return vistaFormPedido(null);
      if (p[0] === 'pedido' && esUuid(p[1]) && p[2] === 'editar') return vistaFormPedido(p[1]);
      if (p[0] === 'pedido' && esUuid(p[1])) return vistaPedidoAdmin(p[1], opciones);
      return vistaPedidosAdmin(opciones);
    }
    if (rol === 'courier') {
      shellSimple('Courier');
      if (p[0] === 'courier' && esUuid(p[1])) return vistaPedidoCourier(p[1], opciones);
      return vistaCourier(opciones);
    }
    shellSimple('Mis pedidos');
    if (p[0] === 'mi-pedido' && esUuid(p[1])) return vistaPedidoCliente(p[1], opciones);
    return vistaCliente(opciones);
  }

  // Pinta en la zona de contenido solo si el usuario no navegó a otra parte mientras cargaba.
  function preparar(opciones) {
    const turno = ++S.turno;
    const zona = document.getElementById('vista');
    if (!opciones.silencioso) {
      zona.innerHTML = '<div class="cargando"><span class="spin" aria-hidden="true"></span>Cargando…</div>';
      window.scrollTo(0, 0);
    }
    return {
      vigente: () => turno === S.turno,
      pintar(html) {
        if (turno !== S.turno) return false;
        const y = window.scrollY;
        zona.innerHTML = html;
        if (opciones.silencioso) window.scrollTo(0, y);
        return true;
      },
      error(e) {
        if (turno !== S.turno) return;
        zona.innerHTML = `<div class="vacio">${icono('info')}<strong>No se pudo cargar</strong><p>${esc(e.message || e)}</p>
          <button class="btn" data-accion="recargar-vista">Reintentar</button></div>`;
      },
    };
  }

  // Cambios en vivo: cuando un pedido cambia, se actualiza la pantalla abierta.
  function abrirCanal() {
    cerrarCanal();
    S.canal = sb.channel('rapiiflash-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, programarRefresco)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evidencias' }, programarRefresco)
      .subscribe();
  }
  function cerrarCanal() {
    if (S.canal) { sb.removeChannel(S.canal); S.canal = null; }
  }
  let tRefresco;
  function programarRefresco() {
    clearTimeout(tRefresco);
    tRefresco = setTimeout(() => {
      if (!S.perfil || modalAbierto() || S.subiendo > 0) return;
      const r = ruta();
      const rol = S.perfil.rol;
      const seguro =
        (rol === 'admin' && (r === 'pedidos' || /^pedido\/[0-9a-f-]{36}$/.test(r))) ||
        (rol === 'courier' && r === 'courier') ||
        rol === 'cliente';
      if (seguro) render({ silencioso: true });
    }, 700);
  }

  // ===================================================================
  // Acceso
  // ===================================================================
  function mostrarAcceso() {
    S.shell = null;
    document.body.className = '';
    const r = ruta();
    if (['cliente', 'courier', 'admin'].includes(r)) S.tabAcceso = r;
    const tab = S.tabAcceso;
    const msg = S.mensajeAcceso;
    const pie = {
      cliente: 'Ingresa con tu DNI y la contraseña que te dio ' + esc(EMPRESA) + '.',
      courier: 'Pedidos por empaquetar y por despachar.',
      admin: 'Inventario, clientes y pedidos.',
    }[tab];
    raiz.innerHTML = `
      <main class="acceso">
        <div class="acceso-tarjeta">
          <div class="acceso-cab">${marcaHTML(EMPRESA)}</div>
          <div class="acceso-cuerpo">
            <div class="pestanas" role="tablist" aria-label="Tipo de cuenta">
              ${[['cliente', 'Cliente'], ['courier', 'Courier'], ['admin', 'Administrador']].map(([k, t]) =>
                `<button type="button" role="tab" aria-selected="${k === tab}" data-accion="tab-acceso" data-tab="${k}">${t}</button>`).join('')}
            </div>
            <form data-form="acceso" class="rejilla-form" novalidate>
              ${tab === 'cliente'
                ? `<div class="campo"><label for="acc-usuario">DNI</label>
                     <input id="acc-usuario" name="usuario" type="text" inputmode="text" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="Ej. 45678912" required></div>`
                : `<div class="campo"><label for="acc-usuario">Correo</label>
                     <input id="acc-usuario" name="usuario" type="email" autocomplete="username" spellcheck="false" autocapitalize="none" required></div>`}
              <div class="campo"><label for="acc-clave">Contraseña</label>
                <div class="con-boton">
                  <input id="acc-clave" name="password" type="password" autocomplete="current-password" required>
                  <button class="btn btn-icono" type="button" data-accion="ver-clave" data-para="acc-clave" aria-label="Mostrar contraseña">${icono('ojo')}</button>
                </div>
              </div>
              <div class="error-form" id="acc-error" ${msg ? '' : 'hidden'}>${esc(msg)}</div>
              <button class="btn btn-flash btn-grande btn-bloque" type="submit">Ingresar</button>
            </form>
          </div>
          <p class="acceso-pie">${pie}</p>
        </div>
      </main>`;
  }

  async function enviarAcceso(form) {
    const tab = S.tabAcceso;
    const usuario = form.usuario.value.trim();
    const password = form.password.value;
    const err = document.getElementById('acc-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    S.mensajeAcceso = '';
    if (!usuario || !password) return mostrar(tab === 'cliente' ? 'Escribe tu DNI y tu contraseña.' : 'Escribe tu correo y tu contraseña.');

    let email = usuario.toLowerCase();
    if (tab === 'cliente') {
      const dni = limpiarDni(usuario);
      if (dni.length < 6) return mostrar('Revisa tu DNI: debe tener al menos 6 números.');
      email = correoCliente(dni);
    }

    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Ingresando…';
    const listo = () => { btn.disabled = false; btn.textContent = 'Ingresar'; };

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      listo();
      if (/invalid login|invalid credentials/i.test(error.message)) {
        return mostrar(tab === 'cliente' ? 'DNI o contraseña incorrectos.' : 'Correo o contraseña incorrectos.');
      }
      return mostrar(mensajeError(error));
    }
    let perfil = null;
    try { perfil = await API.perfil(); } catch (e) { listo(); return mostrar(e.message); }
    if (!perfil || perfil.rol !== tab) {
      S.mensajeAcceso = perfil
        ? `Esta cuenta es de ${nombreRol(perfil.rol)}. Ingresa desde la pestaña «${perfil.rol === 'admin' ? 'Administrador' : perfil.rol === 'courier' ? 'Courier' : 'Cliente'}».`
        : 'Esta cuenta no tiene acceso a este sistema.';
      await sb.auth.signOut({ scope: 'local' });
      mostrarAcceso();
      return;
    }
    S.perfil = perfil;
    abrirCanal();
    history.replaceState(null, '', '#/' + inicioDe(perfil.rol));
    render();
  }

  // ===================================================================
  // Estructura de pantallas
  // ===================================================================
  function shellAdmin() {
    if (S.shell === 'admin' && document.getElementById('vista')) { marcarNav(); return; }
    S.shell = 'admin';
    document.body.className = '';
    const links = (corto) => [
      ['pedidos', 'Pedidos', 'pedidos'],
      ['inventario', 'Inventario', 'inventario'],
      ['clientes', 'Clientes', 'clientes'],
    ].map(([r, t, i]) => `<a href="#/${r}" data-seccion="${r}">${icono(i)}<span>${corto ? t : t}</span></a>`).join('');
    raiz.innerHTML = `
      <div class="shell">
        <aside class="lateral">
          ${marcaHTML('Administrador')}
          <nav class="nav" aria-label="Secciones">${links(false)}</nav>
          <div class="lateral-pie">
            <div class="quien"><strong>${esc(S.perfil.nombre)}</strong><span>${esc(S.perfil.email || '')}</span></div>
            <div style="display:flex;gap:.25rem;flex-wrap:wrap">
              <button class="btn btn-texto" type="button" data-accion="cambiar-clave">${icono('llave')}Contraseña</button>
              <button class="btn btn-texto" type="button" data-accion="salir">${icono('salir')}Salir</button>
            </div>
          </div>
        </aside>
        <header class="barra-movil">
          ${marcaHTML('Administrador')}
          <div style="display:flex;gap:.25rem">
            <button class="btn btn-texto btn-icono" type="button" data-accion="cambiar-clave" aria-label="Cambiar contraseña">${icono('llave')}</button>
            <button class="btn btn-texto btn-icono" type="button" data-accion="salir" aria-label="Salir">${icono('salir')}</button>
          </div>
        </header>
        <main class="principal"><div class="contenedor" id="vista"></div></main>
        <nav class="tabbar" aria-label="Secciones">${links(true)}</nav>
      </div>`;
    marcarNav();
  }
  function marcarNav() {
    const r = ruta();
    const sec = r.startsWith('inventario') ? 'inventario' : r.startsWith('clientes') ? 'clientes' : 'pedidos';
    document.querySelectorAll('[data-seccion]').forEach((a) => {
      if (a.dataset.seccion === sec) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function shellSimple(sub) {
    const clave = 'simple-' + S.perfil.rol;
    if (S.shell === clave && document.getElementById('vista')) return;
    S.shell = clave;
    document.body.className = 'vista-simple';
    raiz.innerHTML = `
      <div class="simple">
        <header class="simple-barra">
          <div class="simple-barra-in">
            ${marcaHTML(sub)}
            <button class="btn btn-texto" type="button" data-accion="salir">${icono('salir')}Salir</button>
          </div>
        </header>
        <main class="simple-cuerpo" id="vista"></main>
      </div>`;
  }

  // ===================================================================
  // Bloques compartidos
  // ===================================================================
  function etiquetaPedido(p, { estadoCliente = false } = {}) {
    return `
      <section class="etiqueta">
        <div class="etiqueta-franja">
          <span class="etq">${p.envio === 'shalom' ? 'Envío por Shalom' : 'Envío por motorizado'}</span>
          ${estadoCliente ? estadoClienteHTML(p) : estadoHTML(p.estado)}
        </div>
        <div class="etiqueta-cuerpo">
          <div class="etiqueta-numero"><small>PEDIDO</small>#${esc(p.numero)}</div>
          <div class="etiqueta-datos">
            ${p.cliente_nombre ? `<div class="dato"><span class="etq">Cliente</span><span class="valor">${esc(p.cliente_nombre)}</span></div>` : ''}
            ${p.cliente_dni ? `<div class="dato" style="margin:0"><span class="etq">DNI</span><span class="valor mono">${esc(p.cliente_dni)}</span></div>` : ''}
            <div class="dato" style="margin:0"><span class="etq">Creado</span><span class="valor">${esc(fechaHora(p.creado))}</span></div>
          </div>
        </div>
        <div class="etiqueta-barras" aria-hidden="true"></div>
      </section>`;
  }

  function seguimiento(p, { vistaCliente = false } = {}) {
    const pasos = [
      { t: vistaCliente ? 'Pedido creado' : 'Pedido creado', f: p.creado, por: vistaCliente ? '' : p.creado_por },
      { t: 'Empaquetado', f: p.empaquetado_en, por: vistaCliente ? '' : p.empaquetado_por },
      {
        t: p.envio === 'shalom' ? 'Enviado por Shalom' : (vistaCliente ? 'Enviado con motorizado' : 'Entregado al motorizado'),
        f: p.cerrado_en, por: vistaCliente ? '' : p.cerrado_por,
      },
    ];
    const actual = p.estado === 'creado' ? 1 : p.estado === 'empaquetado' ? 2 : 3;
    return `<div class="seguimiento">${pasos.map((s, i) => {
      const hecho = !!s.f;
      const cls = hecho ? 'hecho' : (i === actual ? 'actual' : '');
      return `<div class="paso ${cls}">
        <div class="paso-marca"><span class="paso-punto">${hecho ? icono('check') : ''}</span><span class="paso-linea"></span></div>
        <span class="paso-titulo">${esc(s.t)}</span>
        <span class="paso-det">${hecho ? esc(fechaHora(s.f)) : (i === actual ? 'Pendiente' : '—')}</span>
        ${hecho && s.por ? `<span class="paso-det">${esc(s.por)}</span>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function listaItems(items) {
    const its = ordenarItems(items);
    return `
      <ul class="items">${its.map((i) => `
        <li><div><div class="item-nom">${esc(i.nombre)}</div>${i.descripcion ? `<div class="item-des">${esc(i.descripcion)}</div>` : ''}</div>
        <div class="item-can">${esc(i.cantidad)}<small>und.</small></div></li>`).join('')}
      </ul>
      <div class="items-total"><span>Total</span><span class="mono">${plural(unidades(its), 'unidad', 'unidades')}</span></div>`;
  }

  const TIPOS = {
    productos: { titulo: 'Evidencia de productos', vacio: 'Sin fotos de productos.' },
    empaquetado: { titulo: 'Evidencia de pedido empaquetado', vacio: 'Sin fotos del paquete.' },
    motorizado: { titulo: 'Evidencia motorizado', vacio: 'Sin fotos del motorizado.' },
    boleta: { titulo: 'Boleta de Shalom', vacio: 'Sin foto de la boleta.' },
  };

  function galeria(evs, urls, { grupo, quitar = false, conPie = true }) {
    if (!evs.length) return '';
    return `<div class="galeria" data-grupo="${esc(grupo)}">${evs.map((e, i) => {
      const pie = conPie ? `${e.subido_por ? e.subido_por.replace(/ · .*$/, '') + ' · ' : ''}${fechaCorta(e.creado)}` : '';
      return `<div class="foto">
        <button class="ver" type="button" data-accion="ver-foto" data-grupo-foto="${esc(grupo)}" data-i="${i}" data-url="${esc(urls[e.ruta] || '')}" data-pie="${esc(pie)}" aria-label="Ver foto ${i + 1}">
          <img src="${esc(urls[e.ruta] || '')}" alt="" loading="lazy">
        </button>
        ${conPie && pie ? `<span class="pie">${esc(pie)}</span>` : ''}
        ${quitar ? `<button class="quitar" type="button" data-accion="quitar-foto" data-id="${esc(e.id)}" aria-label="Quitar foto">${icono('x')}</button>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  const porTipo = (evs, tipo) => (evs || []).filter((e) => e.tipo === tipo).sort((a, b) => new Date(a.creado) - new Date(b.creado));

  function vacioHTML(ic, titulo, texto, boton = '') {
    return `<div class="vacio">${icono(ic)}<strong>${esc(titulo)}</strong>${texto ? `<p>${texto}</p>` : ''}${boton}</div>`;
  }

  // ===================================================================
  // ADMINISTRADOR · Pedidos
  // ===================================================================
  async function vistaPedidosAdmin(op) {
    const v = preparar(op);
    try {
      S.datos.pedidos = await API.pedidosAdmin();
      if (!v.vigente()) return;
      const cuenta = (e) => S.datos.pedidos.filter((p) => e === 'todos' || p.estado === e).length;
      v.pintar(`
        <div class="cab">
          <div class="cab-texto"><span class="etq">${esc(EMPRESA)}</span><h1>Pedidos</h1></div>
          <div class="cab-acciones"><a class="btn btn-flash" href="#/pedido/nuevo">${icono('mas')}Nuevo pedido</a></div>
        </div>
        <div class="herramientas">
          <div class="filtros" role="group" aria-label="Filtrar por estado">
            ${[['todos', 'Todos'], ['creado', 'Creados'], ['empaquetado', 'Empaquetados'], ['cerrado', 'Cerrados']].map(([k, t]) =>
              `<button type="button" data-accion="filtro-pedidos" data-filtro="${k}" aria-pressed="${S.filtro === k}">${t}<span class="n">${cuenta(k)}</span></button>`).join('')}
          </div>
          <label class="buscar"><span class="sr">Buscar pedidos</span>${icono('buscar')}
            <input type="search" id="buscar-pedidos" data-buscar="pedidos" placeholder="N.º de pedido, cliente o DNI" value="${esc(S.buscar.pedidos)}"></label>
        </div>
        <div id="lista-pedidos"></div>`);
      pintarListaPedidos();
    } catch (e) { v.error(e); }
  }

  function pintarListaPedidos() {
    const cont = document.getElementById('lista-pedidos');
    if (!cont) return;
    const t = norm(S.buscar.pedidos).replace(/^#/, '');
    const lista = S.datos.pedidos.filter((p) =>
      (S.filtro === 'todos' || p.estado === S.filtro) &&
      (!t || String(p.numero).includes(t) || norm(p.cliente_nombre).includes(t) || norm(p.cliente_dni).includes(t)));
    if (!S.datos.pedidos.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('pedidos', 'Aún no hay pedidos',
        'Crea el primero: elige un cliente, la dirección, el tipo de envío y los productos del inventario.',
        `<a class="btn btn-flash" href="#/pedido/nuevo">${icono('mas')}Nuevo pedido</a>`)}</div>`;
      return;
    }
    if (!lista.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('buscar', 'Ningún pedido coincide', 'Prueba con otro número, nombre o DNI, o cambia el filtro.')}</div>`;
      return;
    }
    cont.innerHTML = `
      <div class="lista">
        <div class="lista-cab col-pedidos etq"><span>N.º</span><span>Cliente</span><span>Envío</span><span>Unid.</span><span>Estado</span><span>Creado</span></div>
        ${lista.map((p) => `
          <a class="fila col-pedidos" href="#/pedido/${esc(p.id)}">
            <span class="c-num numero-pedido">#${esc(p.numero)}</span>
            <span class="c-cli"><span class="principal-txt" style="display:block">${esc(p.cliente_nombre)}</span><span class="secundario mono" style="display:block">DNI ${esc(p.cliente_dni)}</span></span>
            <span class="c-env">${envioHTML(p.envio)}</span>
            <span class="c-uni mono">${unidades(p.pedido_items)}</span>
            <span class="c-est">${estadoHTML(p.estado)}</span>
            <span class="c-fec secundario">${esc(fechaCorta(p.creado))}</span>
          </a>`).join('')}
      </div>`;
  }

  // ---------------------------------------------------------------- Detalle (admin)
  async function vistaPedidoAdmin(id, op) {
    const v = preparar(op);
    try {
      const [p, eventos] = await Promise.all([API.pedido(id), API.eventos(id)]);
      if (!v.vigente()) return;
      if (!p) {
        v.pintar(`<a class="volver" href="#/pedidos">${icono('volver')}Pedidos</a>
          <div class="tarjeta">${vacioHTML('pedidos', 'Este pedido ya no existe', 'Puede que alguien lo haya eliminado.')}</div>`);
        return;
      }
      const evs = p.evidencias || [];
      const urls = await API.urls(evs.map((e) => e.ruta));
      if (!v.vigente()) return;
      const tipos = ['productos', 'empaquetado', p.envio === 'shalom' ? 'boleta' : 'motorizado'];

      v.pintar(`
        <a class="volver" href="#/pedidos">${icono('volver')}Pedidos</a>
        <div class="bloques">
          <div class="cab" style="margin:0">
            <div class="cab-texto"><span class="etq">Detalle del pedido</span><h1>Pedido #${esc(p.numero)}</h1></div>
            <div class="cab-acciones">
              <a class="btn" href="#/pedido/${esc(p.id)}/editar">${icono('editar')}Editar</a>
              <button class="btn btn-peligro" type="button" data-accion="eliminar-pedido" data-id="${esc(p.id)}" data-numero="${esc(p.numero)}" data-estado="${esc(p.estado)}" data-unidades="${unidades(p.pedido_items)}">${icono('borrar')}Eliminar</button>
            </div>
          </div>
          ${etiquetaPedido(p)}
          <section class="tarjeta"><div class="tarjeta-cab"><h2>Proceso</h2></div><div class="tarjeta-in">${seguimiento(p)}</div></section>
          <div class="bloques-2">
            <section class="tarjeta">
              <div class="tarjeta-cab"><h2>Cliente y entrega</h2>${envioHTML(p.envio)}</div>
              <div class="tarjeta-in">
                <div class="dato"><span class="etq">Cliente</span><span class="valor">${esc(p.cliente_nombre)}${p.cliente_id ? '' : ' <span class="tenue peq">(cliente eliminado)</span>'}</span></div>
                <div class="dato"><span class="etq">DNI</span><span class="valor mono">${esc(p.cliente_dni)}</span></div>
                <div class="dato"><span class="etq">Dirección de entrega</span><span class="valor">${esc(p.direccion)}</span></div>
                ${p.envio === 'shalom' && p.shalom_clave ? `<div class="dato"><span class="etq">Clave de Shalom</span><span class="valor mono">${esc(p.shalom_clave)}</span></div>` : ''}
              </div>
            </section>
            <section class="tarjeta">
              <div class="tarjeta-cab"><h2>Productos</h2><span class="contador">${plural(ordenarItems(p.pedido_items).length, 'producto', 'productos')}</span></div>
              ${listaItems(p.pedido_items)}
            </section>
          </div>
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Evidencias</h2><span class="contador">${plural(evs.length, 'foto', 'fotos')}</span></div>
            <div class="tarjeta-in bloques">
              ${tipos.map((t) => {
                const lista = porTipo(evs, t);
                return `<div class="seccion-fotos">
                  <div class="seccion-fotos-cab"><h3>${esc(TIPOS[t].titulo)}</h3><span class="contador ${lista.length ? 'ok' : ''}">${lista.length}</span></div>
                  ${lista.length ? galeria(lista, urls, { grupo: 'adm-' + t }) : `<div class="sin-fotos">${esc(TIPOS[t].vacio)}</div>`}
                </div>`;
              }).join('<hr class="separador">')}
              ${p.envio === 'shalom' ? `<hr class="separador"><div class="seccion-fotos"><h3>Clave de Shalom</h3>
                ${p.shalom_clave ? `<div class="clave"><span class="mono">${esc(p.shalom_clave)}</span>
                  <button class="btn" type="button" data-accion="copiar" data-texto="${esc(p.shalom_clave)}">${icono('copiar')}Copiar</button></div>`
                  : '<div class="sin-fotos">El courier aún no registra la clave.</div>'}</div>` : ''}
            </div>
          </section>
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Historial</h2></div>
            ${eventos.length ? `<ul class="historial">${eventos.map((e) => `
              <li><div><div class="h-acc">${esc(e.accion)}</div>${e.detalle ? `<div class="h-det">${esc(e.detalle)}</div>` : ''}
              <div class="h-meta">${esc(fechaHora(e.creado))}${e.actor ? ' · ' + esc(e.actor) : ''}</div></div></li>`).join('')}</ul>`
              : '<div class="tarjeta-in tenue">Sin movimientos.</div>'}
          </section>
        </div>`);
    } catch (e) { v.error(e); }
  }

  // ---------------------------------------------------------------- Crear / editar pedido
  async function vistaFormPedido(id) {
    const v = preparar({});
    try {
      const [clientes, productos, pedido] = await Promise.all([
        API.clientes(), API.productos(), id ? API.pedido(id) : Promise.resolve(null),
      ]);
      if (!v.vigente()) return;
      if (id && !pedido) {
        v.pintar(`<a class="volver" href="#/pedidos">${icono('volver')}Pedidos</a><div class="tarjeta">${vacioHTML('pedidos', 'Este pedido ya no existe', '')}</div>`);
        return;
      }
      S.datos.clientes = clientes;
      S.datos.productos = productos;

      const original = {};
      (pedido?.pedido_items || []).forEach((i) => { if (i.producto_id) original[i.producto_id] = (original[i.producto_id] || 0) + i.cantidad; });
      const editable = !pedido || pedido.estado === 'creado';
      S.form = {
        id: pedido?.id || null,
        estado: pedido?.estado || 'creado',
        original,
        editable,
        items: ordenarItems(pedido?.pedido_items).map((i) => ({
          producto_id: i.producto_id, nombre: i.nombre, descripcion: i.descripcion, cantidad: i.cantidad,
        })),
      };
      const clienteSel = pedido?.cliente_id || S.preCliente || '';
      S.preCliente = null;
      const volver = pedido ? `#/pedido/${pedido.id}` : '#/pedidos';

      if (!clientes.length && !pedido) {
        v.pintar(`<a class="volver" href="#/pedidos">${icono('volver')}Pedidos</a>
          <div class="tarjeta">${vacioHTML('clientes', 'Primero crea un cliente', 'Cada pedido necesita un cliente con su cuenta.',
            `<a class="btn btn-flash" href="#/clientes">${icono('mas')}Ir a clientes</a>`)}</div>`);
        return;
      }

      v.pintar(`
        <a class="volver" href="${volver}">${icono('volver')}${pedido ? 'Pedido #' + esc(pedido.numero) : 'Pedidos'}</a>
        <div class="cab"><div class="cab-texto"><span class="etq">${pedido ? 'Pedido #' + esc(pedido.numero) : 'Se registrará como «pedido creado»'}</span>
          <h1>${pedido ? 'Editar pedido' : 'Nuevo pedido'}</h1></div></div>
        <form data-form="pedido" class="bloques" novalidate>
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Cliente y entrega</h2></div>
            <div class="tarjeta-in rejilla-form">
              <div class="campo">
                <label for="f-cliente">Cliente</label>
                <select id="f-cliente" name="cliente" data-accion-cambio="cliente-pedido" required>
                  <option value="">Elige un cliente…</option>
                  ${clientes.map((c) => `<option value="${esc(c.id)}" ${c.id === clienteSel ? 'selected' : ''}>${esc(c.apellidos)}, ${esc(c.nombres)} · DNI ${esc(c.dni)}</option>`).join('')}
                  ${pedido && !pedido.cliente_id ? `<option value="" selected disabled>${esc(pedido.cliente_nombre)} (eliminado)</option>` : ''}
                </select>
              </div>
              <div class="campo">
                <label for="f-direccion">Dirección de entrega</label>
                <textarea id="f-direccion" name="direccion" rows="2" placeholder="Calle, número, distrito y referencia" required>${esc(pedido?.direccion || '')}</textarea>
                <span class="ayuda" id="f-direccion-ayuda" hidden>Se completó con la dirección de su último pedido.</span>
              </div>
              <div class="campo">
                <span class="etiqueta-campo" id="f-envio-lbl">Tipo de envío</span>
                <div class="opciones-envio" role="radiogroup" aria-labelledby="f-envio-lbl">
                  <label class="opcion-envio"><input type="radio" name="envio" value="motorizado" ${pedido?.envio === 'motorizado' ? 'checked' : ''} ${pedido?.estado === 'cerrado' ? 'disabled' : ''}><span>${icono('moto')}Motorizado</span></label>
                  <label class="opcion-envio"><input type="radio" name="envio" value="shalom" ${pedido?.envio === 'shalom' ? 'checked' : ''} ${pedido?.estado === 'cerrado' ? 'disabled' : ''}><span>${icono('shalom')}Shalom</span></label>
                </div>
                ${pedido?.estado === 'cerrado' ? '<span class="ayuda">El pedido ya está cerrado: el tipo de envío no se puede cambiar.</span>' : ''}
              </div>
            </div>
          </section>

          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Productos del inventario</h2><span class="contador" id="f-total">0 unidades</span></div>
            <div class="tarjeta-in rejilla-form">
              ${editable ? `
                <div class="agregar-producto">
                  <div class="campo"><label for="f-producto">Producto</label>
                    <select id="f-producto"></select></div>
                  <div class="campo"><label for="f-cantidad">Cantidad</label>
                    <input id="f-cantidad" type="number" min="1" step="1" inputmode="numeric" value="1"></div>
                  <button class="btn btn-tinta" type="button" data-accion="agregar-item">${icono('mas')}Agregar</button>
                </div>
                <div class="error-form" id="f-item-error" hidden></div>`
                : `<div class="aviso">${icono('info')}<span>Los productos ya no se pueden cambiar porque el pedido ya fue empaquetado. Puedes corregir el cliente${pedido.estado === 'cerrado' ? ' y la dirección' : ', la dirección y el tipo de envío'}.</span></div>`}
              <ul class="items-form" id="f-items"></ul>
            </div>
          </section>

          <div class="error-form" id="f-error" hidden></div>
          <div class="acciones-pie">
            <a class="btn btn-grande" href="${volver}">Cancelar</a>
            <button class="btn btn-flash btn-grande" type="submit">${pedido ? 'Guardar cambios' : 'Crear pedido'}</button>
          </div>
        </form>`);
      pintarItemsForm();
    } catch (e) { v.error(e); }
  }

  const disponible = (productoId) => {
    const p = S.datos.productos.find((x) => x.id === productoId);
    return (p ? p.cantidad : 0) + (S.form.original[productoId] || 0);
  };

  function pintarItemsForm() {
    const f = S.form;
    const ul = document.getElementById('f-items');
    if (!ul) return;
    if (!f.items.length) {
      ul.innerHTML = `<li style="grid-template-columns:1fr" class="tenue">Todavía no agregaste productos.</li>`;
    } else {
      ul.innerHTML = f.items.map((it, idx) => {
        const disp = it.producto_id ? disponible(it.producto_id) : null;
        const mal = f.editable && disp !== null && it.cantidad > disp;
        return `<li>
          <div style="min-width:0"><div style="font-weight:600">${esc(it.nombre)}</div>
            ${it.descripcion ? `<div class="tenue peq">${esc(it.descripcion)}</div>` : ''}
            ${f.editable ? `<div class="disp ${mal ? 'mal' : ''}" data-disp="${idx}">${disp === null ? 'Ya no está en el inventario' : mal ? `Solo hay ${disp} disponibles` : `Disponibles: ${disp}`}</div>` : ''}
          </div>
          ${f.editable
            ? `<input type="number" min="1" step="1" inputmode="numeric" value="${esc(it.cantidad)}" data-cant-item="${idx}" aria-label="Cantidad de ${esc(it.nombre)}">
               <button class="btn btn-texto btn-icono" type="button" data-accion="quitar-item" data-idx="${idx}" aria-label="Quitar ${esc(it.nombre)}">${icono('x')}</button>`
            : `<span class="mono" style="text-align:center;font-weight:700">${esc(it.cantidad)}</span><span></span>`}
        </li>`;
      }).join('');
    }
    const total = unidades(f.items);
    const tot = document.getElementById('f-total');
    if (tot) tot.textContent = plural(total, 'unidad', 'unidades');

    const sel = document.getElementById('f-producto');
    if (sel) {
      const previo = sel.value;
      const productos = S.datos.productos;
      sel.innerHTML = productos.length
        ? '<option value="">Elige un producto…</option>' + productos.map((p) => {
          const usado = f.items.filter((i) => i.producto_id === p.id).reduce((s, i) => s + i.cantidad, 0);
          const libre = disponible(p.id) - usado;
          return `<option value="${esc(p.id)}" ${libre <= 0 ? 'disabled' : ''}>${esc(p.nombre)} — ${libre <= 0 ? 'sin stock' : libre + ' disp.'}</option>`;
        }).join('')
        : '<option value="">El inventario está vacío</option>';
      if (previo && sel.querySelector(`option[value="${CSS.escape(previo)}"]:not([disabled])`)) sel.value = previo;
    }
  }

  function agregarItem() {
    const f = S.form;
    const sel = document.getElementById('f-producto');
    const cant = parseInt(document.getElementById('f-cantidad').value, 10);
    const err = document.getElementById('f-item-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    if (!sel.value) return mostrar('Elige un producto.');
    if (!Number.isInteger(cant) || cant < 1) return mostrar('La cantidad debe ser 1 o más.');
    const prod = S.datos.productos.find((p) => p.id === sel.value);
    const existente = f.items.find((i) => i.producto_id === prod.id);
    const ya = existente ? existente.cantidad : 0;
    const disp = disponible(prod.id);
    if (ya + cant > disp) return mostrar(`Solo hay ${disp} de «${prod.nombre}»${ya ? ` y ya agregaste ${ya}` : ''}.`);
    if (existente) existente.cantidad += cant;
    else f.items.push({ producto_id: prod.id, nombre: prod.nombre, descripcion: prod.descripcion, cantidad: cant });
    document.getElementById('f-cantidad').value = 1;
    sel.value = '';
    pintarItemsForm();
  }

  async function guardarPedido(form) {
    const f = S.form;
    const err = document.getElementById('f-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    err.hidden = true;
    const cliente_id = form.cliente.value;
    const direccion = form.direccion.value.trim();
    const envio = form.querySelector('input[name=envio]:checked')?.value;
    if (!cliente_id) return mostrar('Elige un cliente.');
    if (!direccion) return mostrar('Escribe la dirección de entrega.');
    if (!envio) return mostrar('Elige si el envío es por motorizado o por Shalom.');
    let items = null;
    if (f.editable) {
      if (!f.items.length) return mostrar('Agrega al menos un producto del inventario.');
      const malo = f.items.find((i) => !i.producto_id || i.cantidad < 1 || i.cantidad > disponible(i.producto_id));
      if (malo) return mostrar(!malo.producto_id ? `«${malo.nombre}» ya no está en el inventario: quítalo del pedido.` : `Revisa la cantidad de «${malo.nombre}»: hay ${disponible(malo.producto_id)} disponibles.`);
      items = f.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const texto = btn.textContent;
    btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
    try {
      const id = await API.guardarPedido({ id: f.id, cliente_id, direccion, envio, items });
      aviso(f.id ? 'Cambios guardados' : 'Pedido creado');
      S.form = null;
      ir('pedido/' + id);
    } catch (e) {
      btn.disabled = false; btn.textContent = texto;
      mostrar(e.message);
      if (/stock/i.test(e.message)) {
        try { S.datos.productos = await API.productos(); pintarItemsForm(); } catch { /* sin cambios */ }
      }
    }
  }

  // ===================================================================
  // ADMINISTRADOR · Inventario
  // ===================================================================
  async function vistaInventario(op) {
    const v = preparar(op);
    try {
      S.datos.productos = await API.productos();
      if (!v.vigente()) return;
      const total = S.datos.productos.reduce((s, p) => s + p.cantidad, 0);
      v.pintar(`
        <div class="cab">
          <div class="cab-texto"><span class="etq">${plural(S.datos.productos.length, 'producto', 'productos')} · ${plural(total, 'unidad', 'unidades')} en almacén</span><h1>Inventario</h1></div>
          <div class="cab-acciones"><button class="btn btn-flash" type="button" data-accion="nuevo-producto">${icono('mas')}Agregar producto</button></div>
        </div>
        <div class="herramientas">
          <label class="buscar"><span class="sr">Buscar productos</span>${icono('buscar')}
            <input type="search" id="buscar-productos" data-buscar="productos" placeholder="Buscar por nombre o descripción" value="${esc(S.buscar.productos)}"></label>
        </div>
        <div id="lista-productos"></div>`);
      pintarListaProductos();
    } catch (e) { v.error(e); }
  }

  function pintarListaProductos() {
    const cont = document.getElementById('lista-productos');
    if (!cont) return;
    const t = norm(S.buscar.productos);
    const lista = S.datos.productos.filter((p) => !t || norm(p.nombre).includes(t) || norm(p.descripcion).includes(t));
    if (!S.datos.productos.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('inventario', 'El inventario está vacío',
        'Agrega tus productos con su nombre, descripción y cantidad. Cuando crees pedidos, la cantidad se descuenta sola.',
        `<button class="btn btn-flash" type="button" data-accion="nuevo-producto">${icono('mas')}Agregar producto</button>`)}</div>`;
      return;
    }
    if (!lista.length) { cont.innerHTML = `<div class="tarjeta">${vacioHTML('buscar', 'Ningún producto coincide', '')}</div>`; return; }
    cont.innerHTML = `
      <div class="lista">
        <div class="lista-cab col-productos etq"><span>Producto</span><span>Descripción</span><span style="text-align:right">Cantidad</span><span></span></div>
        ${lista.map((p) => `
          <div class="fila col-productos">
            <span class="c-nom principal-txt">${esc(p.nombre)}</span>
            <span class="c-des secundario">${esc(p.descripcion || '—')}</span>
            <span class="c-can" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end">
              ${p.cantidad === 0 ? '<span class="stock agotado">Agotado</span>' : p.cantidad <= 5 ? '<span class="stock pocos">Quedan pocos</span>' : ''}
              <span class="cantidad-grande">${esc(p.cantidad)}</span></span>
            <span class="c-acc acciones">
              <button class="btn btn-texto btn-icono peq" type="button" data-accion="editar-producto" data-id="${esc(p.id)}" aria-label="Editar ${esc(p.nombre)}">${icono('editar')}</button>
              <button class="btn btn-texto btn-icono peq" type="button" data-accion="eliminar-producto" data-id="${esc(p.id)}" aria-label="Eliminar ${esc(p.nombre)}">${icono('borrar')}</button>
            </span>
          </div>`).join('')}
      </div>`;
  }

  function modalProducto(p) {
    abrirModal({
      titulo: p ? 'Editar producto' : 'Agregar producto',
      html: `
        <form data-form="producto" novalidate>
          <input type="hidden" name="id" value="${esc(p?.id || '')}">
          <div class="modal-cuerpo">
            <div class="campo"><label for="p-nombre">Nombre</label>
              <input id="p-nombre" name="nombre" type="text" maxlength="120" value="${esc(p?.nombre || '')}" placeholder="Ej. Polo Maxeta negro" required></div>
            <div class="campo"><label for="p-desc">Descripción</label>
              <textarea id="p-desc" name="descripcion" rows="2" maxlength="500" placeholder="Talla, color, modelo…">${esc(p?.descripcion || '')}</textarea></div>
            <div class="campo"><label for="p-cant">Cantidad</label>
              <input id="p-cant" name="cantidad" type="number" min="0" step="1" inputmode="numeric" value="${esc(p ? p.cantidad : '')}" placeholder="Ej. 20" required>
              <span class="ayuda">Unidades disponibles en almacén. Al crear un pedido se descuentan solas.</span></div>
            <div class="error-form" id="p-error" hidden></div>
          </div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn btn-flash" type="submit">${p ? 'Guardar' : 'Agregar'}</button>
          </div>
        </form>`,
    });
  }

  async function guardarProducto(form) {
    const err = document.getElementById('p-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    const nombre = form.nombre.value.trim().replace(/\s+/g, ' ');
    const descripcion = form.descripcion.value.trim() || null;
    const cantidad = Number(form.cantidad.value);
    if (!nombre) return mostrar('Escribe el nombre del producto.');
    if (form.cantidad.value === '' || !Number.isInteger(cantidad) || cantidad < 0) return mostrar('La cantidad debe ser un número entero, 0 o más.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await API.guardarProducto({ id: form.id.value || null, nombre, descripcion, cantidad });
      cerrarModal();
      aviso(form.id.value ? 'Producto actualizado' : 'Producto agregado');
      render({ silencioso: true });
    } catch (e) { btn.disabled = false; mostrar(e.message); }
  }

  // ===================================================================
  // ADMINISTRADOR · Clientes
  // ===================================================================
  async function vistaClientes(op) {
    const v = preparar(op);
    try {
      S.datos.clientes = await API.clientes();
      if (!v.vigente()) return;
      v.pintar(`
        <div class="cab">
          <div class="cab-texto"><span class="etq">${plural(S.datos.clientes.length, 'cliente', 'clientes')} con cuenta</span><h1>Clientes</h1></div>
          <div class="cab-acciones"><button class="btn btn-flash" type="button" data-accion="nuevo-cliente">${icono('mas')}Nuevo cliente</button></div>
        </div>
        <div class="herramientas">
          <label class="buscar"><span class="sr">Buscar clientes</span>${icono('buscar')}
            <input type="search" id="buscar-clientes" data-buscar="clientes" placeholder="Buscar por DNI, nombre o apellido" value="${esc(S.buscar.clientes)}"></label>
        </div>
        <div id="lista-clientes"></div>`);
      pintarListaClientes();
    } catch (e) { v.error(e); }
  }

  const nPedidos = (c) => c.pedidos?.[0]?.count ?? 0;

  function pintarListaClientes() {
    const cont = document.getElementById('lista-clientes');
    if (!cont) return;
    const t = norm(S.buscar.clientes);
    const lista = S.datos.clientes.filter((c) => !t || norm(c.dni).includes(t) || norm(`${c.nombres} ${c.apellidos}`).includes(t) || norm(`${c.apellidos} ${c.nombres}`).includes(t));
    if (!S.datos.clientes.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('clientes', 'Aún no hay clientes',
        'Crea la cuenta de cada cliente con su DNI, nombre, apellidos y una contraseña. Con esos datos entra a ver sus pedidos.',
        `<button class="btn btn-flash" type="button" data-accion="nuevo-cliente">${icono('mas')}Nuevo cliente</button>`)}</div>`;
      return;
    }
    if (!lista.length) { cont.innerHTML = `<div class="tarjeta">${vacioHTML('buscar', 'Ningún cliente coincide', '')}</div>`; return; }
    cont.innerHTML = `
      <div class="lista">
        <div class="lista-cab col-clientes etq"><span>DNI</span><span>Apellidos y nombres</span><span>Pedidos</span><span></span></div>
        ${lista.map((c) => `
          <div class="fila col-clientes">
            <span class="c-dni mono secundario" style="color:var(--ink-2)">${esc(c.dni)}</span>
            <span class="c-nom principal-txt">${esc(c.apellidos)}, ${esc(c.nombres)}${c.user_id ? '' : ' <span class="stock agotado">Sin acceso</span>'}</span>
            <span class="c-ped mono">${nPedidos(c)}</span>
            <span class="c-acc acciones">
              <button class="btn btn-texto btn-icono peq" type="button" data-accion="pedido-para" data-id="${esc(c.id)}" aria-label="Nuevo pedido para ${esc(c.nombres)}" title="Nuevo pedido">${icono('mas')}</button>
              <button class="btn btn-texto btn-icono peq" type="button" data-accion="editar-cliente" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nombres)}" title="Editar">${icono('editar')}</button>
              <button class="btn btn-texto btn-icono peq" type="button" data-accion="eliminar-cliente" data-id="${esc(c.id)}" aria-label="Eliminar ${esc(c.nombres)}" title="Eliminar">${icono('borrar')}</button>
            </span>
          </div>`).join('')}
      </div>`;
  }

  function claveSugerida() {
    const letras = 'abcdefghjkmnpqrstuvwxyz';
    let s = '';
    for (let i = 0; i < 3; i++) s += letras[Math.floor(Math.random() * letras.length)];
    return s + String(Math.floor(100 + Math.random() * 900));
  }

  function modalCliente(c) {
    abrirModal({
      titulo: c ? 'Editar cliente' : 'Nuevo cliente',
      html: `
        <form data-form="cliente" novalidate autocomplete="off">
          <input type="hidden" name="id" value="${esc(c?.id || '')}">
          <div class="modal-cuerpo">
            <div class="campo"><label for="c-dni">DNI</label>
              <input id="c-dni" name="dni" type="text" inputmode="numeric" maxlength="15" value="${esc(c?.dni || '')}" placeholder="Ej. 45678912" required>
              <span class="ayuda">Con este DNI el cliente ingresa al sistema.</span></div>
            <div class="dos-col">
              <div class="campo"><label for="c-nombres">Nombres</label>
                <input id="c-nombres" name="nombres" type="text" maxlength="80" value="${esc(c?.nombres || '')}" required></div>
              <div class="campo"><label for="c-apellidos">Apellidos</label>
                <input id="c-apellidos" name="apellidos" type="text" maxlength="80" value="${esc(c?.apellidos || '')}" required></div>
            </div>
            <div class="campo"><label for="c-clave">${c ? 'Nueva contraseña' : 'Contraseña'}</label>
              <div class="con-boton">
                <input id="c-clave" name="password" type="text" autocomplete="new-password" spellcheck="false" minlength="6" placeholder="${c ? 'Déjalo vacío para no cambiarla' : 'Mínimo 6 caracteres'}">
                <button class="btn" type="button" data-accion="generar-clave">Generar</button>
              </div>
              <span class="ayuda">${c ? 'Escribe una solo si quieres cambiarla.' : 'Anótala o cópiala al terminar: es la que le darás al cliente.'}</span></div>
            <div class="error-form" id="c-error" hidden></div>
          </div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn btn-flash" type="submit">${c ? 'Guardar' : 'Crear cliente'}</button>
          </div>
        </form>`,
    });
  }

  async function guardarCliente(form) {
    const err = document.getElementById('c-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    const id = form.id.value || null;
    const dni = limpiarDni(form.dni.value);
    const nombres = form.nombres.value.trim().replace(/\s+/g, ' ');
    const apellidos = form.apellidos.value.trim().replace(/\s+/g, ' ');
    const password = form.password.value.trim();
    if (dni.length < 6 || dni.length > 15) return mostrar('El DNI debe tener entre 6 y 15 números o letras.');
    if (!nombres) return mostrar('Escribe los nombres.');
    if (!apellidos) return mostrar('Escribe los apellidos.');
    if (!id && password.length < 6) return mostrar('La contraseña debe tener al menos 6 caracteres.');
    if (id && password && password.length < 6) return mostrar('La nueva contraseña debe tener al menos 6 caracteres.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const texto = btn.textContent;
    btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
    try {
      await API.usuarios(id
        ? { accion: 'editar_cliente', id, dni, nombres, apellidos, password }
        : { accion: 'crear_cliente', dni, nombres, apellidos, password });
      cerrarModal();
      render({ silencioso: true });
      if (password) modalAccesoCliente({ dni, nombres, password, nuevo: !id });
      else aviso('Cliente actualizado');
    } catch (e) {
      btn.disabled = false; btn.textContent = texto;
      mostrar(e.message);
    }
  }

  function modalAccesoCliente({ dni, nombres, password, nuevo }) {
    const url = location.origin + location.pathname + '#cliente';
    const mensaje = `Hola ${nombres}, ya puedes ver tus pedidos de ${EMPRESA}.\nIngresa a: ${url}\nDNI: ${dni}\nContraseña: ${password}`;
    abrirModal({
      titulo: nuevo ? 'Cliente creado' : 'Contraseña actualizada',
      html: `
        <div class="modal-cuerpo">
          <p>Envíale estos datos al cliente para que vea sus pedidos.</p>
          <div class="acceso-dado">
            <div class="fila-dato"><span class="etq">Enlace</span><span class="mono peq">${esc(url)}</span></div>
            <div class="fila-dato"><span class="etq">DNI</span><span class="mono">${esc(dni)}</span></div>
            <div class="fila-dato"><span class="etq">Contraseña</span><span class="mono">${esc(password)}</span></div>
          </div>
        </div>
        <div class="modal-pie">
          <button class="btn" type="button" data-accion="cerrar-modal">Listo</button>
          <button class="btn btn-flash" type="button" data-accion="copiar" data-texto="${esc(mensaje)}">${icono('copiar')}Copiar mensaje</button>
        </div>`,
    });
  }

  // ===================================================================
  // COURIER
  // ===================================================================
  async function vistaCourier(op) {
    const v = preparar(op);
    try {
      const pedidos = await API.pedidosCourier();
      if (!v.vigente()) return;
      const porEmpaquetar = pedidos.filter((p) => p.estado === 'creado');
      const porDespachar = pedidos.filter((p) => p.estado === 'empaquetado');
      const lista = S.tabCourier === 'creado' ? porEmpaquetar : porDespachar;
      v.pintar(`
        <div class="saludo"><span class="etq">Vista courier</span><h1>Pedidos</h1></div>
        <div class="herramientas">
          <div class="filtros" role="group" aria-label="Etapa">
            <button type="button" data-accion="tab-courier" data-tab="creado" aria-pressed="${S.tabCourier === 'creado'}">Por empaquetar<span class="n">${porEmpaquetar.length}</span></button>
            <button type="button" data-accion="tab-courier" data-tab="empaquetado" aria-pressed="${S.tabCourier === 'empaquetado'}">Por despachar<span class="n">${porDespachar.length}</span></button>
          </div>
        </div>
        ${lista.length ? `<div class="pedidos-tarjetas">${lista.map((p) => `
          <a class="pedido-tarjeta" href="#/courier/${esc(p.id)}">
            <div class="pedido-tarjeta-sup"><span class="numero-pedido">#${esc(p.numero)}</span>
              <span style="display:flex;gap:.4rem;flex-wrap:wrap">${envioHTML(p.envio)}${estadoHTML(p.estado)}</span></div>
            <div class="linea">${icono('usuario')}<span><strong style="color:var(--ink)">${esc(p.cliente_nombre)}</strong> · DNI <span class="mono">${esc(p.cliente_dni)}</span></span></div>
            <div class="linea">${icono('ubicacion')}<span>${esc(p.direccion)}</span></div>
            <div class="linea">${icono('caja')}<span>${plural(p.pedido_items.length, 'producto', 'productos')} · ${plural(unidades(p.pedido_items), 'unidad', 'unidades')}</span></div>
          </a>`).join('')}</div>`
          : `<div class="tarjeta">${S.tabCourier === 'creado'
            ? vacioHTML('caja', 'No hay pedidos por empaquetar', 'Cuando el administrador cree un pedido, aparecerá aquí.')
            : vacioHTML('moto', 'No hay pedidos por despachar', 'Los pedidos que empaquetes aparecerán aquí para registrar el envío.')}</div>`}`);
    } catch (e) { v.error(e); }
  }

  async function vistaPedidoCourier(id, op) {
    const v = preparar(op);
    try {
      const p = await API.pedido(id);
      if (!v.vigente()) return;
      if (!p || p.estado === 'cerrado') {
        v.pintar(`<a class="volver" href="#/courier">${icono('volver')}Pedidos</a>
          <div class="tarjeta">${vacioHTML('check', p ? 'Este pedido ya está cerrado' : 'Este pedido ya no está disponible', 'Vuelve a la lista para ver los pendientes.')}</div>`);
        return;
      }
      const evs = p.evidencias || [];
      const urls = await API.urls(evs.map((e) => e.ruta));
      if (!v.vigente()) return;

      const datos = `
        <section class="tarjeta">
          <div class="tarjeta-cab"><h2>Datos del pedido</h2>${envioHTML(p.envio)}</div>
          <div class="tarjeta-in">
            <div class="dato"><span class="etq">Cliente</span><span class="valor">${esc(p.cliente_nombre)}</span></div>
            <div class="dato"><span class="etq">DNI</span><span class="valor mono">${esc(p.cliente_dni)}</span></div>
            <div class="dato"><span class="etq">Dirección del pedido</span><span class="valor">${esc(p.direccion)}</span></div>
          </div>
        </section>
        <section class="tarjeta">
          <div class="tarjeta-cab"><h2>Productos</h2><span class="contador">${plural(ordenarItems(p.pedido_items).length, 'producto', 'productos')}</span></div>
          ${listaItems(p.pedido_items)}
        </section>`;

      const seccionFotos = (tipo, ayuda) => {
        const lista = porTipo(evs, tipo);
        return `
          <section class="tarjeta paso-courier ${lista.length ? 'listo' : ''}">
            <div class="tarjeta-cab"><h2>${esc(TIPOS[tipo].titulo)}</h2><span class="contador ${lista.length ? 'ok' : ''}">${plural(lista.length, 'foto', 'fotos')}</span></div>
            <div class="tarjeta-in seccion-fotos">
              <p class="medio">${ayuda}</p>
              ${lista.length ? galeria(lista, urls, { grupo: 'cou-' + tipo, quitar: true, conPie: false }) : ''}
              <div class="subir" id="subir-${tipo}">
                <label class="btn btn-tinta">${icono('camara')}Tomar foto
                  <input type="file" accept="image/*" capture="environment" data-subir="${tipo}" data-pedido="${esc(p.id)}"></label>
                <label class="btn">${icono('imagen')}Elegir de galería
                  <input type="file" accept="image/*" multiple data-subir="${tipo}" data-pedido="${esc(p.id)}"></label>
              </div>
            </div>
          </section>`;
      };

      let cuerpo;
      if (p.estado === 'creado') {
        const enCurso = S.empaquetando[p.id] || evs.length > 0;
        if (!enCurso) {
          cuerpo = `
            ${datos}
            <button class="btn btn-flash btn-grande btn-bloque" type="button" data-accion="empezar-empaque" data-id="${esc(p.id)}">${icono('caja')}Empaquetar</button>`;
        } else {
          const okP = porTipo(evs, 'productos').length > 0;
          const okE = porTipo(evs, 'empaquetado').length > 0;
          cuerpo = `
            ${datos}
            ${seccionFotos('productos', 'Agrega una o más fotos de los productos que estás metiendo en el paquete.')}
            ${seccionFotos('empaquetado', 'Agrega una o más fotos del pedido ya empaquetado.')}
            <button class="btn btn-flash btn-grande btn-bloque" type="button" data-accion="marcar-empaquetado" data-id="${esc(p.id)}" data-numero="${esc(p.numero)}" ${okP && okE ? '' : 'disabled'}>${icono('check')}Pedido empaquetado</button>
            ${okP && okE ? '' : '<p class="tenue peq" style="text-align:center">Agrega al menos una foto en cada sección para continuar.</p>'}`;
        }
      } else {
        // Empaquetado: falta registrar el envío
        const resumen = `
          <div class="aviso">${icono('check')}<span>Empaquetado el ${esc(fechaHora(p.empaquetado_en))}. Ahora registra el envío.</span></div>`;
        if (p.envio === 'motorizado') {
          const ok = porTipo(evs, 'motorizado').length > 0;
          cuerpo = `
            ${resumen}
            ${seccionFotos('motorizado', 'Agrega una o más fotos del motorizado con el pedido.')}
            <button class="btn btn-flash btn-grande btn-bloque" type="button" data-accion="cerrar-pedido" data-id="${esc(p.id)}" data-numero="${esc(p.numero)}" ${ok ? '' : 'disabled'}>${icono('check')}Cerrar pedido</button>
            ${ok ? '' : '<p class="tenue peq" style="text-align:center">Agrega al menos una foto del motorizado para cerrar el pedido.</p>'}
            ${datos}`;
        } else {
          const ok = porTipo(evs, 'boleta').length > 0;
          const clave = S.clave[p.id] ?? '';
          cuerpo = `
            ${resumen}
            ${seccionFotos('boleta', 'Agrega la foto de la boleta de Shalom.')}
            <section class="tarjeta paso-courier ${clave.trim() ? 'listo' : ''}" id="tarjeta-clave">
              <div class="tarjeta-cab"><h2>Clave de Shalom</h2></div>
              <div class="tarjeta-in campo">
                <label for="clave-shalom">Clave de recojo que te dio Shalom</label>
                <input id="clave-shalom" type="text" autocomplete="off" spellcheck="false" class="mono" data-clave-pedido="${esc(p.id)}" value="${esc(clave)}" placeholder="Ej. 4821">
              </div>
            </section>
            <button class="btn btn-flash btn-grande btn-bloque" type="button" id="btn-cerrar" data-accion="cerrar-pedido" data-id="${esc(p.id)}" data-numero="${esc(p.numero)}" data-boleta="${ok ? 1 : 0}" ${ok && clave.trim() ? '' : 'disabled'}>${icono('check')}Cerrar pedido</button>
            <p class="tenue peq" id="ayuda-cerrar" style="text-align:center" ${ok && clave.trim() ? 'hidden' : ''}>Agrega la foto de la boleta y escribe la clave para cerrar el pedido.</p>
            ${datos}`;
        }
      }

      v.pintar(`
        <a class="volver" href="#/courier">${icono('volver')}Pedidos</a>
        <div class="bloques">
          ${etiquetaPedido(p)}
          ${cuerpo}
        </div>`);
    } catch (e) { v.error(e); }
  }

  async function subirFotos(input) {
    const archivos = [...(input.files || [])];
    if (!archivos.length) return;
    const tipo = input.dataset.subir;
    const pedidoId = input.dataset.pedido;
    const zona = document.getElementById('subir-' + tipo);
    const marcador = document.createElement('div');
    marcador.className = 'sin-fotos';
    marcador.innerHTML = `<span class="spin" aria-hidden="true"></span>Subiendo ${plural(archivos.length, 'foto', 'fotos')}…`;
    zona?.parentNode.insertBefore(marcador, zona);
    zona?.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    S.subiendo++;
    let fallas = 0;
    let ultimoError = '';
    for (const a of archivos) {
      try { await API.subirFoto(pedidoId, tipo, a); } catch (e) { fallas++; ultimoError = e.message; }
    }
    S.subiendo--;
    input.value = '';
    if (fallas) aviso(fallas === archivos.length ? `No se pudo subir: ${ultimoError}` : `${fallas} de ${archivos.length} fotos no se subieron. Inténtalo otra vez.`, 'error');
    else aviso(archivos.length === 1 ? 'Foto agregada' : `${archivos.length} fotos agregadas`);
    render({ silencioso: true });
  }

  // ===================================================================
  // CLIENTE
  // ===================================================================
  async function vistaCliente(op) {
    const v = preparar(op);
    try {
      const pedidos = await API.pedidosCliente();
      if (!v.vigente()) return;
      const actuales = pedidos.filter((p) => p.estado !== 'cerrado');
      const historial = pedidos.filter((p) => p.estado === 'cerrado');
      const lista = S.tabCliente === 'actuales' ? actuales : historial;
      v.pintar(`
        <div class="saludo"><span class="etq">${esc(EMPRESA)}</span><h1>Hola, ${esc(S.perfil.nombres || S.perfil.nombre)}</h1></div>
        <div class="herramientas">
          <div class="filtros" role="group" aria-label="Mis pedidos">
            <button type="button" data-accion="tab-cliente" data-tab="actuales" aria-pressed="${S.tabCliente === 'actuales'}">Pedidos actuales<span class="n">${actuales.length}</span></button>
            <button type="button" data-accion="tab-cliente" data-tab="historial" aria-pressed="${S.tabCliente === 'historial'}">Historial<span class="n">${historial.length}</span></button>
          </div>
        </div>
        ${lista.length ? `<div class="pedidos-tarjetas">${lista.map((p) => {
          const its = ordenarItems(p.pedido_items);
          const resumen = its.slice(0, 2).map((i) => `${i.cantidad} × ${i.nombre}`).join(' · ') + (its.length > 2 ? ` · y ${its.length - 2} más` : '');
          return `
          <a class="pedido-tarjeta" href="#/mi-pedido/${esc(p.id)}">
            <div class="pedido-tarjeta-sup"><span class="numero-pedido">Pedido #${esc(p.numero)}</span>${estadoClienteHTML(p)}</div>
            <div class="linea">${icono('caja')}<span>${esc(resumen)}</span></div>
            <div class="linea">${icono(p.envio === 'shalom' ? 'shalom' : 'moto')}<span>${p.envio === 'shalom' ? 'Envío por Shalom' : 'Envío por motorizado'} · ${esc(fecha(p.creado))}</span></div>
          </a>`;
        }).join('')}</div>`
          : `<div class="tarjeta">${S.tabCliente === 'actuales'
            ? vacioHTML('caja', 'No tienes pedidos en curso', 'Cuando tengas un pedido nuevo, aquí verás cómo avanza.')
            : vacioHTML('reloj', 'Aún no hay pedidos enviados', 'Aquí quedarán tus pedidos ya enviados.')}</div>`}`);
    } catch (e) { v.error(e); }
  }

  async function vistaPedidoCliente(id, op) {
    const v = preparar(op);
    try {
      const p = await API.pedido(id);
      if (!v.vigente()) return;
      if (!p) {
        v.pintar(`<a class="volver" href="#/mis-pedidos">${icono('volver')}Mis pedidos</a>
          <div class="tarjeta">${vacioHTML('pedidos', 'No encontramos este pedido', '')}</div>`);
        return;
      }
      const evs = p.evidencias || [];
      const urls = await API.urls(evs.map((e) => e.ruta));
      if (!v.vigente()) return;

      let envio;
      if (p.envio === 'motorizado') {
        const fotos = porTipo(evs, 'motorizado');
        envio = `
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Foto del motorizado</h2>${envioHTML('motorizado')}</div>
            <div class="tarjeta-in seccion-fotos">
              ${p.estado === 'cerrado' && fotos.length
                ? `<p class="medio">Tu pedido salió con el motorizado el ${esc(fechaHora(p.cerrado_en))}.</p>${galeria(fotos, urls, { grupo: 'cli-moto', conPie: false })}`
                : '<div class="sin-fotos">Cuando tu pedido salga, aquí verás la foto del motorizado con tu pedido.</div>'}
            </div>
          </section>`;
      } else {
        const fotos = porTipo(evs, 'boleta');
        envio = `
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Envío por Shalom</h2>${envioHTML('shalom')}</div>
            <div class="tarjeta-in bloques">
              ${p.estado === 'cerrado'
                ? `${p.shalom_clave ? `<div class="seccion-fotos"><h3>Clave de recojo</h3>
                    <div class="clave"><span class="mono">${esc(p.shalom_clave)}</span>
                    <button class="btn" type="button" data-accion="copiar" data-texto="${esc(p.shalom_clave)}">${icono('copiar')}Copiar</button></div>
                    <p class="tenue peq">Preséntala en la agencia Shalom junto con tu DNI para recoger tu pedido.</p></div>` : ''}
                   <div class="seccion-fotos"><h3>Boleta de Shalom</h3>
                    ${fotos.length ? galeria(fotos, urls, { grupo: 'cli-boleta', conPie: false }) : '<div class="sin-fotos">Sin foto de la boleta.</div>'}</div>`
                : '<div class="sin-fotos">Cuando enviemos tu pedido, aquí verás la boleta de Shalom y la clave para recogerlo.</div>'}
            </div>
          </section>`;
      }

      v.pintar(`
        <a class="volver" href="#/mis-pedidos">${icono('volver')}Mis pedidos</a>
        <div class="bloques">
          ${etiquetaPedido({ ...p, cliente_nombre: '', cliente_dni: '' }, { estadoCliente: true })}
          <section class="tarjeta"><div class="tarjeta-cab"><h2>Estado</h2></div><div class="tarjeta-in">${seguimiento(p, { vistaCliente: true })}</div></section>
          ${envio}
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Productos que pediste</h2></div>
            ${listaItems(p.pedido_items)}
          </section>
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Entrega</h2></div>
            <div class="tarjeta-in">
              <div class="dato"><span class="etq">Dirección</span><span class="valor">${esc(p.direccion)}</span></div>
              <div class="dato"><span class="etq">Tipo de envío</span><span class="valor">${p.envio === 'shalom' ? 'Shalom' : 'Motorizado'}</span></div>
            </div>
          </section>
        </div>`);
    } catch (e) { v.error(e); }
  }

  // ===================================================================
  // Acciones (clics)
  // ===================================================================
  async function cambiarClave() {
    abrirModal({
      titulo: 'Cambiar mi contraseña',
      html: `
        <form data-form="mi-clave" novalidate>
          <div class="modal-cuerpo">
            <div class="campo"><label for="mc-1">Nueva contraseña</label><input id="mc-1" name="c1" type="password" autocomplete="new-password" minlength="6" required></div>
            <div class="campo"><label for="mc-2">Repítela</label><input id="mc-2" name="c2" type="password" autocomplete="new-password" minlength="6" required></div>
            <div class="error-form" id="mc-error" hidden></div>
          </div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn btn-flash" type="submit">Cambiar</button>
          </div>
        </form>`,
    });
  }

  const acciones = {
    'recargar': () => location.reload(),
    'recargar-vista': () => render(),
    'salir': async () => {
      const ok = await confirmar({ titulo: 'Salir', mensaje: '¿Quieres cerrar tu sesión?', boton: 'Salir', peligro: false });
      if (!ok) return;
      const rol = S.perfil?.rol;
      if (rol) S.tabAcceso = rol;
      history.replaceState(null, '', '#' + (rol || 'cliente'));
      await sb.auth.signOut({ scope: 'local' });
    },
    'cambiar-clave': cambiarClave,
    'tab-acceso': (el) => { S.tabAcceso = el.dataset.tab; S.mensajeAcceso = ''; history.replaceState(null, '', '#' + el.dataset.tab); mostrarAcceso(); document.getElementById('acc-usuario')?.focus(); },
    'ver-clave': (el) => {
      const inp = document.getElementById(el.dataset.para);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      el.setAttribute('aria-label', inp.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    },
    'cerrar-modal': () => cerrarModal(false),
    'fondo-modal': (el, ev) => { if (ev.target === el) cerrarModal(false); },
    'confirmar-si': () => cerrarModal(true),
    'copiar': (el) => copiarTexto(el.dataset.texto),

    // Pedidos (admin)
    'filtro-pedidos': (el) => {
      S.filtro = el.dataset.filtro;
      document.querySelectorAll('[data-accion="filtro-pedidos"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      pintarListaPedidos();
    },
    'agregar-item': agregarItem,
    'quitar-item': (el) => { S.form.items.splice(Number(el.dataset.idx), 1); pintarItemsForm(); },
    'eliminar-pedido': async (el) => {
      const cerrado = el.dataset.estado === 'cerrado';
      const ok = await confirmar({
        titulo: `Eliminar pedido #${el.dataset.numero}`,
        mensaje: cerrado
          ? 'Se eliminará el pedido con sus fotos e historial. Como ya fue despachado, el inventario no cambia.'
          : `Se eliminará el pedido con sus fotos e historial. Sus productos (${plural(Number(el.dataset.unidades), 'unidad', 'unidades')}) vuelven al inventario.`,
      });
      if (!ok) return;
      try { await API.eliminarPedido(el.dataset.id); aviso(`Pedido #${el.dataset.numero} eliminado`); ir('pedidos'); }
      catch (e) { aviso(e.message, 'error'); }
    },

    // Inventario
    'nuevo-producto': () => modalProducto(null),
    'editar-producto': (el) => modalProducto(S.datos.productos.find((p) => p.id === el.dataset.id)),
    'eliminar-producto': async (el) => {
      const p = S.datos.productos.find((x) => x.id === el.dataset.id);
      const ok = await confirmar({
        titulo: 'Eliminar producto',
        mensaje: `«${esc(p.nombre)}» saldrá del inventario. Los pedidos que ya lo incluyen lo siguen mostrando.`,
      });
      if (!ok) return;
      try { await API.eliminarProducto(p.id); aviso('Producto eliminado'); render({ silencioso: true }); }
      catch (e) { aviso(e.message, 'error'); }
    },

    // Clientes
    'nuevo-cliente': () => modalCliente(null),
    'editar-cliente': (el) => modalCliente(S.datos.clientes.find((c) => c.id === el.dataset.id)),
    'generar-clave': () => { const i = document.getElementById('c-clave'); i.value = claveSugerida(); i.focus(); },
    'pedido-para': (el) => { S.preCliente = el.dataset.id; ir('pedido/nuevo'); },
    'eliminar-cliente': async (el) => {
      const c = S.datos.clientes.find((x) => x.id === el.dataset.id);
      const n = nPedidos(c);
      const ok = await confirmar({
        titulo: 'Eliminar cliente',
        mensaje: `Se eliminará la cuenta de <strong>${esc(c.nombres)} ${esc(c.apellidos)}</strong> (DNI ${esc(c.dni)}) y ya no podrá ingresar.` +
          (n ? ` Sus ${plural(n, 'pedido', 'pedidos')} se quedan en el sistema con su nombre y DNI.` : ''),
      });
      if (!ok) return;
      try { await API.usuarios({ accion: 'eliminar_cliente', id: c.id }); aviso('Cliente eliminado'); render({ silencioso: true }); }
      catch (e) { aviso(e.message, 'error'); }
    },

    // Courier
    'tab-courier': (el) => { S.tabCourier = el.dataset.tab; render(); },
    'empezar-empaque': (el) => { S.empaquetando[el.dataset.id] = true; render({ silencioso: true }); },
    'marcar-empaquetado': async (el) => {
      el.disabled = true;
      el.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
      try {
        await API.empaquetar(el.dataset.id);
        delete S.empaquetando[el.dataset.id];
        aviso(`Pedido #${el.dataset.numero} empaquetado`);
        S.tabCourier = 'empaquetado';
        ir('courier');
      } catch (e) { aviso(e.message, 'error'); render({ silencioso: true }); }
    },
    'cerrar-pedido': async (el) => {
      const clave = document.getElementById('clave-shalom')?.value.trim() || null;
      el.disabled = true;
      el.innerHTML = '<span class="spin" aria-hidden="true"></span>Cerrando…';
      try {
        await API.cerrar(el.dataset.id, clave);
        delete S.clave[el.dataset.id];
        aviso(`Pedido #${el.dataset.numero} cerrado`);
        ir('courier');
      } catch (e) { aviso(e.message, 'error'); render({ silencioso: true }); }
    },
    'quitar-foto': async (el) => {
      const ok = await confirmar({ titulo: 'Quitar foto', mensaje: '¿Quitar esta foto de la evidencia?', boton: 'Quitar' });
      if (!ok) return;
      try {
        const id = el.dataset.id;
        const { data } = await sb.from('evidencias').select('id, ruta').eq('id', id).maybeSingle();
        if (data) await API.quitarFoto(data);
        aviso('Foto quitada');
      } catch (e) { aviso(e.message, 'error'); }
      render({ silencioso: true });
    },

    // Cliente
    'tab-cliente': (el) => { S.tabCliente = el.dataset.tab; render(); },

    // Visor
    'ver-foto': (el) => abrirVisor(el.dataset.grupoFoto, Number(el.dataset.i)),
    'visor-cerrar': cerrarVisor,
    'visor-cerrar-fondo': (el, ev) => { if (ev.target === el) cerrarVisor(); },
    'visor-ant': () => { visor.i = (visor.i - 1 + visor.fotos.length) % visor.fotos.length; pintarVisor(); },
    'visor-sig': () => { visor.i = (visor.i + 1) % visor.fotos.length; pintarVisor(); },
  };

  const formularios = {
    'acceso': enviarAcceso,
    'pedido': guardarPedido,
    'producto': guardarProducto,
    'cliente': guardarCliente,
    'mi-clave': async (form) => {
      const err = document.getElementById('mc-error');
      const mostrar = (m) => { err.textContent = m; err.hidden = false; };
      if (form.c1.value.length < 6) return mostrar('La contraseña debe tener al menos 6 caracteres.');
      if (form.c1.value !== form.c2.value) return mostrar('Las dos contraseñas no coinciden.');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      const { error } = await sb.auth.updateUser({ password: form.c1.value });
      if (error) { btn.disabled = false; return mostrar(/different from the old/i.test(error.message) ? 'La nueva contraseña debe ser distinta de la actual.' : mensajeError(error)); }
      cerrarModal();
      aviso('Contraseña cambiada');
    },
  };

  // ===================================================================
  // Eventos
  // ===================================================================
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-accion]');
    if (!el) return;
    const fn = acciones[el.dataset.accion];
    if (!fn) return;
    if (el.tagName === 'A') ev.preventDefault();
    fn(el, ev);
  });

  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    formularios[f.dataset.form]?.(f, ev);
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.buscar) {
      S.buscar[t.dataset.buscar] = t.value;
      if (t.dataset.buscar === 'pedidos') pintarListaPedidos();
      if (t.dataset.buscar === 'productos') pintarListaProductos();
      if (t.dataset.buscar === 'clientes') pintarListaClientes();
    }
    if (t.dataset.cantItem !== undefined && S.form) {
      const idx = Number(t.dataset.cantItem);
      const n = parseInt(t.value, 10);
      S.form.items[idx].cantidad = Number.isInteger(n) ? n : 0;
      const it = S.form.items[idx];
      const disp = it.producto_id ? disponible(it.producto_id) : null;
      const d = document.querySelector(`[data-disp="${idx}"]`);
      if (d && disp !== null) {
        const mal = it.cantidad > disp || it.cantidad < 1;
        d.className = 'disp' + (mal ? ' mal' : '');
        d.textContent = it.cantidad < 1 ? 'La cantidad debe ser 1 o más' : it.cantidad > disp ? `Solo hay ${disp} disponibles` : `Disponibles: ${disp}`;
      }
      const tot = document.getElementById('f-total');
      if (tot) tot.textContent = plural(unidades(S.form.items), 'unidad', 'unidades');
    }
    if (t.dataset.clavePedido) {
      S.clave[t.dataset.clavePedido] = t.value;
      const btn = document.getElementById('btn-cerrar');
      const lista = t.value.trim() && btn?.dataset.boleta === '1';
      if (btn) btn.disabled = !lista;
      const ayuda = document.getElementById('ayuda-cerrar');
      if (ayuda) ayuda.hidden = !!lista;
      document.getElementById('tarjeta-clave')?.classList.toggle('listo', !!t.value.trim());
    }
  });

  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.dataset.subir) return subirFotos(t);
    if (t.dataset.cantItem !== undefined) pintarItemsForm();
    if (t.dataset.accionCambio === 'cliente-pedido' && t.value) {
      const dir = document.getElementById('f-direccion');
      if (dir && !dir.value.trim()) {
        try {
          const ultima = await API.ultimaDireccion(t.value);
          if (ultima && !dir.value.trim()) {
            dir.value = ultima;
            const ayuda = document.getElementById('f-direccion-ayuda');
            if (ayuda) ayuda.hidden = false;
          }
        } catch { /* sin sugerencia */ }
      }
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('.visor')) {
      if (ev.key === 'Escape') cerrarVisor();
      if (ev.key === 'ArrowLeft' && visor?.fotos.length > 1) acciones['visor-ant']();
      if (ev.key === 'ArrowRight' && visor?.fotos.length > 1) acciones['visor-sig']();
      return;
    }
    if (ev.key === 'Escape' && modalRaiz.innerHTML) cerrarModal(false);
    if (ev.key === 'Enter' && ev.target.id === 'f-cantidad') { ev.preventDefault(); agregarItem(); }
  });

  iniciar();
})();
