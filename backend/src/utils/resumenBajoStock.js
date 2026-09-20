// Manda por correo las alertas de bajo stock, AGRUPADAS.
//
// Antes: utils/bajoStock.js mandaba un correo por producto y por destinatario
// en el momento. Un traspaso de 9 productos a 4 personas eran 36 correos, y en
// una sucursal con muchas ventas se volvía spam (y Gmail limita/penaliza el
// envío masivo de correos casi idénticos).
//
// Ahora bajoStock.js solo crea la notificación in-app (con la bandera
// `emailUrgente` y `emailEnviadoAt` = null, o sea "pendiente de correo") y este
// módulo, que corre cada minuto (ver iniciarResumenBajoStock), manda UN correo
// por persona:
//
//   - AGOTADOS (llegaron a 0): a los pocos minutos (RESUMEN_STOCK_AGOTADO_MIN,
//     por defecto 2) de la alerta. Esa espera es para juntar en un solo correo
//     los que se agotan a la vez (p. ej. un traspaso de varios productos).
//   - BAJOS (en o bajo su mínimo pero con piezas): un resumen diario a la hora
//     RESUMEN_STOCK_HORA (por defecto 20, hora de la tienda). Si el servidor
//     estaba dormido a esa hora (plan gratis de Render), sale en cuanto vuelve
//     a estar despierto: se manda todo lo pendiente creado ANTES del último
//     corte, en vez de esperar al siguiente día.
//
// Al armar cada correo se vuelve a consultar el stock ACTUAL: lo que ya se
// reabasteció desde que se creó la alerta se descarta (no tiene caso avisar
// tarde de algo que ya se resolvió), y las piezas que se muestran son las de
// ese momento, no las de cuando se creó la alerta.
//
// Todo es best-effort: si el correo no está configurado o falla, la alerta
// in-app ya existe y nada se rompe; lo pendiente se reintenta en la siguiente
// vuelta (con una pausa tras un error, para no martillar a Gmail cada minuto).
// Lo pendiente de hace más de 48 h ya no se manda (sería información vieja).

const prisma = require('../db');
const { emailApiConfigurada, enviarResumenBajoStockEmail } = require('../config/email');
const { nombreProductoVariante } = require('./bajoStock');
const { fechaNegocioDeInstante, horaNegocioAUtc } = require('./fechas');

function enteroEnRango(valor, min, max, defecto) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : defecto;
}

const HORA_RESUMEN = enteroEnRango(process.env.RESUMEN_STOCK_HORA, 0, 23, 20);
const VENTANA_AGOTADO_MS = enteroEnRango(process.env.RESUMEN_STOCK_AGOTADO_MIN, 1, 60, 2) * 60 * 1000;
const MAX_ANTIGUEDAD_MS = 48 * 60 * 60 * 1000;
const INTERVALO_MS = 60 * 1000;
const PAUSA_TRAS_ERROR_MS = 10 * 60 * 1000;
const MAX_PENDIENTES_POR_VUELTA = 500;

let corriendo = false;
let noReintentarAntesDe = 0;

// Instante (UTC) del último corte diario ya pasado: hoy a HORA_RESUMEN en la
// zona del negocio, o ayer a esa hora si hoy todavía no llega.
function ultimoCorteDiario(ahora = new Date(), hora = HORA_RESUMEN) {
  const hh = String(hora).padStart(2, '0');
  const hoy = fechaNegocioDeInstante(ahora);
  const corteHoy = horaNegocioAUtc(hoy, `${hh}:00:00.000`);
  if (corteHoy <= ahora) return corteHoy;
  const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return horaNegocioAUtc(ayer, `${hh}:00:00.000`);
}

// "BAJO_STOCK:<varianteId>:<sucursalId>" -> { varianteId, sucursalId } | null
function parsearTipo(tipo) {
  const [, v, s] = String(tipo).split(':');
  const varianteId = Number(v);
  const sucursalId = Number(s);
  return Number.isInteger(varianteId) && Number.isInteger(sucursalId) ? { varianteId, sucursalId } : null;
}

const clavePar = (varianteId, sucursalId) => `${varianteId}:${sucursalId}`;

async function marcarEnviadas(where, ahora) {
  await prisma.notificacion.updateMany({ where: { ...where, emailEnviadoAt: null }, data: { emailEnviadoAt: ahora } });
}

