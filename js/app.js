/* =====================================================================
   Rapiiflash · Sistema de pedidos para varios negocios
   Una sola web, cuatro vistas según la cuenta que ingresa:
     · Super administrador: todos los negocios, sus cuentas y su servicio
     · Administrador: pedidos, inventario y clientes de su negocio
     · Courier: empaquetar y despachar con fotos de evidencia
     · Cliente: sus pedidos, boleta, foto del motorizado o clave de Shalom
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.RAPIIFLASH_CONFIG || {};
  const PLATAFORMA = CFG.plataforma || 'Rapiiflash';
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
  const esUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s || '');
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const iniciales = (s) => String(s || '?').trim().split(/\s+/).filter((w) => !/^(de|del|la|las|los|y|e)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const logoUrl = (ruta) => (ruta ? `${CFG.supabaseUrl}/storage/v1/object/public/logos/${ruta}` : '');

  const TZ = 'America/Lima';
  const fFecha = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  const fCorta = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: TZ });
  const fHora = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
  const fNum = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
  const fFechaDia = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fecha = (iso) => (iso ? fFecha.format(new Date(iso)) : '');
  const fechaHora = (iso) => (iso ? `${fFecha.format(new Date(iso))} · ${fHora.format(new Date(iso))}` : '');
  const fechaCorta = (iso) => (iso ? `${fCorta.format(new Date(iso))} · ${fHora.format(new Date(iso))}` : '');
  const fechaNum = (iso) => (iso ? `${fNum.format(new Date(iso))} ${fHora.format(new Date(iso))}` : '');
  const dia = (d) => (d ? fFechaDia.format(new Date(d + 'T00:00:00Z')) : '—'); // fechas sin hora (AAAA-MM-DD)
  const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  const dinero = (n) => soles.format(Number(n) || 0);

  const unidades = (items) => (items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
  const ordenarItems = (items) => [...(items || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const conPrecio = (items) => (items || []).some((i) => i.precio !== null && i.precio !== undefined && i.precio !== '');
  const totalSoles = (items) => (items || []).reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0);

  async function sha256(texto) {
    try {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { return ''; }
  }

  // Colores: texto legible sobre un color de fondo
  function luminancia(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const textoSobre = (hex) => (luminancia(hex) > 0.42 ? '#121821' : '#FFFFFF');

  const MARCA_BASE = { color_primario: '#FFC400', color_secundario: '#121821' };
  function aplicarMarca(m) {
    const p = /^#[0-9a-f]{6}$/i.test(m?.color_primario || '') ? m.color_primario : MARCA_BASE.color_primario;
    const s = /^#[0-9a-f]{6}$/i.test(m?.color_secundario || '') ? m.color_secundario : MARCA_BASE.color_secundario;
    const r = document.documentElement.style;
    r.setProperty('--marca', p);
    r.setProperty('--marca-texto', textoSobre(p));
    r.setProperty('--barra', s);
    r.setProperty('--barra-texto', textoSobre(s) === '#FFFFFF' ? '#F2F4F7' : '#121821');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s);
  }

  // ===================================================================
  // Iconos (trazo 2px, 24×24)
  // ===================================================================
  const P = {
    pedidos: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    inventario: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    negocios: '<path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8M10 20v-4.5h4V20"/>',
    escudo: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
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
    ojoNo: '<path d="M9.9 4.3A10.6 10.6 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.9 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
    ubicacion: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    caja: '<path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><path d="M1.5 3.5h21v4.5h-21zM10 12h4"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    boleta: '<path d="M5 2.5h14v19l-2.3-1.5-2.4 1.5-2.3-1.5-2.3 1.5-2.4-1.5L5 21.5z"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>',
    imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    enlace: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  };
  const icono = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  const rayo = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M36.5 8 15 36h14.5L25 56l24-30H34.5L40 8z" fill="currentColor"/></svg>';

  function logoCaja(n, clase = 'logo-caja') {
    if (n?.logo_ruta) return `<span class="${clase} con-imagen"><img src="${esc(logoUrl(n.logo_ruta))}" alt=""></span>`;
    const estilo = n?.color_secundario ? ` style="background:${esc(n.color_secundario)};color:${esc(n.color_primario || '#FFC400')}"` : '';
    return `<span class="${clase}"${estilo}><span class="iniciales">${esc(iniciales(n?.nombre))}</span></span>`;
  }

  // Marca en las barras: el negocio de la cuenta, o la plataforma
  function marcaHTML(sub, negocio) {
    const n = negocio === undefined ? S.marca : negocio;
    if (n && n.nombre) {
      return `<a class="marca" href="#/">
        ${n.logo_ruta ? `<span class="marca-logo con-imagen"><img src="${esc(logoUrl(n.logo_ruta))}" alt=""></span>` : `<span class="marca-logo">${esc(iniciales(n.nombre))}</span>`}
        <span class="marca-texto"><span class="marca-nombre" style="font-style:normal;font-stretch:105%;font-size:1.02rem">${esc(n.nombre)}</span><span class="marca-sub">${esc(sub)}</span></span>
      </a>`;
    }
    return `<a class="marca" href="#/">
      <span class="marca-logo">${rayo}</span>
      <span class="marca-texto"><span class="marca-nombre">${esc(PLATAFORMA.toUpperCase())}</span><span class="marca-sub">${esc(sub)}</span></span>
    </a>`;
  }

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
  const NOMBRE_SERVICIO = { activo: 'Activo', pausado: 'Pausado', terminado: 'Terminado' };
  const servicioHTML = (e) => `<span class="servicio ${esc(e)}">${esc(NOMBRE_SERVICIO[e] || e)}</span>`;

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
    if (/banned/i.test(m)) return 'Tu cuenta está desactivada. Comunícate con el administrador del sistema.';
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
    marca: () => q(sb.rpc('mi_negocio_marca')),
    negocioPublico: (codigo) => q(sb.rpc('negocio_publico', { p_codigo: codigo })),
    cuentasPorDni: (dni, clave, negocio) => q(sb.rpc('cuentas_por_dni', { p_dni: dni, p_clave: clave, p_negocio: negocio || null })),
    verificarCodigo: (codigo) => q(sb.rpc('verificar_codigo_super', { p_codigo: codigo })),

    // Super administrador
    resumenNegocios: () => q(sb.rpc('resumen_negocios')),
    negocio: (id) => q(sb.from('negocios').select('*').eq('id', id).maybeSingle()),
    historialServicio: (id) => q(sb.from('negocio_servicio').select('*').eq('negocio_id', id).order('creado', { ascending: false }).order('id', { ascending: false })),
    guardarNegocio: (id, datos) => q(sb.rpc('guardar_negocio', { p_id: id || null, p: datos })),
    completarNegocio: (datos) => q(sb.rpc('completar_negocio', { p: datos })),
    accesos: (id) => q(sb.rpc('accesos_negocio', { p_negocio: id })),
    verClave: (uid) => q(sb.rpc('ver_clave', { p_user: uid })),
    async subirLogo(negocioId, archivo) {
      const blob = await reducirLogo(archivo);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const ruta = `${negocioId}/logo-${Date.now()}.${ext}`;
      const r = await sb.storage.from('logos').upload(ruta, blob, { contentType: blob.type, upsert: false });
      if (r.error) throw new Error(mensajeError(r.error));
      return ruta;
    },

    // Inventario
    productos: (neg) => q(sb.from('productos').select('*').eq('negocio_id', neg).order('nombre')),
    guardarProducto: (p, neg) => p.id
      ? q(sb.from('productos').update({ nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad }).eq('id', p.id).select().single())
      : q(sb.from('productos').insert({ negocio_id: neg, nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad }).select().single()),
    eliminarProducto: (id) => q(sb.from('productos').delete().eq('id', id)),

    // Clientes, couriers y cuentas
    clientes: (neg) => q(sb.from('clientes').select('id, dni, nombres, apellidos, user_id, creado, pedidos(count)').eq('negocio_id', neg).order('apellidos').order('nombres')),
    couriers: (neg) => q(sb.from('couriers').select('user_id, nombre, email').eq('negocio_id', neg).order('nombre')),
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
      const r = await q(sb.from('pedidos').select('direccion').eq('cliente_id', clienteId).order('creado', { ascending: false }).limit(1));
      return r?.[0]?.direccion || '';
    },

    // Pedidos
    pedidosAdmin: (neg) => q(sb.from('pedidos')
      .select('id, numero, cliente_id, cliente_dni, cliente_nombre, direccion, envio, estado, creado, empaquetado_en, cerrado_en, vendedor_nombre, pedido_items(cantidad, precio)')
      .eq('negocio_id', neg)
      .order('numero', { ascending: false })),
    pedidosCourier: () => q(sb.from('pedidos')
      .select('id, numero, cliente_dni, cliente_nombre, direccion, envio, estado, creado, empaquetado_en, vendedor_nombre, pedido_items(cantidad)')
      .in('estado', ['creado', 'empaquetado'])
      .order('numero', { ascending: true })),
    pedidosCliente: () => q(sb.from('pedidos')
      .select('id, numero, envio, estado, creado, empaquetado_en, cerrado_en, pedido_items(nombre, cantidad)')
      .order('creado', { ascending: false })),
    pedido: (id) => q(sb.from('pedidos').select('*, pedido_items(*), evidencias(*)').eq('id', id).maybeSingle()),
    eventos: (id) => q(sb.from('pedido_eventos').select('*').eq('pedido_id', id).order('creado').order('id')),
    guardarPedido: (d) => q(sb.rpc('guardar_pedido', {
      p_id: d.id || null, p_cliente_id: d.cliente_id, p_direccion: d.direccion, p_envio: d.envio, p_items: d.items,
      p_courier: d.courier || null, p_negocio: d.negocio || null,
    })),
    async eliminarPedido(id) {
      // Primero las fotos (mientras el pedido existe y se puede comprobar el permiso)
      const evs = await q(sb.from('evidencias').select('ruta').eq('pedido_id', id));
      if (evs?.length) await sb.storage.from('evidencias').remove(evs.map((e) => e.ruta));
      const rutas = await q(sb.rpc('eliminar_pedido', { p_id: id }));
      const quedan = (rutas || []).filter((r) => !evs?.some((e) => e.ruta === r));
      if (quedan.length) await sb.storage.from('evidencias').remove(quedan);
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

  async function redimensionar(archivo, max, tipo, calidad) {
    const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return new Promise((res) => c.toBlob(res, tipo, calidad));
  }
  // Fotos del celular: máx. 1600 px en JPEG para que suban rápido.
  async function comprimir(archivo) {
    try {
      const b = await redimensionar(archivo, 1600, 'image/jpeg', 0.82);
      if (b && b.size > 0) return b;
    } catch { /* se sube el original */ }
    return archivo;
  }
  // Logos: máx. 512 px en PNG (conserva la transparencia).
  async function reducirLogo(archivo) {
    try {
      const b = await redimensionar(archivo, 512, 'image/png');
      if (b && b.size > 0 && b.size < 2000000) return b;
    } catch { /* se sube el original */ }
    return archivo;
  }

  // ===================================================================
  // Estado y navegación
  // ===================================================================
  const S = {
    perfil: null,
    marca: null,          // negocio de la cuenta conectada (admin, courier, cliente)
    marcaAcceso: null,    // negocio del enlace ?n=codigo en la pantalla de ingreso
    negocioLink: new URLSearchParams(location.search).get('n')?.toLowerCase() || null,
    shell: null,
    mensajeAcceso: '',
    pedirCodigo: false,
    silenciarSalida: false,
    elegir: null,
    filtro: 'todos',
    filtroNegocios: 'activo',
    buscar: { pedidos: '', productos: '', clientes: '', negocios: '' },
    datos: { pedidos: [], productos: [], clientes: [], couriers: [], negocios: [], accesos: [] },
    negocioCache: {},
    claves: {},
    tabCourier: 'creado',
    tabCliente: 'actuales',
    empaquetando: {},
    clave: {},
    subiendo: 0,
    preCliente: null,
    form: null,
    formNegocio: null,
    turno: 0,
    canal: null,
  };

  const ruta = () => location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  const ir = (r) => { if (ruta() === r) render(); else location.hash = '#/' + r; };
  const inicioDe = (rol) => ({ super: 'negocios', admin: 'pedidos', courier: 'courier', cliente: 'mis-pedidos' }[rol] || '');
  const enlaceClientes = (codigo) => `${location.origin}${location.pathname}?n=${encodeURIComponent(codigo)}`;

  async function iniciar() {
    if (S.negocioLink) {
      try { S.marcaAcceso = await API.negocioPublico(S.negocioLink); } catch { S.marcaAcceso = null; }
      if (S.marcaAcceso) aplicarMarca(S.marcaAcceso);
    }
    const { data } = await sb.auth.getSession();
    if (data?.session) await entrarConSesion();
    else mostrarAcceso();

    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        S.perfil = null; S.marca = null; S.shell = null; S.claves = {};
        cerrarCanal(); cerrarModal(); cerrarVisor();
        aplicarMarca(S.marcaAcceso);
        if (S.silenciarSalida) { S.silenciarSalida = false; return; }
        mostrarAcceso();
      }
    });
    window.addEventListener('hashchange', () => {
      cerrarVisor();
      if (S.perfil) render(); else mostrarAcceso();
    });
  }

  // Valida el perfil y abre la vista que le corresponde
  async function entrar(perfil) {
    if (!perfil) {
      await salirConMensaje('Esta cuenta no tiene acceso a este sistema.');
      return false;
    }
    if (perfil.rol === 'super_pendiente') {
      S.pedirCodigo = true;
      await salirConMensaje('Escribe tu código de seguridad para ingresar.');
      return false;
    }
    if (perfil.rol !== 'super' && perfil.negocio_activo === false) {
      await salirConMensaje('El servicio de tu negocio está desactivado. Comunícate con el administrador del sistema.');
      return false;
    }
    S.perfil = perfil;
    S.pedirCodigo = false;
    S.mensajeAcceso = '';
    S.marca = null;
    if (perfil.rol !== 'super') {
      try { S.marca = await API.marca(); } catch { S.marca = null; }
    }
    aplicarMarca(S.marca);
    abrirCanal();
    const r = ruta();
    if (!r || ['cliente', 'courier', 'admin'].includes(r)) history.replaceState(null, '', location.pathname + location.search + '#/' + inicioDe(perfil.rol));
    render();
    return true;
  }

  async function salirConMensaje(msg) {
    S.mensajeAcceso = msg;
    S.silenciarSalida = true;
    await sb.auth.signOut({ scope: 'local' });
    S.silenciarSalida = false;
    mostrarAcceso();
  }

  async function entrarConSesion() {
    try {
      await entrar(await API.perfil());
    } catch (e) {
      raiz.innerHTML = `<div class="cargando-inicial" style="flex-direction:column;gap:1rem">
        <p>${esc(e.message)}</p><button class="btn" data-accion="recargar">Reintentar</button></div>`;
    }
  }

  function render(opciones = {}) {
    if (!S.perfil) return mostrarAcceso();
    const rol = S.perfil.rol;
    let r = ruta();
    if (!r) {
      history.replaceState(null, '', location.pathname + location.search + '#/' + inicioDe(rol));
      r = inicioDe(rol);
    }
    const p = r.split('/');

    if (p[0] === 'boleta' && esUuid(p[1])) {
      if (rol === 'super') shellSuper(); else if (rol === 'admin') shellAdmin(); else shellSimple(rol === 'courier' ? 'Courier' : 'Mis pedidos');
      return vistaBoleta(p[1], opciones);
    }

    if (rol === 'super') {
      shellSuper();
      if (p[0] === 'negocio' && p[1] === 'nuevo') { aplicarMarca(null); return vistaFormNegocio(null); }
      if (p[0] === 'negocio' && esUuid(p[1])) {
        const ctx = { negocioId: p[1], base: `negocio/${p[1]}/`, super: true };
        const sub = p[2] || 'resumen';
        if (sub === 'editar') return vistaFormNegocio(p[1]);
        if (sub === 'pedidos') return vistaPedidosAdmin(ctx, opciones);
        if (sub === 'pedido' && p[3] === 'nuevo') return vistaFormPedido(ctx, null);
        if (sub === 'pedido' && esUuid(p[3]) && p[4] === 'editar') return vistaFormPedido(ctx, p[3]);
        if (sub === 'pedido' && esUuid(p[3])) return vistaPedidoAdmin(ctx, p[3], opciones);
        if (sub === 'inventario') return vistaInventario(ctx, opciones);
        if (sub === 'clientes') return vistaClientes(ctx, opciones);
        if (sub === 'accesos') return vistaAccesos(ctx, opciones);
        return vistaNegocio(ctx, opciones);
      }
      aplicarMarca(null);
      return vistaNegocios(opciones);
    }

    if (rol === 'admin') {
      shellAdmin();
      if (S.perfil.datos_completos === false) return vistaCompletarNegocio();
      const ctx = { negocioId: S.perfil.negocio_id, base: '', super: false };
      if (p[0] === 'inventario') return vistaInventario(ctx, opciones);
      if (p[0] === 'clientes') return vistaClientes(ctx, opciones);
      if (p[0] === 'pedido' && p[1] === 'nuevo') return vistaFormPedido(ctx, null);
      if (p[0] === 'pedido' && esUuid(p[1]) && p[2] === 'editar') return vistaFormPedido(ctx, p[1]);
      if (p[0] === 'pedido' && esUuid(p[1])) return vistaPedidoAdmin(ctx, p[1], opciones);
      return vistaPedidosAdmin(ctx, opciones);
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

  // Cambios en vivo
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
        (rol === 'super' && (r === 'negocios' || /^negocio\/[0-9a-f-]{36}(\/pedidos|\/pedido\/[0-9a-f-]{36})?$/.test(r))) ||
        (rol === 'courier' && r === 'courier') ||
        (rol === 'cliente' && !r.startsWith('boleta'));
      if (seguro) render({ silencioso: true });
    }, 700);
  }

  // ===================================================================
  // Ingreso (una sola pantalla para todas las cuentas)
  // ===================================================================
  function mostrarAcceso() {
    S.shell = null;
    document.body.className = '';
    const msg = S.mensajeAcceso;
    const negocio = S.marcaAcceso;
    if (S.elegir) return mostrarEleccion();
    raiz.innerHTML = `
      <main class="acceso">
        <div class="acceso-tarjeta">
          <div class="acceso-cab">${marcaHTML(negocio ? 'Sistema de pedidos' : 'Sistema de pedidos', negocio || null)}</div>
          <div class="acceso-cuerpo">
            <div><h1 style="font-size:1.35rem">Ingresa a tu cuenta</h1>
              <p class="tenue peq" style="margin-top:.25rem">Con tu correo, o con tu DNI si eres cliente.</p></div>
            <form data-form="acceso" class="rejilla-form" novalidate>
              <div class="campo"><label for="acc-usuario">Correo o DNI</label>
                <input id="acc-usuario" name="usuario" type="text" autocomplete="username" spellcheck="false" autocapitalize="none" data-usuario-acceso required></div>
              <div class="campo"><label for="acc-clave">Contraseña</label>
                <div class="con-boton">
                  <input id="acc-clave" name="password" type="password" autocomplete="current-password" required>
                  <button class="btn btn-icono" type="button" data-accion="ver-clave" data-para="acc-clave" aria-label="Mostrar contraseña">${icono('ojo')}</button>
                </div>
              </div>
              <div class="campo-codigo" id="acc-codigo-zona" ${S.pedirCodigo ? '' : 'hidden'}>
                <label for="acc-codigo" class="etiqueta-campo" style="font-weight:600;font-size:.88rem;color:var(--ink-2)">Código de seguridad</label>
                <input id="acc-codigo" name="codigo" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••">
              </div>
              <div class="error-form" id="acc-error" ${msg ? '' : 'hidden'}>${esc(msg)}</div>
              <button class="btn btn-flash btn-grande btn-bloque" type="submit">Ingresar</button>
            </form>
          </div>
          <p class="acceso-pie">${negocio ? 'Sistema de pedidos de ' + esc(negocio.nombre) + '.' : 'Sistema de pedidos para importadoras.'}</p>
        </div>
      </main>`;
  }

  function mostrarEleccion() {
    const lista = S.elegir.cuentas;
    raiz.innerHTML = `
      <main class="acceso">
        <div class="acceso-tarjeta">
          <div class="acceso-cab">${marcaHTML('Sistema de pedidos', null)}</div>
          <div class="acceso-cuerpo">
            <div><h1 style="font-size:1.3rem">¿A qué negocio quieres entrar?</h1>
              <p class="tenue peq" style="margin-top:.25rem">Tu DNI tiene cuenta en ${lista.length} negocios.</p></div>
            <div class="elegir-negocio">
              ${lista.map((c, i) => `<button type="button" data-accion="elegir-cuenta" data-i="${i}">
                ${logoCaja({ nombre: c.negocio_nombre, logo_ruta: c.logo_ruta })}<span>${esc(c.negocio_nombre)}</span></button>`).join('')}
            </div>
            <button class="btn btn-texto" type="button" data-accion="cancelar-eleccion">${icono('volver')}Volver</button>
          </div>
        </div>
      </main>`;
  }

  async function revisarUsuarioAcceso(valor) {
    const zona = document.getElementById('acc-codigo-zona');
    if (!zona) return;
    const v = valor.trim().toLowerCase();
    const esSuper = v.includes('@') && CFG.superHash && (await sha256(v)) === CFG.superHash;
    if (esSuper || S.pedirCodigo) zona.hidden = false;
    else zona.hidden = true;
  }

  async function enviarAcceso(form) {
    const usuario = form.usuario.value.trim();
    const password = form.password.value;
    const codigo = (form.codigo?.value || '').trim();
    const err = document.getElementById('acc-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    S.mensajeAcceso = '';
    if (!usuario || !password) return mostrar('Escribe tu correo o DNI y tu contraseña.');

    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Ingresando…';
    const listo = () => { btn.disabled = false; btn.textContent = 'Ingresar'; };

    try {
      if (usuario.includes('@')) {
        const { error } = await sb.auth.signInWithPassword({ email: usuario.toLowerCase(), password });
        if (error) {
          listo();
          return mostrar(/invalid login|invalid credentials/i.test(error.message) ? 'Correo o contraseña incorrectos.' : mensajeError(error));
        }
        let perfil = await API.perfil();
        if (perfil?.rol === 'super_pendiente') {
          document.getElementById('acc-codigo-zona').hidden = false;
          if (!/^\d{4}$/.test(codigo)) {
            S.silenciarSalida = true; await sb.auth.signOut({ scope: 'local' }); S.silenciarSalida = false;
            listo();
            document.getElementById('acc-codigo')?.focus();
            return mostrar('Escribe tu código de seguridad de 4 dígitos.');
          }
          let ok = false;
          try { ok = await API.verificarCodigo(codigo); } catch (e) {
            S.silenciarSalida = true; await sb.auth.signOut({ scope: 'local' }); S.silenciarSalida = false;
            listo(); return mostrar(e.message);
          }
          if (!ok) {
            S.silenciarSalida = true; await sb.auth.signOut({ scope: 'local' }); S.silenciarSalida = false;
            listo();
            form.codigo.value = '';
            form.codigo.focus();
            return mostrar('Código de seguridad incorrecto.');
          }
          perfil = await API.perfil();
        }
        if (perfil?.rol === 'cliente') { /* los clientes entran con DNI, pero también vale su cuenta */ }
        await entrar(perfil);
        return;
      }

      // Cliente con DNI
      const dni = limpiarDni(usuario);
      if (dni.length < 6) { listo(); return mostrar('Revisa tu DNI: debe tener al menos 6 números.'); }
      const cuentas = await API.cuentasPorDni(dni, password, S.marcaAcceso ? S.negocioLink : null);
      if (!cuentas?.length) { listo(); return mostrar('DNI o contraseña incorrectos.'); }
      if (cuentas.length > 1) {
        S.elegir = { cuentas, password };
        return mostrarEleccion();
      }
      await ingresarCliente(cuentas[0].email, password, mostrar, listo);
    } catch (e) {
      listo();
      mostrar(mensajeError(e));
    }
  }

  async function ingresarCliente(email, password, mostrar, listo) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      listo?.();
      const m = /invalid login|invalid credentials/i.test(error.message) ? 'DNI o contraseña incorrectos.' : mensajeError(error);
      if (mostrar) return mostrar(m);
      S.mensajeAcceso = m; S.elegir = null; return mostrarAcceso();
    }
    S.elegir = null;
    await entrar(await API.perfil());
  }

  // ===================================================================
  // Estructura de pantallas
  // ===================================================================
  function navLinks(items) {
    return items.map(([r, t, i]) => `<a href="#/${r}" data-seccion="${r}">${icono(i)}<span>${t}</span></a>`).join('');
  }
  function shellAdmin() {
    if (S.shell === 'admin' && document.getElementById('vista')) { marcarNav(); return; }
    S.shell = 'admin';
    document.body.className = '';
    const items = [['pedidos', 'Pedidos', 'pedidos'], ['inventario', 'Inventario', 'inventario'], ['clientes', 'Clientes', 'clientes']];
    raiz.innerHTML = `
      <div class="shell">
        <aside class="lateral">
          ${marcaHTML('Administrador')}
          <nav class="nav" aria-label="Secciones">${navLinks(items)}</nav>
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
        <nav class="tabbar" aria-label="Secciones">${navLinks(items)}</nav>
      </div>`;
    marcarNav();
  }

  function shellSuper() {
    if (S.shell === 'super' && document.getElementById('vista')) { marcarNav(); return; }
    S.shell = 'super';
    document.body.className = 'vista-super';
    raiz.innerHTML = `
      <div class="shell shell-super">
        <aside class="lateral">
          ${marcaHTML('Super administrador', null)}
          <nav class="nav" aria-label="Secciones">
            <a href="#/negocios" data-seccion="negocios">${icono('negocios')}<span>Negocios</span></a>
            <a href="#/negocio/nuevo" data-seccion="nuevo">${icono('mas')}<span>Nuevo negocio</span></a>
          </nav>
          <div class="lateral-pie">
            <div class="quien"><strong>${esc(S.perfil.nombre || 'Super administrador')}</strong><span>${esc(S.perfil.email || '')}</span></div>
            <div style="display:flex;gap:.25rem;flex-wrap:wrap">
              <button class="btn btn-texto" type="button" data-accion="cambiar-clave">${icono('llave')}Contraseña</button>
              <button class="btn btn-texto" type="button" data-accion="salir">${icono('salir')}Salir</button>
            </div>
          </div>
        </aside>
        <header class="barra-movil">
          ${marcaHTML('Super administrador', null)}
          <div style="display:flex;gap:.25rem">
            <a class="btn btn-texto btn-icono" href="#/negocios" aria-label="Negocios">${icono('negocios')}</a>
            <button class="btn btn-texto btn-icono" type="button" data-accion="cambiar-clave" aria-label="Cambiar contraseña">${icono('llave')}</button>
            <button class="btn btn-texto btn-icono" type="button" data-accion="salir" aria-label="Salir">${icono('salir')}</button>
          </div>
        </header>
        <main class="principal"><div class="contenedor" id="vista"></div></main>
      </div>`;
    marcarNav();
  }

  function marcarNav() {
    const r = ruta();
    let sec;
    if (S.shell === 'super') sec = r === 'negocio/nuevo' ? 'nuevo' : 'negocios';
    else sec = r.startsWith('inventario') ? 'inventario' : r.startsWith('clientes') ? 'clientes' : 'pedidos';
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

  // Cabecera y pestañas de un negocio (vista del super administrador)
  async function negocioCtx(ctx, fresco = false) {
    if (!ctx.super) return null;
    if (fresco || !S.negocioCache[ctx.negocioId]) S.negocioCache[ctx.negocioId] = await API.negocio(ctx.negocioId);
    const n = S.negocioCache[ctx.negocioId];
    if (n) aplicarMarca(n);
    return n;
  }
  function envolver(ctx, n, tab, html) {
    if (!ctx.super) return html;
    if (!n) return `<a class="volver" href="#/negocios">${icono('volver')}Negocios</a><div class="tarjeta">${vacioHTML('negocios', 'Este negocio ya no existe', '')}</div>`;
    const tabs = [['', 'Resumen'], ['pedidos', 'Pedidos'], ['inventario', 'Inventario'], ['clientes', 'Clientes'], ['accesos', 'Accesos']];
    return `
      <a class="volver" href="#/negocios">${icono('volver')}Negocios</a>
      <div class="negocio-cab">
        ${logoCaja(n, 'logo-caja logo-grande')}
        <div style="display:grid;gap:.3rem;min-width:0">
          <h1>${esc(n.nombre)}</h1>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">${servicioHTML(n.servicio_estado)}
            ${n.datos_completos ? '' : '<span class="chip-aviso">Su administrador aún no llena los datos</span>'}</div>
        </div>
      </div>
      <nav class="pestanas-negocio" aria-label="Secciones del negocio">
        ${tabs.map(([k, t]) => `<a href="#/negocio/${esc(n.id)}${k ? '/' + k : ''}" ${k === tab ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
      </nav>
      ${html}`;
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
            ${p.vendedor_nombre ? `<div class="dato" style="margin:0"><span class="etq">Vendedor</span><span class="valor">${esc(p.vendedor_nombre)}</span></div>` : ''}
          </div>
        </div>
        <div class="etiqueta-barras" aria-hidden="true"></div>
      </section>`;
  }

  function seguimiento(p, { vistaCliente = false } = {}) {
    const pasos = [
      { t: 'Pedido creado', f: p.creado, por: vistaCliente ? '' : p.creado_por },
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
    const precios = conPrecio(its);
    return `
      <ul class="items">${its.map((i) => `
        <li><div><div class="item-nom">${esc(i.nombre)}</div>${i.descripcion ? `<div class="item-des">${esc(i.descripcion)}</div>` : ''}
          ${precios && i.precio != null ? `<div class="item-precio">${esc(dinero(i.precio))} c/u · ${esc(dinero(i.precio * i.cantidad))}</div>` : ''}</div>
        <div class="item-can">${esc(i.cantidad)}<small>und.</small></div></li>`).join('')}
      </ul>
      <div class="items-total"><span>Total</span><span class="mono">${plural(unidades(its), 'unidad', 'unidades')}${precios ? ' · ' + esc(dinero(totalSoles(its))) : ''}</span></div>`;
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
  // SUPER ADMINISTRADOR · Negocios
  // ===================================================================
  async function vistaNegocios(op) {
    const v = preparar(op);
    try {
      S.datos.negocios = await API.resumenNegocios();
      if (!v.vigente()) return;
      const ns = S.datos.negocios;
      const cuenta = (e) => ns.filter((n) => e === 'todos' || n.servicio_estado === e).length;
      const suma = (k) => ns.reduce((s, n) => s + Number(n[k] || 0), 0);
      v.pintar(`
        <div class="cab">
          <div class="cab-texto"><span class="etq">Super administrador</span><h1>Negocios</h1></div>
          <div class="cab-acciones"><a class="btn btn-flash" href="#/negocio/nuevo">${icono('mas')}Nuevo negocio</a></div>
        </div>
        <div class="cifras">
          <div class="cifra"><span class="etq">Negocios activos</span><span class="valor">${cuenta('activo')}</span><span class="det">${cuenta('pausado')} pausados · ${cuenta('terminado')} terminados</span></div>
          <div class="cifra"><span class="etq">Pedidos</span><span class="valor">${suma('n_pedidos')}</span><span class="det">${suma('n_creados')} creados · ${suma('n_empaquetados')} empaquetados</span></div>
          <div class="cifra"><span class="etq">Clientes</span><span class="valor">${suma('n_clientes')}</span><span class="det">en todos los negocios</span></div>
          <div class="cifra"><span class="etq">Personal</span><span class="valor">${suma('n_admins') + suma('n_couriers')}</span><span class="det">${suma('n_admins')} administradores · ${suma('n_couriers')} couriers</span></div>
        </div>
        <div class="herramientas">
          <div class="filtros" role="group" aria-label="Filtrar por estado del servicio">
            ${[['activo', 'Activos'], ['pausado', 'Pausados'], ['terminado', 'Terminados'], ['todos', 'Todos']].map(([k, t]) =>
              `<button type="button" data-accion="filtro-negocios" data-filtro="${k}" aria-pressed="${S.filtroNegocios === k}">${t}<span class="n">${cuenta(k)}</span></button>`).join('')}
          </div>
          <label class="buscar"><span class="sr">Buscar negocios</span>${icono('buscar')}
            <input type="search" data-buscar="negocios" placeholder="Buscar negocio" value="${esc(S.buscar.negocios)}"></label>
        </div>
        <div id="lista-negocios"></div>`);
      pintarListaNegocios();
    } catch (e) { v.error(e); }
  }

  function pintarListaNegocios() {
    const cont = document.getElementById('lista-negocios');
    if (!cont) return;
    const t = norm(S.buscar.negocios);
    const lista = S.datos.negocios.filter((n) => (S.filtroNegocios === 'todos' || n.servicio_estado === S.filtroNegocios) && (!t || norm(n.nombre).includes(t)));
    if (!S.datos.negocios.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('negocios', 'Aún no hay negocios', 'Crea el primero y asígnale sus cuentas de administrador y courier.',
        `<a class="btn btn-flash" href="#/negocio/nuevo">${icono('mas')}Nuevo negocio</a>`)}</div>`;
      return;
    }
    if (!lista.length) { cont.innerHTML = `<div class="tarjeta">${vacioHTML('buscar', 'Ningún negocio en esta lista', 'Cambia el filtro o la búsqueda.')}</div>`; return; }
    cont.innerHTML = `<div class="negocios-grid">${lista.map((n) => `
      <a class="negocio-tarjeta" href="#/negocio/${esc(n.id)}" style="--c1:${esc(n.color_primario)}">
        <div class="negocio-tarjeta-sup">
          ${logoCaja(n)}
          <div style="display:grid;gap:.25rem;min-width:0">
            <span class="nombre">${esc(n.nombre)}</span>
            <span style="display:flex;gap:.35rem;flex-wrap:wrap">${servicioHTML(n.servicio_estado)}${n.datos_completos ? '' : '<span class="chip-aviso">Faltan datos</span>'}</span>
          </div>
        </div>
        <div class="negocio-cuentas">
          <div><strong>${n.n_admins}</strong><span>${n.n_admins === 1 ? 'Administrador' : 'Administradores'}</span></div>
          <div><strong>${n.n_couriers}</strong><span>${n.n_couriers === 1 ? 'Courier' : 'Couriers'}</span></div>
          <div><strong>${n.n_clientes}</strong><span>${n.n_clientes === 1 ? 'Cliente' : 'Clientes'}</span></div>
          <div><strong>${n.n_pedidos}</strong><span>Pedidos</span></div>
          <div><strong>${n.n_creados + n.n_empaquetados}</strong><span>En curso</span></div>
          <div><strong>${n.n_productos}</strong><span>Productos · ${n.unidades} und.</span></div>
        </div>
        <div class="negocio-pie"><span>Inicio del servicio: <strong>${esc(dia(n.servicio_inicio))}</strong></span><span class="tenue">Creado ${esc(fecha(n.creado))}</span></div>
      </a>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- Resumen de un negocio
  async function vistaNegocio(ctx, op) {
    const v = preparar(op);
    try {
      const n = await negocioCtx(ctx, true);
      if (!v.vigente()) return;
      if (!n) { v.pintar(envolver(ctx, null, '', '')); return; }
      const [resumen, historial] = await Promise.all([API.resumenNegocios(), API.historialServicio(n.id)]);
      if (!v.vigente()) return;
      const r = resumen.find((x) => x.id === n.id) || {};
      const accionesServicio = {
        activo: `<button class="btn" type="button" data-accion="servicio" data-tipo="pausar">${icono('pausa')}Pausar (desactivar accesos)</button>
                 <button class="btn btn-peligro" type="button" data-accion="servicio" data-tipo="terminar">${icono('stop')}Terminar servicio</button>`,
        pausado: `<button class="btn btn-flash" type="button" data-accion="servicio" data-tipo="reanudar">${icono('play')}Reanudar (activar accesos)</button>
                  <button class="btn btn-peligro" type="button" data-accion="servicio" data-tipo="terminar">${icono('stop')}Terminar servicio</button>`,
        terminado: `<button class="btn btn-flash" type="button" data-accion="servicio" data-tipo="comenzar">${icono('play')}Comenzar servicio de nuevo</button>`,
      }[n.servicio_estado];
      const dato = (etq, val, mono) => `<div class="dato"><span class="etq">${etq}</span><span class="valor ${mono ? 'mono' : ''}">${val ? esc(val) : '<span class="tenue">—</span>'}</span></div>`;
      v.pintar(envolver(ctx, n, '', `
        <div class="cifras">
          <div class="cifra"><span class="etq">Administradores</span><span class="valor">${r.n_admins ?? 0}</span><span class="det">cuentas con correo</span></div>
          <div class="cifra"><span class="etq">Couriers</span><span class="valor">${r.n_couriers ?? 0}</span><span class="det">cuentas con correo</span></div>
          <div class="cifra"><span class="etq">Clientes</span><span class="valor">${r.n_clientes ?? 0}</span><span class="det">ingresan con DNI</span></div>
          <div class="cifra"><span class="etq">Pedidos</span><span class="valor">${r.n_pedidos ?? 0}</span><span class="det">${r.n_creados ?? 0} creados · ${r.n_empaquetados ?? 0} empaquetados · ${r.n_cerrados ?? 0} cerrados</span></div>
          <div class="cifra"><span class="etq">Inventario</span><span class="valor">${r.n_productos ?? 0}</span><span class="det">productos · ${r.unidades ?? 0} unidades</span></div>
        </div>
        <div class="bloques">
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Servicio</h2>${servicioHTML(n.servicio_estado)}</div>
            <div class="tarjeta-in bloques">
              <div class="datos-lista">
                ${dato('Negocio creado', fechaHora(n.creado))}
                ${dato('Inicio del servicio', dia(n.servicio_inicio))}
                ${n.servicio_fin ? dato('Fin del servicio', dia(n.servicio_fin)) : ''}
                ${dato('Datos registrados por', n.datos_por === 'admin' ? (n.datos_completos ? 'Su administrador' : 'Su administrador (pendiente)') : 'Super administrador')}
              </div>
              <div class="acciones-servicio">${accionesServicio}</div>
              ${n.servicio_estado !== 'activo' ? `<div class="aviso">${icono('info')}<span>Las cuentas de este negocio (administradores, couriers y clientes) están bloqueadas y no pueden ingresar.</span></div>` : ''}
              ${historial.length ? `<div><h3 style="margin-bottom:.25rem">Historial del servicio</h3><ul class="historial" style="padding:0">${historial.map((h) => `
                <li><div><div class="h-acc">${esc(h.accion)}</div>${h.nota ? `<div class="h-det">${esc(h.nota)}</div>` : ''}
                <div class="h-meta">${esc(fechaHora(h.creado))}${h.actor ? ' · ' + esc(h.actor) : ''}</div></div></li>`).join('')}</ul></div>` : ''}
            </div>
          </section>
          <section class="tarjeta">
            <div class="tarjeta-cab"><h2>Datos del negocio</h2><a class="btn" href="#/negocio/${esc(n.id)}/editar">${icono('editar')}Editar datos</a></div>
            <div class="tarjeta-in bloques">
              <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
                ${logoCaja(n, 'logo-caja logo-grande')}
                <div class="muestras" title="Paleta de colores"><span class="muestra" style="background:${esc(n.color_primario)}"></span><span class="muestra" style="background:${esc(n.color_secundario)}"></span>
                  <span class="tenue peq mono">${esc(n.color_primario)} · ${esc(n.color_secundario)}</span></div>
              </div>
              <div class="datos-lista">
                ${dato('Nombre del negocio', n.nombre)}
                ${dato('Teléfono', n.telefono, true)}
                ${dato('RUC', n.ruc, true)}
                ${dato('Instagram', n.instagram)}
                ${dato('Dirección', n.direccion)}
                ${dato('Dueño', n.dueno_nombre)}
                ${dato('DNI del dueño', n.dueno_dni, true)}
                ${dato('Código del negocio', n.codigo, true)}
              </div>
              <div class="dato"><span class="etq">Enlace de ingreso con su marca (para clientes y personal)</span>
                <div class="enlace-copiar"><code>${esc(enlaceClientes(n.codigo))}</code>
                  <button class="btn" type="button" data-accion="copiar" data-texto="${esc(enlaceClientes(n.codigo))}">${icono('copiar')}Copiar</button></div></div>
            </div>
          </section>
          <section class="tarjeta zona-peligro">
            <div class="tarjeta-cab"><h2>Eliminar negocio</h2></div>
            <div class="tarjeta-in" style="display:flex;gap:1rem;justify-content:space-between;align-items:center;flex-wrap:wrap">
              <p class="medio" style="max-width:60ch">Borra el negocio con todos sus pedidos, fotos, productos, clientes y cuentas. No se puede deshacer.</p>
              <button class="btn btn-peligro" type="button" data-accion="eliminar-negocio">${icono('borrar')}Eliminar negocio</button>
            </div>
          </section>
        </div>`));
    } catch (e) { v.error(e); }
  }

  // ---------------------------------------------------------------- Accesos de un negocio
  async function vistaAccesos(ctx, op) {
    const v = preparar(op);
    try {
      const n = await negocioCtx(ctx);
      if (!v.vigente()) return;
      if (!n) { v.pintar(envolver(ctx, null, 'accesos', '')); return; }
      S.datos.accesos = await API.accesos(n.id);
      if (!v.vigente()) return;
      const grupo = (rol) => S.datos.accesos.filter((a) => a.rol === rol).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      const fila = (a) => {
        const visible = S.claves[a.user_id];
        return `<div class="fila">
          <span class="c-usu principal-txt ${a.rol === 'cliente' ? 'mono' : ''}">${esc(a.usuario)}</span>
          <span class="c-nom secundario">${esc(a.nombre)}</span>
          <span class="c-cla clave-oculta">
            ${!a.user_id ? '<span class="stock agotado">Sin acceso</span>'
              : !a.tiene_clave ? '<span class="tenue peq">Sin registrar</span>'
              : visible !== undefined
                ? `<span class="mono">${esc(visible)}</span>
                   <button class="btn btn-texto btn-icono peq" type="button" data-accion="ocultar-clave" data-uid="${esc(a.user_id)}" aria-label="Ocultar contraseña">${icono('ojoNo')}</button>
                   <button class="btn btn-texto btn-icono peq" type="button" data-accion="copiar" data-texto="${esc(visible)}" aria-label="Copiar contraseña">${icono('copiar')}</button>`
                : `<span class="mono tenue">••••••</span>
                   <button class="btn btn-texto btn-icono peq" type="button" data-accion="mostrar-clave" data-uid="${esc(a.user_id)}" aria-label="Ver contraseña">${icono('ojo')}</button>`}
          </span>
          <span class="c-acc acciones">
            ${a.rol === 'cliente'
              ? `<button class="btn btn-texto btn-icono peq" type="button" data-accion="editar-cliente" data-id="${esc(a.ref_id)}" aria-label="Editar cliente" title="Editar o cambiar contraseña">${icono('editar')}</button>`
              : `<button class="btn btn-texto btn-icono peq" type="button" data-accion="editar-personal" data-uid="${esc(a.user_id)}" aria-label="Editar cuenta" title="Editar o cambiar contraseña">${icono('editar')}</button>
                 <button class="btn btn-texto btn-icono peq" type="button" data-accion="eliminar-personal" data-uid="${esc(a.user_id)}" aria-label="Eliminar cuenta" title="Eliminar">${icono('borrar')}</button>`}
          </span>
        </div>`;
      };
      const seccion = (titulo, rol, boton, vacio) => {
        const l = grupo(rol);
        return `<section class="tarjeta">
          <div class="tarjeta-cab"><h2>${titulo} <span class="contador">${l.length}</span></h2>${boton}</div>
          ${l.length ? `<div class="lista accesos-lista" style="border:0;border-radius:0 0 var(--r) var(--r)">
            <div class="lista-cab etq" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(170px,1fr) auto"><span>${rol === 'cliente' ? 'DNI' : 'Correo'}</span><span>Nombre</span><span>Contraseña</span><span></span></div>
            ${l.map(fila).join('')}</div>` : `<div class="tarjeta-in tenue">${vacio}</div>`}
        </section>`;
      };
      v.pintar(envolver(ctx, n, 'accesos', `
        <div class="bloques">
          ${seccion('Administradores', 'admin', `<button class="btn btn-flash" type="button" data-accion="nuevo-personal" data-rol="admin">${icono('mas')}Agregar administrador</button>`, 'Este negocio aún no tiene administrador.')}
          ${seccion('Couriers', 'courier', `<button class="btn btn-flash" type="button" data-accion="nuevo-personal" data-rol="courier">${icono('mas')}Agregar courier</button>`, 'Este negocio aún no tiene couriers.')}
          ${seccion('Clientes', 'cliente', `<a class="btn" href="#/negocio/${esc(n.id)}/clientes">${icono('clientes')}Gestionar clientes</a>`, 'Este negocio aún no tiene clientes.')}
          <p class="tenue peq">Las contraseñas «Sin registrar» son de cuentas creadas antes de esta versión. Ponles una nueva con el lápiz para poder verla aquí.</p>
        </div>`));
    } catch (e) { v.error(e); }
  }

  function modalPersonal(rol, cuenta) {
    const titulo = cuenta ? 'Editar cuenta' : rol === 'admin' ? 'Agregar administrador' : 'Agregar courier';
    abrirModal({
      titulo,
      html: `
        <form data-form="personal" novalidate autocomplete="off">
          <input type="hidden" name="rol" value="${esc(rol)}">
          <input type="hidden" name="uid" value="${esc(cuenta?.user_id || '')}">
          <div class="modal-cuerpo">
            <div class="campo"><label for="pe-nombre">Nombre</label>
              <input id="pe-nombre" name="nombre" type="text" maxlength="80" value="${esc(cuenta?.nombre || '')}" placeholder="${rol === 'admin' ? 'Ej. Rosa Huamán' : 'Ej. Carlos Quispe'}"></div>
            <div class="campo"><label for="pe-email">Correo</label>
              <input id="pe-email" name="email" type="email" autocapitalize="none" spellcheck="false" value="${esc(cuenta?.usuario || '')}" required>
              <span class="ayuda">Con este correo ingresa al sistema.</span></div>
            <div class="campo"><label for="pe-clave">${cuenta ? 'Nueva contraseña' : 'Contraseña'}</label>
              <div class="con-boton">
                <input id="pe-clave" name="password" type="text" autocomplete="new-password" spellcheck="false" placeholder="${cuenta ? 'Déjalo vacío para no cambiarla' : 'Mínimo 6 caracteres'}">
                <button class="btn" type="button" data-accion="generar-clave" data-para="pe-clave">Generar</button>
              </div></div>
            <div class="error-form" id="pe-error" hidden></div>
          </div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn btn-flash" type="submit">${cuenta ? 'Guardar' : 'Crear cuenta'}</button>
          </div>
        </form>`,
    });
  }

  async function guardarPersonal(form) {
    const err = document.getElementById('pe-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; };
    err.hidden = true;
    const uid = form.uid.value || null;
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value.trim();
    const nombre = form.nombre.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return mostrar('Escribe un correo válido.');
    if (!uid && password.length < 6) return mostrar('La contraseña debe tener al menos 6 caracteres.');
    if (uid && password && password.length < 6) return mostrar('La nueva contraseña debe tener al menos 6 caracteres.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const negocioId = ruta().split('/')[1];
      await API.usuarios(uid
        ? { accion: 'editar_personal', user_id: uid, email, nombre, password }
        : { accion: 'crear_personal', rol: form.rol.value, negocio_id: negocioId, email, nombre, password });
      if (uid && password) S.claves[uid] = password; else if (uid) delete S.claves[uid];
      cerrarModal();
      aviso(uid ? 'Cuenta actualizada' : 'Cuenta creada');
      if (!uid) mostrarDatosAcceso({ titulo: 'Cuenta creada', usuario: email, etiqueta: 'Correo', password, nombre: nombre || (form.rol.value === 'admin' ? 'Administrador' : 'Courier'), codigo: S.negocioCache[negocioId]?.codigo });
      render({ silencioso: true });
    } catch (e) { btn.disabled = false; mostrar(e.message); }
  }

  // ---------------------------------------------------------------- Formulario de negocio (crear / editar)
  const PALETAS = [
    ['Rayo', '#FFC400', '#121821'], ['Rosa', '#E8457C', '#2B1320'], ['Océano', '#1E88E5', '#0E2238'],
    ['Esmeralda', '#12A06B', '#0F2A21'], ['Coral', '#FF6B4A', '#24171A'], ['Violeta', '#7C5CFF', '#1A1534'],
    ['Turquesa', '#14B8C4', '#0D2A2E'], ['Naranja', '#FF8A00', '#1F1A14'],
  ];

  function camposNegocio(n, { requeridos = true } = {}) {
    const c1 = n?.color_primario || '#FFC400';
    const c2 = n?.color_secundario || '#121821';
    const r = requeridos ? 'required' : '';
    return `
      <div class="seccion-form">
        <h3>Datos del negocio</h3>
        <div class="campo"><label for="n-nombre">Nombre del negocio</label>
          <input id="n-nombre" name="nombre" type="text" maxlength="80" value="${esc(n?.nombre || '')}" placeholder="Ej. Importaciones Rositas" required></div>
        <div class="dos-col">
          <div class="campo"><label for="n-telefono">Teléfono</label>
            <input id="n-telefono" name="telefono" type="text" inputmode="tel" maxlength="30" value="${esc(n?.telefono || '')}" placeholder="Ej. 987 654 321" ${r}></div>
          <div class="campo"><label for="n-ruc">RUC <span class="tenue">(opcional)</span></label>
            <input id="n-ruc" name="ruc" type="text" inputmode="numeric" maxlength="11" value="${esc(n?.ruc || '')}" placeholder="11 dígitos"></div>
        </div>
        <div class="dos-col">
          <div class="campo"><label for="n-instagram">Instagram <span class="tenue">(opcional)</span></label>
            <input id="n-instagram" name="instagram" type="text" maxlength="60" value="${esc(n?.instagram || '')}" placeholder="@minegocio"></div>
          <div class="campo"><label for="n-direccion">Dirección</label>
            <input id="n-direccion" name="direccion" type="text" maxlength="160" value="${esc(n?.direccion || '')}" placeholder="Calle, número y distrito" ${r}></div>
        </div>
        <div class="dos-col">
          <div class="campo"><label for="n-dueno">Nombre del dueño</label>
            <input id="n-dueno" name="dueno_nombre" type="text" maxlength="100" value="${esc(n?.dueno_nombre || '')}" ${r}></div>
          <div class="campo"><label for="n-dni">DNI del dueño</label>
            <input id="n-dni" name="dueno_dni" type="text" inputmode="numeric" maxlength="15" value="${esc(n?.dueno_dni || '')}" ${r}></div>
        </div>
      </div>
      <div class="seccion-form">
        <h3>Logotipo</h3>
        <div class="subir-logo">
          <span class="vista-logo" id="n-logo-vista">${n?.logo_ruta ? `<img src="${esc(logoUrl(n.logo_ruta))}" alt="Logo actual">` : icono('imagen')}</span>
          <label class="btn">${icono('imagen')}${n?.logo_ruta ? 'Cambiar logotipo' : 'Subir logotipo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" id="n-logo" data-logo-negocio></label>
          <span class="ayuda tenue peq">PNG, JPG o WebP. Sale en la boleta y en el sistema del negocio.</span>
        </div>
      </div>
      <div class="seccion-form">
        <h3>Paleta de colores</h3>
        <p class="tenue peq" style="margin-top:-.5rem">El sistema de este negocio (administrador, courier, clientes y boletas) se verá con estos colores.</p>
        <div class="paletas" role="group" aria-label="Paletas sugeridas">
          ${PALETAS.map(([nom, a, b]) => `<button type="button" class="paleta" data-accion="elegir-paleta" data-c1="${a}" data-c2="${b}" aria-pressed="${a.toLowerCase() === c1.toLowerCase() && b.toLowerCase() === c2.toLowerCase()}">
            <i><b style="background:${a}"></b><b style="background:${b}"></b></i>${nom}</button>`).join('')}
        </div>
        <div class="colores-propios">
          <label for="n-c1">Color principal (botones)<input type="color" id="n-c1" name="color_primario" value="${esc(c1)}" data-color-negocio></label>
          <label for="n-c2">Color de las barras<input type="color" id="n-c2" name="color_secundario" value="${esc(c2)}" data-color-negocio></label>
          <div class="vista-paleta" id="n-vista-paleta" style="flex:1;min-width:220px">${vistaPaleta(c1, c2, n?.nombre)}</div>
        </div>
      </div>`;
  }
  function vistaPaleta(c1, c2, nombre) {
    return `<div class="vp-barra" style="background:${esc(c2)};color:${textoSobre(c2)}"><span>${esc(nombre || 'Tu negocio')}</span><span style="font-size:.7rem;font-style:normal;opacity:.7">Vista previa</span></div>
      <div class="vp-cuerpo"><span class="vp-boton" style="background:${esc(c1)};color:${textoSobre(c1)}">Nuevo pedido</span><span class="vp-boton" style="background:${esc(c2)};color:${textoSobre(c2)}">Agregar</span></div>`;
  }
  function datosDelFormulario(form) {
    const val = (k) => (form.elements[k]?.value || '').trim();
    return {
      nombre: val('nombre'), telefono: val('telefono'), ruc: val('ruc'), instagram: val('instagram'), direccion: val('direccion'),
      dueno_nombre: val('dueno_nombre'), dueno_dni: val('dueno_dni'),
      color_primario: (val('color_primario') || '#FFC400').toUpperCase(), color_secundario: (val('color_secundario') || '#121821').toUpperCase(),
    };
  }

  async function vistaFormNegocio(id) {
    const v = preparar({});
    try {
      const n = id ? await API.negocio(id) : null;
      if (!v.vigente()) return;
      if (id && !n) { v.pintar(`<a class="volver" href="#/negocios">${icono('volver')}Negocios</a><div class="tarjeta">${vacioHTML('negocios', 'Este negocio ya no existe', '')}</div>`); return; }
      if (n) aplicarMarca(n);
      S.formNegocio = { id, logo: null, modo: n ? 'super' : (S.formNegocio?.modo || 'super') };
      const modo = S.formNegocio.modo;
      const volver = id ? `#/negocio/${id}` : '#/negocios';
      v.pintar(`
        <a class="volver" href="${volver}">${icono('volver')}${id ? esc(n.nombre) : 'Negocios'}</a>
        <div class="cab"><div class="cab-texto"><span class="etq">${id ? 'Editar' : 'Nuevo negocio'}</span><h1>${id ? 'Datos del negocio' : 'Crear negocio'}</h1></div></div>
        <form data-form="negocio" class="bloques" novalidate>
          ${id ? '' : `
          <section class="tarjeta"><div class="tarjeta-in seccion-form">
            <h3>¿Quién llena los datos del negocio?</h3>
            <div class="modo-datos" role="radiogroup">
              <label><input type="radio" name="modo" value="super" ${modo === 'super' ? 'checked' : ''} data-modo-negocio>
                <span><strong>Los lleno yo</strong><small>Nombre, teléfono, RUC, Instagram, dirección, dueño, logotipo y colores.</small></span></label>
              <label><input type="radio" name="modo" value="admin" ${modo === 'admin' ? 'checked' : ''} data-modo-negocio>
                <span><strong>Los llenará su administrador</strong><small>Creo su cuenta ahora y, al ingresar, él completa los datos. Después solo yo podré verlos y editarlos.</small></span></label>
            </div>
          </div></section>`}
          <section class="tarjeta"><div class="tarjeta-in" id="n-campos">
            ${modo === 'admin' && !id
              ? `<div class="seccion-form"><h3>Datos del negocio</h3>
                  <div class="campo"><label for="n-nombre">Nombre del negocio (provisional)</label>
                    <input id="n-nombre" name="nombre" type="text" maxlength="80" placeholder="Ej. Importaciones Seguras" required>
                    <span class="ayuda">Su administrador podrá corregirlo al completar los datos.</span></div></div>`
              : camposNegocio(n)}
          </div></section>
          <section class="tarjeta"><div class="tarjeta-in seccion-form">
            <h3>Servicio</h3>
            <div class="dos-col">
              <div class="campo"><label for="n-inicio">Fecha de inicio del servicio</label>
                <input id="n-inicio" name="servicio_inicio" type="date" value="${esc(n?.servicio_inicio || hoyLima())}" required></div>
              ${n ? `<div class="dato"><span class="etq">Negocio creado</span><span class="valor">${esc(fechaHora(n.creado))}</span></div>` : ''}
            </div>
            <span class="ayuda tenue peq">Solo tú ves estos datos. Para pausar o terminar el servicio usa los botones del resumen del negocio.</span>
          </div></section>
          ${id ? '' : `
          <section class="tarjeta"><div class="tarjeta-in seccion-form">
            <h3>Cuenta del administrador ${modo === 'admin' ? '' : '<span class="tenue" style="font-weight:500">(opcional, también puedes crearla después)</span>'}</h3>
            <div class="dos-col">
              <div class="campo"><label for="a-email">Correo</label>
                <input id="a-email" name="admin_email" type="email" autocapitalize="none" spellcheck="false" ${modo === 'admin' ? 'required' : ''}></div>
              <div class="campo"><label for="a-nombre">Nombre</label>
                <input id="a-nombre" name="admin_nombre" type="text" maxlength="80" placeholder="Administrador"></div>
            </div>
            <div class="campo"><label for="a-clave">Contraseña</label>
              <div class="con-boton"><input id="a-clave" name="admin_clave" type="text" autocomplete="new-password" spellcheck="false" placeholder="Mínimo 6 caracteres">
                <button class="btn" type="button" data-accion="generar-clave" data-para="a-clave">Generar</button></div></div>
          </div></section>`}
          <div class="error-form" id="n-error" hidden></div>
          <div class="acciones-pie">
            <a class="btn btn-grande" href="${volver}">Cancelar</a>
            <button class="btn btn-flash btn-grande" type="submit">${id ? 'Guardar cambios' : 'Crear negocio'}</button>
          </div>
        </form>`);
    } catch (e) { v.error(e); }
  }

  async function guardarFormNegocio(form) {
    const err = document.getElementById('n-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    err.hidden = true;
    const F = S.formNegocio;
    const id = F.id;
    const modo = id ? 'super' : (form.querySelector('input[name=modo]:checked')?.value || 'super');
    const datos = modo === 'admin' && !id ? { nombre: form.nombre.value.trim() } : datosDelFormulario(form);
    datos.servicio_inicio = form.servicio_inicio.value;
    datos.datos_por = modo;
    if (!datos.nombre) return mostrar('Escribe el nombre del negocio.');
    const completos = !!(datos.telefono && datos.direccion && datos.dueno_nombre && datos.dueno_dni);
    if (id) datos.marcar_completo = completos; // si el super ya llenó todo, el administrador no tendrá que hacerlo
    if (modo === 'super' && !id) {
      if (!datos.telefono) return mostrar('Escribe el teléfono.');
      if (!datos.direccion) return mostrar('Escribe la dirección.');
      if (!datos.dueno_nombre) return mostrar('Escribe el nombre del dueño.');
      if (!datos.dueno_dni) return mostrar('Escribe el DNI del dueño.');
    }
    if (datos.ruc && !/^\d{11}$/.test(datos.ruc)) return mostrar('El RUC debe tener 11 dígitos.');
    if (!datos.servicio_inicio) return mostrar('Elige la fecha de inicio del servicio.');
    const adminEmail = (form.admin_email?.value || '').trim().toLowerCase();
    const adminClave = (form.admin_clave?.value || '').trim();
    const adminNombre = (form.admin_nombre?.value || '').trim();
    if (!id && (modo === 'admin' || adminEmail || adminClave)) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) return mostrar('Escribe el correo del administrador.');
      if (adminClave.length < 6) return mostrar('La contraseña del administrador debe tener al menos 6 caracteres.');
    }
    const btn = form.querySelector('[type=submit]');
    const texto = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
    let negocioId = id;
    try {
      if (!id) datos.codigo = slug(datos.nombre);
      negocioId = await API.guardarNegocio(id, datos);
      if (F.logo) {
        const rutaLogo = await API.subirLogo(negocioId, F.logo);
        await API.guardarNegocio(negocioId, { ...(modo === 'admin' && !id ? { nombre: datos.nombre } : datos), logo_ruta: rutaLogo });
      }
      let acceso = null;
      if (!id && adminEmail) {
        await API.usuarios({ accion: 'crear_personal', rol: 'admin', negocio_id: negocioId, email: adminEmail, password: adminClave, nombre: adminNombre });
        acceso = { usuario: adminEmail, password: adminClave, nombre: adminNombre || 'Administrador' };
      }
      delete S.negocioCache[negocioId];
      S.formNegocio = null;
      aviso(id ? 'Datos guardados' : 'Negocio creado');
      ir('negocio/' + negocioId);
      if (acceso) {
        const n = await API.negocio(negocioId);
        mostrarDatosAcceso({ titulo: 'Negocio creado', usuario: acceso.usuario, etiqueta: 'Correo del administrador', password: acceso.password, nombre: acceso.nombre, codigo: n?.codigo,
          nota: modo === 'admin' ? 'Al ingresar, el administrador completará los datos del negocio.' : '' });
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = texto;
      mostrar(e.message);
      if (!id && negocioId) { F.id = null; } // el negocio se creó; los datos quedan y el error se muestra
    }
  }

  // ---------------------------------------------------------------- El administrador completa los datos de su negocio
  function vistaCompletarNegocio() {
    const v = preparar({});
    const n = S.marca || {};
    S.formNegocio = { id: S.perfil.negocio_id, logo: null, modo: 'admin' };
    v.pintar(`
      <div class="cab"><div class="cab-texto"><span class="etq">Bienvenido</span><h1>Completa los datos de tu negocio</h1>
        <p class="medio" style="max-width:62ch;margin-top:.35rem">Solo se hace una vez. Estos datos salen en las boletas y definen los colores de tu sistema. Después no podrás cambiarlos desde aquí; si necesitas corregir algo, pídeselo al administrador del sistema.</p></div></div>
      <form data-form="completar" class="bloques" novalidate>
        <section class="tarjeta"><div class="tarjeta-in">${camposNegocio({ nombre: n.nombre, color_primario: n.color_primario, color_secundario: n.color_secundario })}</div></section>
        <div class="error-form" id="n-error" hidden></div>
        <div class="acciones-pie"><button class="btn btn-flash btn-grande" type="submit">${icono('check')}Guardar datos</button></div>
      </form>`);
  }

  async function guardarCompletar(form) {
    const err = document.getElementById('n-error');
    const mostrar = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    err.hidden = true;
    const datos = datosDelFormulario(form);
    if (!datos.nombre) return mostrar('Escribe el nombre del negocio.');
    if (!datos.telefono) return mostrar('Escribe el teléfono.');
    if (!datos.direccion) return mostrar('Escribe la dirección.');
    if (!datos.dueno_nombre) return mostrar('Escribe el nombre del dueño.');
    if (!datos.dueno_dni) return mostrar('Escribe el DNI del dueño.');
    if (datos.ruc && !/^\d{11}$/.test(datos.ruc)) return mostrar('El RUC debe tener 11 dígitos.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
    try {
      if (S.formNegocio.logo) datos.logo_ruta = await API.subirLogo(S.perfil.negocio_id, S.formNegocio.logo);
      await API.completarNegocio(datos);
      S.formNegocio = null;
      S.perfil = await API.perfil();
      S.marca = await API.marca();
      aplicarMarca(S.marca);
      S.shell = null;
      aviso('Datos guardados. ¡Listo para trabajar!');
      ir('pedidos');
    } catch (e) {
      btn.disabled = false; btn.innerHTML = `${icono('check')}Guardar datos`;
      mostrar(e.message);
    }
  }

  // ===================================================================
  // ADMINISTRADOR (o super dentro de un negocio) · Pedidos
  // ===================================================================
  async function vistaPedidosAdmin(ctx, op) {
    const v = preparar(op);
    try {
      const [n, pedidos] = await Promise.all([negocioCtx(ctx), API.pedidosAdmin(ctx.negocioId)]);
      if (!v.vigente()) return;
      S.datos.pedidos = pedidos;
      S.ctx = ctx;
      const cuenta = (e) => S.datos.pedidos.filter((p) => e === 'todos' || p.estado === e).length;
      v.pintar(envolver(ctx, n, 'pedidos', `
        <div class="cab">
          <div class="cab-texto">${ctx.super ? '' : `<span class="etq">${esc(S.marca?.nombre || '')}</span>`}<h1 ${ctx.super ? 'style="font-size:1.3rem"' : ''}>Pedidos</h1></div>
          <div class="cab-acciones"><a class="btn btn-flash" href="#/${ctx.base}pedido/nuevo">${icono('mas')}Nuevo pedido</a></div>
        </div>
        <div class="herramientas">
          <div class="filtros" role="group" aria-label="Filtrar por estado">
            ${[['todos', 'Todos'], ['creado', 'Creados'], ['empaquetado', 'Empaquetados'], ['cerrado', 'Cerrados']].map(([k, t]) =>
              `<button type="button" data-accion="filtro-pedidos" data-filtro="${k}" aria-pressed="${S.filtro === k}">${t}<span class="n">${cuenta(k)}</span></button>`).join('')}
          </div>
          <label class="buscar"><span class="sr">Buscar pedidos</span>${icono('buscar')}
            <input type="search" id="buscar-pedidos" data-buscar="pedidos" placeholder="N.º de pedido, cliente o DNI" value="${esc(S.buscar.pedidos)}"></label>
        </div>
        <div id="lista-pedidos"></div>`));
      pintarListaPedidos();
    } catch (e) { v.error(e); }
  }

  function pintarListaPedidos() {
    const cont = document.getElementById('lista-pedidos');
    if (!cont) return;
    const base = S.ctx?.base || '';
    const t = norm(S.buscar.pedidos).replace(/^#/, '');
    const lista = S.datos.pedidos.filter((p) =>
      (S.filtro === 'todos' || p.estado === S.filtro) &&
      (!t || String(p.numero).includes(t) || norm(p.cliente_nombre).includes(t) || norm(p.cliente_dni).includes(t)));
    if (!S.datos.pedidos.length) {
      cont.innerHTML = `<div class="tarjeta">${vacioHTML('pedidos', 'Aún no hay pedidos',
        'Crea el primero: elige un cliente, la dirección, el tipo de envío, el courier y los productos del inventario.',
        `<a class="btn btn-flash" href="#/${base}pedido/nuevo">${icono('mas')}Nuevo pedido</a>`)}</div>`;
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
          <a class="fila col-pedidos" href="#/${base}pedido/${esc(p.id)}">
            <span class="c-num numero-pedido">#${esc(p.numero)}</span>
            <span class="c-cli"><span class="principal-txt" style="display:block">${esc(p.cliente_nombre)}</span><span class="secundario mono" style="display:block">DNI ${esc(p.cliente_dni)}</span></span>
            <span class="c-env">${envioHTML(p.envio)}</span>
            <span class="c-uni mono">${unidades(p.pedido_items)}</span>
            <span class="c-est">${estadoHTML(p.estado)}</span>
            <span class="c-fec secundario">${esc(fechaCorta(p.creado))}</span>
          </a>`).join('')}
      </div>`;
  }

  // ---------------------------------------------------------------- Detalle
  async function vistaPedidoAdmin(ctx, id, op) {
    const v = preparar(op);
    try {
      const [n, p, eventos] = await Promise.all([negocioCtx(ctx), API.pedido(id), API.eventos(id)]);
      if (!v.vigente()) return;
      const base = ctx.base;
      if (!p) {
        v.pintar(envolver(ctx, n, 'pedidos', `<a class="volver" href="#/${base}pedidos">${icono('volver')}Pedidos</a>
          <div class="tarjeta">${vacioHTML('pedidos', 'Este pedido ya no existe', 'Puede que alguien lo haya eliminado.')}</div>`));
        return;
      }
      const evs = p.evidencias || [];
      const urls = await API.urls(evs.map((e) => e.ruta));
      if (!v.vigente()) return;
      const tipos = ['productos', 'empaquetado', p.envio === 'shalom' ? 'boleta' : 'motorizado'];

      v.pintar(envolver(ctx, n, 'pedidos', `
        <a class="volver" href="#/${base}pedidos">${icono('volver')}Pedidos</a>
        <div class="bloques">
          <div class="cab" style="margin:0">
            <div class="cab-texto"><span class="etq">Detalle del pedido</span><h1>Pedido #${esc(p.numero)}</h1></div>
            <div class="cab-acciones">
              <a class="btn btn-flash" href="#/boleta/${esc(p.id)}">${icono('boleta')}Ver boleta</a>
              <a class="btn" href="#/${base}pedido/${esc(p.id)}/editar">${icono('editar')}Editar</a>
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
                <div class="dato"><span class="etq">Vendedor (courier)</span><span class="valor">${p.vendedor_nombre ? esc(p.vendedor_nombre) : '<span class="tenue">Sin asignar</span>'}</span></div>
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
        </div>`));
    } catch (e) { v.error(e); }
  }

  // ---------------------------------------------------------------- Crear / editar pedido
  async function vistaFormPedido(ctx, id) {
    const v = preparar({});
    try {
      const [n, clientes, productos, couriers, pedido] = await Promise.all([
        negocioCtx(ctx), API.clientes(ctx.negocioId), API.productos(ctx.negocioId), API.couriers(ctx.negocioId), id ? API.pedido(id) : Promise.resolve(null),
      ]);
      if (!v.vigente()) return;
      const base = ctx.base;
      if (id && !pedido) {
        v.pintar(envolver(ctx, n, 'pedidos', `<a class="volver" href="#/${base}pedidos">${icono('volver')}Pedidos</a><div class="tarjeta">${vacioHTML('pedidos', 'Este pedido ya no existe', '')}</div>`));
        return;
      }
      S.datos.clientes = clientes;
      S.datos.productos = productos;
      S.datos.couriers = couriers;

      const original = {};
      (pedido?.pedido_items || []).forEach((i) => { if (i.producto_id) original[i.producto_id] = (original[i.producto_id] || 0) + i.cantidad; });
      const editable = !pedido || pedido.estado === 'creado';
      S.form = {
        ctx,
        id: pedido?.id || null,
        estado: pedido?.estado || 'creado',
        original,
        editable,
        items: ordenarItems(pedido?.pedido_items).map((i) => ({
          producto_id: i.producto_id, nombre: i.nombre, descripcion: i.descripcion, cantidad: i.cantidad, precio: i.precio ?? '',
        })),
      };
      const clienteSel = pedido?.cliente_id || S.preCliente || '';
      S.preCliente = null;
      const volver = pedido ? `#/${base}pedido/${pedido.id}` : `#/${base}pedidos`;
      const courierSel = pedido ? pedido.courier_id : (couriers.length === 1 ? couriers[0].user_id : '');

      if (!clientes.length && !pedido) {
        v.pintar(envolver(ctx, n, 'pedidos', `<a class="volver" href="#/${base}pedidos">${icono('volver')}Pedidos</a>
          <div class="tarjeta">${vacioHTML('clientes', 'Primero crea un cliente', 'Cada pedido necesita un cliente con su cuenta.',
            `<a class="btn btn-flash" href="#/${base}clientes">${icono('mas')}Ir a clientes</a>`)}</div>`));
        return;
      }

      v.pintar(envolver(ctx, n, 'pedidos', `
        <a class="volver" href="${volver}">${icono('volver')}${pedido ? 'Pedido #' + esc(pedido.numero) : 'Pedidos'}</a>
        <div class="cab"><div class="cab-texto"><span class="etq">${pedido ? 'Pedido #' + esc(pedido.numero) : 'Se registrará como «pedido creado» y se genera su boleta'}</span>
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
              <div class="campo">
                <label for="f-courier">Vendedor (courier)</label>
                <select id="f-courier" name="courier">
                  <option value="">${couriers.length ? 'Elige quién vendió…' : 'Este negocio aún no tiene couriers'}</option>
                  ${couriers.map((c) => `<option value="${esc(c.user_id)}" ${c.user_id === courierSel ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.email)}</option>`).join('')}
                </select>
                <span class="ayuda">Sale en la boleta como la persona que vendió.</span>
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
                <div class="error-form" id="f-item-error" hidden></div>
                <p class="tenue peq" style="margin-top:-.4rem">El precio por unidad es opcional. Si lo pones, la boleta muestra importes y total en soles.</p>`
                : `<div class="aviso">${icono('info')}<span>Los productos ya no se pueden cambiar porque el pedido ya fue empaquetado. Puedes corregir el cliente${pedido.estado === 'cerrado' ? ', la dirección y el vendedor' : ', la dirección, el tipo de envío y el vendedor'}.</span></div>`}
              <ul class="items-form con-precio" id="f-items"></ul>
            </div>
          </section>

          <div class="error-form" id="f-error" hidden></div>
          <div class="acciones-pie">
            <a class="btn btn-grande" href="${volver}">Cancelar</a>
            <button class="btn btn-flash btn-grande" type="submit">${pedido ? 'Guardar cambios' : 'Crear pedido'}</button>
          </div>
        </form>`));
      pintarItemsForm();
    } catch (e) { v.error(e); }
  }

  const disponible = (productoId) => {
    const p = S.datos.productos.find((x) => x.id === productoId);
    return (p ? p.cantidad : 0) + (S.form.original[productoId] || 0);
  };

  function pintarTotalesForm() {
    const its = S.form.items;
    const tot = document.getElementById('f-total');
    const precios = its.some((i) => i.precio !== '' && i.precio !== null && i.precio !== undefined);
    if (tot) tot.textContent = plural(unidades(its), 'unidad', 'unidades') + (precios ? ' · ' + dinero(totalSoles(its)) : '');
  }

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
               <label class="precio-item"><span>S/</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${esc(it.precio ?? '')}" data-precio-item="${idx}" placeholder="0.00" aria-label="Precio por unidad de ${esc(it.nombre)}"></label>
               <button class="btn btn-texto btn-icono" type="button" data-accion="quitar-item" data-idx="${idx}" aria-label="Quitar ${esc(it.nombre)}">${icono('x')}</button>`
            : `<span class="mono" style="text-align:center;font-weight:700">${esc(it.cantidad)}</span><span class="mono tenue" style="text-align:right">${it.precio !== '' && it.precio != null ? esc(dinero(it.precio)) : ''}</span><span></span>`}
        </li>`;
      }).join('');
    }
    pintarTotalesForm();

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
    else f.items.push({ producto_id: prod.id, nombre: prod.nombre, descripcion: prod.descripcion, cantidad: cant, precio: prod.precio_ref ?? '' });
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
    const courier = form.courier.value || null;
    if (!cliente_id) return mostrar('Elige un cliente.');
    if (!direccion) return mostrar('Escribe la dirección de entrega.');
    if (!envio) return mostrar('Elige si el envío es por motorizado o por Shalom.');
    if (!courier && S.datos.couriers.length) return mostrar('Elige el vendedor (courier) del pedido.');
    let items = null;
    if (f.editable) {
      if (!f.items.length) return mostrar('Agrega al menos un producto del inventario.');
      const malo = f.items.find((i) => !i.producto_id || i.cantidad < 1 || i.cantidad > disponible(i.producto_id));
      if (malo) return mostrar(!malo.producto_id ? `«${malo.nombre}» ya no está en el inventario: quítalo del pedido.` : `Revisa la cantidad de «${malo.nombre}»: hay ${disponible(malo.producto_id)} disponibles.`);
      const precioMalo = f.items.find((i) => i.precio !== '' && i.precio != null && (isNaN(Number(i.precio)) || Number(i.precio) < 0));
      if (precioMalo) return mostrar(`Revisa el precio de «${precioMalo.nombre}».`);
      items = f.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, precio: i.precio === '' || i.precio == null ? null : Number(i.precio) }));
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const texto = btn.textContent;
    btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Guardando…';
    try {
      const id = await API.guardarPedido({ id: f.id, cliente_id, direccion, envio, items, courier, negocio: f.ctx.super ? f.ctx.negocioId : null });
      aviso(f.id ? 'Cambios guardados' : 'Pedido creado con su boleta');
      const base = f.ctx.base;
      S.form = null;
      ir(base + 'pedido/' + id);
    } catch (e) {
      btn.disabled = false; btn.textContent = texto;
      mostrar(e.message);
      if (/stock/i.test(e.message)) {
        try { S.datos.productos = await API.productos(f.ctx.negocioId); pintarItemsForm(); } catch { /* sin cambios */ }
      }
    }
  }

  // ===================================================================
  // Inventario
  // ===================================================================
  async function vistaInventario(ctx, op) {
    const v = preparar(op);
    try {
      const [n, productos] = await Promise.all([negocioCtx(ctx), API.productos(ctx.negocioId)]);
      if (!v.vigente()) return;
      S.datos.productos = productos;
      S.ctx = ctx;
      const total = productos.reduce((s, p) => s + p.cantidad, 0);
      v.pintar(envolver(ctx, n, 'inventario', `
        <div class="cab">
          <div class="cab-texto"><span class="etq">${plural(productos.length, 'producto', 'productos')} · ${plural(total, 'unidad', 'unidades')} en almacén</span><h1 ${ctx.super ? 'style="font-size:1.3rem"' : ''}>Inventario</h1></div>
          <div class="cab-acciones"><button class="btn btn-flash" type="button" data-accion="nuevo-producto">${icono('mas')}Agregar producto</button></div>
        </div>
        <div class="herramientas">
          <label class="buscar"><span class="sr">Buscar productos</span>${icono('buscar')}
            <input type="search" id="buscar-productos" data-buscar="productos" placeholder="Buscar por nombre o descripción" value="${esc(S.buscar.productos)}"></label>
        </div>
        <div id="lista-productos"></div>`));
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
        'Agrega los productos con su nombre, descripción y cantidad. Cuando crees pedidos, la cantidad se descuenta sola.',
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
      await API.guardarProducto({ id: form.id.value || null, nombre, descripcion, cantidad }, S.ctx.negocioId);
      cerrarModal();
      aviso(form.id.value ? 'Producto actualizado' : 'Producto agregado');
      render({ silencioso: true });
    } catch (e) { btn.disabled = false; mostrar(e.message); }
  }

  // ===================================================================
  // Clientes
  // ===================================================================
  async function vistaClientes(ctx, op) {
    const v = preparar(op);
    try {
      const [n, clientes] = await Promise.all([negocioCtx(ctx), API.clientes(ctx.negocioId)]);
      if (!v.vigente()) return;
      S.datos.clientes = clientes;
      S.ctx = ctx;
      v.pintar(envolver(ctx, n, 'clientes', `
        <div class="cab">
          <div class="cab-texto"><span class="etq">${plural(clientes.length, 'cliente', 'clientes')} con cuenta</span><h1 ${ctx.super ? 'style="font-size:1.3rem"' : ''}>Clientes</h1></div>
          <div class="cab-acciones"><button class="btn btn-flash" type="button" data-accion="nuevo-cliente">${icono('mas')}Nuevo cliente</button></div>
        </div>
        <div class="herramientas">
          <label class="buscar"><span class="sr">Buscar clientes</span>${icono('buscar')}
            <input type="search" id="buscar-clientes" data-buscar="clientes" placeholder="Buscar por DNI, nombre o apellido" value="${esc(S.buscar.clientes)}"></label>
        </div>
        <div id="lista-clientes"></div>`));
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
                <button class="btn" type="button" data-accion="generar-clave" data-para="c-clave">Generar</button>
              </div>
              <span class="ayuda">${c ? 'Escribe una solo si quieres cambiarla.' : 'Es la que le darás al cliente.'}</span></div>
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
      const ctx = S.ctx || {};
      const r = await API.usuarios(id
        ? { accion: 'editar_cliente', id, dni, nombres, apellidos, password }
        : { accion: 'crear_cliente', dni, nombres, apellidos, password, negocio_id: ctx.super ? ctx.negocioId : undefined });
      if (r.cliente?.user_id && password) S.claves[r.cliente.user_id] = password;
      cerrarModal();
      render({ silencioso: true });
      if (password) mostrarDatosAcceso({ titulo: id ? 'Contraseña actualizada' : 'Cliente creado', usuario: dni, etiqueta: 'DNI', password, nombre: nombres, codigo: r.codigo_negocio, cliente: true });
      else aviso('Cliente actualizado');
    } catch (e) {
      btn.disabled = false; btn.textContent = texto;
      mostrar(e.message);
    }
  }

  // Datos de ingreso para enviar por WhatsApp (clientes y personal)
  function mostrarDatosAcceso({ titulo, usuario, etiqueta, password, nombre, codigo, cliente, nota }) {
    const url = codigo ? enlaceClientes(codigo) : location.origin + location.pathname;
    const negocio = S.marca?.nombre || (codigo && Object.values(S.negocioCache).find((n) => n?.codigo === codigo)?.nombre) || '';
    const mensaje = cliente
      ? `Hola ${nombre}, ya puedes ver tus pedidos${negocio ? ' de ' + negocio : ''}.\nIngresa a: ${url}\nDNI: ${usuario}\nContraseña: ${password}`
      : `Hola ${nombre}, esta es tu cuenta${negocio ? ' de ' + negocio : ''}.\nIngresa a: ${url}\nCorreo: ${usuario}\nContraseña: ${password}`;
    abrirModal({
      titulo,
      html: `
        <div class="modal-cuerpo">
          <p>Envía estos datos a la persona para que ingrese.${nota ? ' ' + esc(nota) : ''}</p>
          <div class="acceso-dado">
            <div class="fila-dato"><span class="etq">Enlace</span><span class="mono peq">${esc(url)}</span></div>
            <div class="fila-dato"><span class="etq">${esc(etiqueta)}</span><span class="mono">${esc(usuario)}</span></div>
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
        <div class="saludo"><span class="etq">Vista courier · ${esc(S.perfil.nombre || '')}</span><h1>Pedidos</h1></div>
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
            <div class="linea">${icono('caja')}<span>${plural(p.pedido_items.length, 'producto', 'productos')} · ${plural(unidades(p.pedido_items), 'unidad', 'unidades')}${p.vendedor_nombre ? ' · vendió ' + esc(p.vendedor_nombre) : ''}</span></div>
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
            ${p.vendedor_nombre ? `<div class="dato"><span class="etq">Vendedor</span><span class="valor">${esc(p.vendedor_nombre)}</span></div>` : ''}
            <div style="margin-top:.9rem"><a class="btn" href="#/boleta/${esc(p.id)}">${icono('boleta')}Ver boleta</a></div>
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
        <div class="saludo"><span class="etq">${esc(S.marca?.nombre || '')}</span><h1>Hola, ${esc(S.perfil.nombres || S.perfil.nombre)}</h1></div>
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
          <a class="btn btn-flash btn-grande btn-bloque" href="#/boleta/${esc(p.id)}">${icono('boleta')}Ver mi boleta</a>
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
  // BOLETA del pedido (se genera sola al crear el pedido)
  // ===================================================================
  async function vistaBoleta(id, op) {
    const v = preparar(op);
    try {
      const p = await API.pedido(id);
      if (!v.vigente()) return;
      const rol = S.perfil.rol;
      const volver = !p ? '#/' : rol === 'super' ? `#/negocio/${p.negocio_id}/pedido/${p.id}` : rol === 'admin' ? `#/pedido/${p.id}` : rol === 'courier' ? `#/courier/${p.id}` : `#/mi-pedido/${p.id}`;
      if (!p) {
        v.pintar(`<a class="volver" href="#/">${icono('volver')}Volver</a><div class="tarjeta">${vacioHTML('boleta', 'No encontramos esta boleta', '')}</div>`);
        return;
      }
      const b = p.boleta || {};
      if (rol === 'super') aplicarMarca(b);
      const its = ordenarItems(p.pedido_items);
      const precios = conPrecio(its);
      const ig = b.instagram ? (b.instagram.startsWith('@') ? b.instagram : '@' + b.instagram) : '';
      v.pintar(`
        <a class="volver" href="${volver}">${icono('volver')}Pedido #${esc(p.numero)}</a>
        <div class="boleta-zona">
          <div class="boleta-acciones">
            <button class="btn btn-flash" type="button" data-accion="imprimir">${icono('imprimir')}Imprimir o guardar PDF</button>
          </div>
          <article class="boleta" style="--b1:${esc(b.color_primario || '#FFC400')};--b2:${esc(b.color_secundario || '#121821')}">
            <div class="boleta-franja"></div>
            <div class="boleta-in">
              <header class="boleta-emisor">
                ${b.logo_ruta ? `<div class="b-logo"><img src="${esc(logoUrl(b.logo_ruta))}" alt="${esc(b.nombre || '')}"></div>` : ''}
                <div class="b-nombre">${esc(b.nombre || '')}</div>
                ${b.ruc ? `<div class="b-linea">RUC ${esc(b.ruc)}</div>` : ''}
                ${b.direccion ? `<div class="b-linea">${esc(b.direccion)}</div>` : ''}
                ${b.telefono || ig ? `<div class="b-linea">${b.telefono ? 'Tel. ' + esc(b.telefono) : ''}${b.telefono && ig ? ' · ' : ''}${ig ? 'Instagram ' + esc(ig) : ''}</div>` : ''}
              </header>
              <hr class="boleta-sep">
              <div class="boleta-titulo"><strong>BOLETA DEL PEDIDO</strong><span class="mono">N.º ${esc(String(p.numero).padStart(6, '0'))}</span></div>
              <dl class="boleta-datos">
                <dt>Fecha</dt><dd class="mono">${esc(fechaNum(p.creado))}</dd>
                <dt>Cliente</dt><dd>${esc(p.cliente_nombre)}</dd>
                <dt>DNI</dt><dd class="mono">${esc(p.cliente_dni)}</dd>
                <dt>Entrega</dt><dd>${esc(p.direccion)}</dd>
                <dt>Envío</dt><dd>${p.envio === 'shalom' ? 'Shalom' : 'Motorizado'}</dd>
                <dt>Vendedor</dt><dd>${p.vendedor_nombre ? esc(p.vendedor_nombre) : '—'}</dd>
              </dl>
              <hr class="boleta-sep">
              <table>
                <thead><tr><th style="width:3.2em">Cant.</th><th>Descripción</th>${precios ? '<th class="n">P. unit.</th><th class="n">Importe</th>' : ''}</tr></thead>
                <tbody>${its.map((i) => `<tr>
                  <td class="mono" style="font-weight:700">${esc(i.cantidad)}</td>
                  <td>${esc(i.nombre)}${i.descripcion ? `<small>${esc(i.descripcion)}</small>` : ''}</td>
                  ${precios ? `<td class="n">${i.precio != null ? esc(Number(i.precio).toFixed(2)) : '—'}</td><td class="n">${i.precio != null ? esc((i.precio * i.cantidad).toFixed(2)) : '—'}</td>` : ''}
                </tr>`).join('')}</tbody>
              </table>
              <div class="boleta-total">
                ${precios ? `<span>TOTAL</span><span class="mono">${esc(dinero(totalSoles(its)))}</span>` : `<span>Total de unidades</span><span class="mono">${unidades(its)}</span>`}
              </div>
              <hr class="boleta-sep">
              <footer class="boleta-pie">
                <span>¡Gracias por tu compra!</span>
                <span class="legal">Documento de control interno del pedido. No es un comprobante de pago electrónico SUNAT.</span>
              </footer>
            </div>
          </article>
        </div>`);
    } catch (e) { v.error(e); }
  }

  // ===================================================================
  // Acciones (clics)
  // ===================================================================
  function cambiarClave() {
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

  function modalEliminarNegocio(n) {
    abrirModal({
      titulo: 'Eliminar negocio',
      html: `
        <form data-form="eliminar-negocio" novalidate>
          <div class="modal-cuerpo">
            <p>Se borrará <strong>${esc(n.nombre)}</strong> con todos sus pedidos, fotos, productos y clientes, y las cuentas de sus administradores, couriers y clientes. <strong>No se puede deshacer.</strong></p>
            <div class="campo"><label for="en-nombre">Escribe el nombre del negocio para confirmar</label>
              <input id="en-nombre" name="confirmacion" type="text" autocomplete="off" data-confirmar-nombre="${esc(n.nombre)}"></div>
            <div class="error-form" id="en-error" hidden></div>
          </div>
          <div class="modal-pie">
            <button class="btn" type="button" data-accion="cerrar-modal">Cancelar</button>
            <button class="btn btn-peligro-lleno" type="submit" id="en-boton" disabled>Eliminar para siempre</button>
          </div>
        </form>`,
    });
  }

  const acciones = {
    'recargar': () => location.reload(),
    'recargar-vista': () => render(),
    'imprimir': () => window.print(),
    'salir': async () => {
      const ok = await confirmar({ titulo: 'Salir', mensaje: '¿Quieres cerrar tu sesión?', boton: 'Salir', peligro: false });
      if (!ok) return;
      S.pedirCodigo = false;
      S.mensajeAcceso = '';
      history.replaceState(null, '', location.pathname + location.search);
      await sb.auth.signOut({ scope: 'local' });
    },
    'cambiar-clave': cambiarClave,
    'ver-clave': (el) => {
      const inp = document.getElementById(el.dataset.para);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      el.setAttribute('aria-label', inp.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    },
    'elegir-cuenta': async (el) => {
      const c = S.elegir.cuentas[Number(el.dataset.i)];
      el.disabled = true;
      await ingresarCliente(c.email, S.elegir.password);
    },
    'cancelar-eleccion': () => { S.elegir = null; mostrarAcceso(); },
    'cerrar-modal': () => cerrarModal(false),
    'fondo-modal': (el, ev) => { if (ev.target === el) cerrarModal(false); },
    'confirmar-si': () => cerrarModal(true),
    'copiar': (el) => copiarTexto(el.dataset.texto),
    'generar-clave': (el) => { const i = document.getElementById(el.dataset.para); i.value = claveSugerida(); i.focus(); },

    // Super: negocios
    'filtro-negocios': (el) => {
      S.filtroNegocios = el.dataset.filtro;
      document.querySelectorAll('[data-accion="filtro-negocios"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      pintarListaNegocios();
    },
    'elegir-paleta': (el) => {
      document.getElementById('n-c1').value = el.dataset.c1;
      document.getElementById('n-c2').value = el.dataset.c2;
      actualizarVistaPaleta();
    },
    'servicio': async (el) => {
      const negocioId = ruta().split('/')[1];
      const n = S.negocioCache[negocioId];
      const tipo = el.dataset.tipo;
      const textos = {
        pausar: ['Pausar servicio', `Se bloquearán todas las cuentas de <strong>${esc(n.nombre)}</strong> (administradores, couriers y clientes) hasta que lo reanudes. Sus datos se conservan.`, 'Pausar', true],
        reanudar: ['Reanudar servicio', `Se desbloquean todas las cuentas de <strong>${esc(n.nombre)}</strong> y vuelven a ingresar normalmente.`, 'Reanudar', false],
        terminar: ['Terminar servicio', `El servicio de <strong>${esc(n.nombre)}</strong> termina hoy y se bloquean todas sus cuentas. Sus datos se conservan y podrás comenzarlo de nuevo.`, 'Terminar', true],
        comenzar: ['Comenzar servicio', `El servicio de <strong>${esc(n.nombre)}</strong> vuelve a estar activo con fecha de inicio hoy, y se desbloquean sus cuentas.`, 'Comenzar', false],
      }[tipo];
      const ok = await confirmar({ titulo: textos[0], mensaje: textos[1], boton: textos[2], peligro: textos[3] });
      if (!ok) return;
      el.disabled = true;
      try {
        const r = await API.usuarios({ accion: 'servicio', negocio_id: negocioId, tipo });
        aviso({ pausar: 'Servicio pausado', reanudar: 'Servicio reanudado', terminar: 'Servicio terminado', comenzar: 'Servicio iniciado' }[tipo] + ` · ${plural(r.cuentas, 'cuenta', 'cuentas')}`);
        render({ silencioso: true });
      } catch (e) { el.disabled = false; aviso(e.message, 'error'); }
    },
    'eliminar-negocio': () => {
      const n = S.negocioCache[ruta().split('/')[1]];
      if (n) modalEliminarNegocio(n);
    },
    'nuevo-personal': (el) => modalPersonal(el.dataset.rol, null),
    'editar-personal': (el) => {
      const a = S.datos.accesos.find((x) => x.user_id === el.dataset.uid);
      if (a) modalPersonal(a.rol, a);
    },
    'eliminar-personal': async (el) => {
      const a = S.datos.accesos.find((x) => x.user_id === el.dataset.uid);
      const ok = await confirmar({ titulo: 'Eliminar cuenta', mensaje: `Se eliminará la cuenta de <strong>${esc(a.nombre)}</strong> (${esc(a.usuario)}) y ya no podrá ingresar.` });
      if (!ok) return;
      try { await API.usuarios({ accion: 'eliminar_personal', user_id: a.user_id }); aviso('Cuenta eliminada'); render({ silencioso: true }); }
      catch (e) { aviso(e.message, 'error'); }
    },
    'mostrar-clave': async (el) => {
      el.disabled = true;
      try {
        const c = await API.verClave(el.dataset.uid);
        S.claves[el.dataset.uid] = c ?? '';
        render({ silencioso: true });
      } catch (e) { el.disabled = false; aviso(e.message, 'error'); }
    },
    'ocultar-clave': (el) => { delete S.claves[el.dataset.uid]; render({ silencioso: true }); },

    // Pedidos
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
          ? 'Se eliminará el pedido con su boleta, fotos e historial. Como ya fue despachado, el inventario no cambia.'
          : `Se eliminará el pedido con su boleta, fotos e historial. Sus productos (${plural(Number(el.dataset.unidades), 'unidad', 'unidades')}) vuelven al inventario.`,
      });
      if (!ok) return;
      const base = ruta().startsWith('negocio/') ? ruta().split('/').slice(0, 2).join('/') + '/' : '';
      try { await API.eliminarPedido(el.dataset.id); aviso(`Pedido #${el.dataset.numero} eliminado`); ir(base + 'pedidos'); }
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
    'editar-cliente': async (el) => {
      let c = S.datos.clientes.find((x) => x.id === el.dataset.id);
      if (!c) {
        try { c = await q(sb.from('clientes').select('id, dni, nombres, apellidos, user_id').eq('id', el.dataset.id).maybeSingle()); } catch { c = null; }
      }
      if (c) modalCliente(c);
    },
    'pedido-para': (el) => { S.preCliente = el.dataset.id; ir((S.ctx?.base || '') + 'pedido/nuevo'); },
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
        const { data } = await sb.from('evidencias').select('id, ruta').eq('id', el.dataset.id).maybeSingle();
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
    'personal': guardarPersonal,
    'negocio': guardarFormNegocio,
    'completar': guardarCompletar,
    'eliminar-negocio': async (form) => {
      const err = document.getElementById('en-error');
      const negocioId = ruta().split('/')[1];
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Eliminando…';
      try {
        const r = await API.usuarios({ accion: 'eliminar_negocio', negocio_id: negocioId, confirmacion: form.confirmacion.value });
        cerrarModal();
        delete S.negocioCache[negocioId];
        aviso(`Negocio eliminado · ${plural(r.cuentas || 0, 'cuenta', 'cuentas')} y ${plural(r.fotos || 0, 'foto', 'fotos')}`);
        ir('negocios');
      } catch (e) { btn.disabled = false; btn.textContent = 'Eliminar para siempre'; err.textContent = e.message; err.hidden = false; }
    },
    'mi-clave': async (form) => {
      const err = document.getElementById('mc-error');
      const mostrar = (m) => { err.textContent = m; err.hidden = false; };
      if (form.c1.value.length < 6) return mostrar('La contraseña debe tener al menos 6 caracteres.');
      if (form.c1.value !== form.c2.value) return mostrar('Las dos contraseñas no coinciden.');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await API.usuarios({ accion: 'cambiar_mi_clave', password: form.c1.value });
        cerrarModal();
        aviso('Contraseña cambiada');
      } catch (e) { btn.disabled = false; mostrar(e.message); }
    },
  };

  function actualizarVistaPaleta() {
    const c1 = document.getElementById('n-c1')?.value;
    const c2 = document.getElementById('n-c2')?.value;
    if (!c1 || !c2) return;
    const nombre = document.getElementById('n-nombre')?.value;
    const vista = document.getElementById('n-vista-paleta');
    if (vista) vista.innerHTML = vistaPaleta(c1, c2, nombre);
    document.querySelectorAll('[data-accion="elegir-paleta"]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.c1.toLowerCase() === c1.toLowerCase() && b.dataset.c2.toLowerCase() === c2.toLowerCase())));
    aplicarMarca({ color_primario: c1, color_secundario: c2 });
  }

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
    if (t.dataset.usuarioAcceso !== undefined) revisarUsuarioAcceso(t.value);
    if (t.dataset.buscar) {
      S.buscar[t.dataset.buscar] = t.value;
      if (t.dataset.buscar === 'pedidos') pintarListaPedidos();
      if (t.dataset.buscar === 'productos') pintarListaProductos();
      if (t.dataset.buscar === 'clientes') pintarListaClientes();
      if (t.dataset.buscar === 'negocios') pintarListaNegocios();
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
      pintarTotalesForm();
    }
    if (t.dataset.precioItem !== undefined && S.form) {
      S.form.items[Number(t.dataset.precioItem)].precio = t.value;
      pintarTotalesForm();
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
    if (t.dataset.colorNegocio !== undefined || t.id === 'n-nombre') actualizarVistaPaleta();
    if (t.dataset.confirmarNombre !== undefined) {
      document.getElementById('en-boton').disabled = t.value.trim().toLowerCase() !== t.dataset.confirmarNombre.trim().toLowerCase();
    }
  });

  document.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.dataset.subir) return subirFotos(t);
    if (t.dataset.cantItem !== undefined) pintarItemsForm();
    if (t.dataset.modoNegocio !== undefined) {
      S.formNegocio.modo = t.value;
      render();
      return;
    }
    if (t.dataset.logoNegocio !== undefined) {
      const f = t.files?.[0];
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { aviso('El logotipo debe ser PNG, JPG o WebP.', 'error'); t.value = ''; return; }
      S.formNegocio.logo = f;
      const url = URL.createObjectURL(f);
      document.getElementById('n-logo-vista').innerHTML = `<img src="${url}" alt="Logo elegido">`;
      return;
    }
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