// Stock actual de cada (variante, sucursal), sumando todos los proveedores y
// tomando el mayor mínimo — el mismo cálculo que bajoStock.js#procesarUno.
async function cargarEstado(pares) {
  const existencias = await prisma.existencia.findMany({
    where: { OR: pares.map((p) => ({ varianteId: p.varianteId, sucursalId: p.sucursalId })) },
    select: { varianteId: true, sucursalId: true, stockActual: true, stockMinimo: true },
  });
  const estado = new Map();
  for (const e of existencias) {
    const k = clavePar(e.varianteId, e.sucursalId);
    const previo = estado.get(k) || { stock: 0, minimo: 0 };
    estado.set(k, { stock: previo.stock + e.stockActual, minimo: Math.max(previo.minimo, e.stockMinimo) });
  }
  return estado;
}

/**
 * Arma y manda los correos que toquen en este momento. Segura de llamar a
 * cualquier hora y varias veces: si no hay nada que mandar, no hace nada.
 * Nunca lanza.
 *
 * @returns {Promise<{correos: number, omitido?: string}>}
 */
async function enviarResumenesPendientes(ahora = new Date()) {
  if (corriendo) return { correos: 0, omitido: 'en-curso' };
  if (!emailApiConfigurada()) return { correos: 0, omitido: 'correo-no-configurado' };
  if (ahora.getTime() < noReintentarAntesDe) return { correos: 0, omitido: 'pausa-tras-error' };

  corriendo = true;
  try {
    return await procesar(ahora);
  } catch (err) {
    console.error('Error en el resumen de bajo stock:', err);
    noReintentarAntesDe = ahora.getTime() + PAUSA_TRAS_ERROR_MS;
    return { correos: 0, omitido: 'error' };
  } finally {
    corriendo = false;
  }
}

async function procesar(ahora) {
  const desde = new Date(ahora.getTime() - MAX_ANTIGUEDAD_MS);
  const corte = ultimoCorteDiario(ahora);
  const limiteAgotado = new Date(ahora.getTime() - VENTANA_AGOTADO_MS);

  const pendientes = await prisma.notificacion.findMany({
    where: {
      tipo: { startsWith: 'BAJO_STOCK:' },
      emailEnviadoAt: null,
      createdAt: { gte: desde },
      OR: [
        { emailUrgente: true, createdAt: { lte: limiteAgotado } },
        { emailUrgente: false, createdAt: { lte: corte } },
      ],
    },
    select: {
      id: true,
      usuarioId: true,
      tipo: true,
      emailUrgente: true,
      usuario: { select: { nombre: true, email: true, activo: true } },
    },
    orderBy: { id: 'asc' },
    take: MAX_PENDIENTES_POR_VUELTA,
  });
  if (pendientes.length === 0) return { correos: 0 };

  // Alertas con una clave que no se puede leer: no hay nada que armar.
  const legibles = [];
  const ilegibles = [];
  for (const f of pendientes) (parsearTipo(f.tipo) ? legibles : ilegibles).push(f);
  if (ilegibles.length > 0) await marcarEnviadas({ id: { in: ilegibles.map((f) => f.id) } }, ahora);
  if (legibles.length === 0) return { correos: 0 };

  const pares = [];
  const vistos = new Set();
  for (const f of legibles) {
    const par = parsearTipo(f.tipo);
    const k = clavePar(par.varianteId, par.sucursalId);
    if (!vistos.has(k)) {
      vistos.add(k);
      pares.push(par);
    }
  }

  const [estado, variantes, sucursales] = await Promise.all([
    cargarEstado(pares),
    prisma.productoVariante.findMany({
      where: { id: { in: [...new Set(pares.map((p) => p.varianteId))] } },
      include: { producto: { select: { nombre: true } }, talla: { select: { valor: true } } },
    }),
    prisma.sucursal.findMany({
      where: { id: { in: [...new Set(pares.map((p) => p.sucursalId))] } },
      select: { id: true, nombre: true },
    }),
  ]);
  const ctx = {
    ahora,
    estado,
    variantes: new Map(variantes.map((v) => [v.id, v])),
    sucursales: new Map(sucursales.map((s) => [s.id, s.nombre])),
  };

  let correos = 0;
  for (const modo of ['urgente', 'diario']) {
    const porUsuario = new Map();
    for (const f of legibles) {
      if (f.emailUrgente !== (modo === 'urgente')) continue;
      if (!porUsuario.has(f.usuarioId)) porUsuario.set(f.usuarioId, []);
      porUsuario.get(f.usuarioId).push(f);
    }
    for (const [usuarioId, filas] of porUsuario) {
      const resultado = await procesarUsuario(modo, usuarioId, filas, ctx);
      if (resultado === 'error') return { correos }; // pausa: se reintenta más tarde
      if (resultado === 'enviado') correos += 1;
    }
  }
  return { correos };
}

// Un correo (o ninguno) para una persona en un modo. Devuelve 'enviado',
// 'nada' (no había nada que valiera la pena mandar) o 'error'.
async function procesarUsuario(modo, usuarioId, filas, ctx) {
  const { ahora } = ctx;
  const usuario = filas[0].usuario;

  // Persona dada de baja o sin correo: no hay a dónde mandarlo. Se marca como
  // resuelto para que no se quede pendiente para siempre.
  if (!usuario.activo || !usuario.email) {
    await marcarEnviadas({ id: { in: filas.map((f) => f.id) } }, ahora);
    return 'nada';
  }

  const items = new Map(); // tipo -> renglón (una sola vez por producto/sucursal)
  const idsDescartar = []; // ya no están bajos: se resuelven sin correo
  const idsDegradar = []; // salieron de "agotado" pero siguen bajos: pasan al resumen diario

  for (const f of filas) {
    const par = parsearTipo(f.tipo);
    const est = ctx.estado.get(clavePar(par.varianteId, par.sucursalId));
    const variante = ctx.variantes.get(par.varianteId);
    const sucursal = ctx.sucursales.get(par.sucursalId);
    const sigueBajo = est && est.minimo > 0 && est.stock <= est.minimo;
    if (!sigueBajo || !variante || !sucursal) {
      idsDescartar.push(f.id);
      continue;
    }
    if (modo === 'urgente' && est.stock > 0) {
      idsDegradar.push(f.id);
      continue;
    }
    items.set(f.tipo, {
      sucursalId: par.sucursalId,
      sucursal,
      producto: nombreProductoVariante(variante),
      sku: variante.sku,
      stockActual: est.stock,
      stockMinimo: est.minimo,
    });
  }

  if (idsDegradar.length > 0) {
    await prisma.notificacion.updateMany({ where: { id: { in: idsDegradar } }, data: { emailUrgente: false } });
  }
  if (idsDescartar.length > 0) await marcarEnviadas({ id: { in: idsDescartar } }, ahora);
  if (items.size === 0) return 'nada';

  const porSucursal = new Map();
  for (const item of items.values()) {
    if (!porSucursal.has(item.sucursalId)) porSucursal.set(item.sucursalId, { nombre: item.sucursal, items: [] });
    porSucursal.get(item.sucursalId).items.push({
      producto: item.producto,
      sku: item.sku,
      stockActual: item.stockActual,
      stockMinimo: item.stockMinimo,
    });
  }

  const envio = await enviarResumenBajoStockEmail({
    email: usuario.email,
    nombre: usuario.nombre,
    modo,
    sucursales: [...porSucursal.values()],
  });
  if (!envio.enviado) {
    console.error(`No se pudo mandar el correo de bajo stock (${modo}) a ${usuario.email}: ${envio.error}`);
    noReintentarAntesDe = ahora.getTime() + PAUSA_TRAS_ERROR_MS;
    return 'error';
  }

  // Marca como enviadas las alertas incluidas y también cualquier otra
  // pendiente de esos mismos productos para esta persona (p. ej. el aviso de
  // "bajo" previo a que se agotara), para no repetirlos después en el resumen.
  await marcarEnviadas({ usuarioId, tipo: { in: [...items.keys()] } }, ahora);
  return 'enviado';
}

// Arranca el proceso periódico. Se llama una vez desde index.js. Los timers
// no mantienen vivo el proceso (unref) y una vuelta que falle no tumba nada.
function iniciarResumenBajoStock() {
  const vuelta = () =>
    enviarResumenesPendientes().catch((err) => console.error('Error en la vuelta del resumen de bajo stock:', err));
  // Primera vuelta poco después de arrancar: si el servidor estuvo dormido
  // pasada la hora del resumen, lo pendiente sale en cuanto despierta.
  setTimeout(vuelta, 30 * 1000).unref();
  setInterval(vuelta, INTERVALO_MS).unref();
}

module.exports = { iniciarResumenBajoStock, enviarResumenesPendientes, ultimoCorteDiario };
