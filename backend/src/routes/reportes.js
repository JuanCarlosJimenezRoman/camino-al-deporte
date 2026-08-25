const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { generarReporteVentasExcel } = require('../utils/reportesExcel');
const { inicioDiaNegocio, finDiaNegocio, hoyNegocioStr, fechaNegocioDeInstante } = require('../utils/fechas');

const router = express.Router();

// Mismos roles que pueden registrar ventas (ver routes/ventas.js) pueden ver
// reportes: ADMIN_PRINCIPAL/DESARROLLO ven todas las sucursales; VENTAS solo
// ve los datos de su propia sucursal asignada (igual que /ventas y
// /ventas/corte-dia). El resto de roles (INVENTARIO, CONSULTA) no maneja
// dinero/ventas y no tiene acceso a este módulo.
const ROLES_REPORTES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

// ---------------------------------------------------------------------------
// Helpers de fechas — "hoy" y los límites de cada día se calculan en
// horario de México (America/Mexico_City, ver utils/fechas.js), no en UTC.
// sumarDias/diasEntre solo hacen aritmética de calendario sobre strings
// "YYYY-MM-DD" (sumar/restar días, contar cuántos hay entre dos fechas) —
// eso sí es correcto hacerlo en UTC puro, porque no representa un instante
// real: "el día siguiente a 2026-08-16" es 2026-08-17 sin importar la zona
// horaria, mientras no se convierta a un instante concreto (eso lo hacen
// inicioDiaNegocio/finDiaNegocio más abajo, cuando sí importa la zona).
// ---------------------------------------------------------------------------

function sumarDias(fechaStr, dias) {
  const d = new Date(`${fechaStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desdeStr, hastaStr) {
  const d1 = new Date(`${desdeStr}T00:00:00.000Z`);
  const d2 = new Date(`${hastaStr}T00:00:00.000Z`);
  return Math.round((d2 - d1) / 86400000) + 1;
}

// Resuelve { desdeStr, hastaStr, desde, hasta } a partir de ?desde=&hasta= en
// la query. Por defecto: últimos 30 días (incluyendo hoy).
function resolverRango(req) {
  const hastaStr = req.query.hasta ? String(req.query.hasta) : hoyNegocioStr();
  const desdeStr = req.query.desde ? String(req.query.desde) : sumarDias(hastaStr, -29);

  const desde = inicioDiaNegocio(desdeStr);
  const hasta = finDiaNegocio(hastaStr);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || desde > hasta) {
    const err = new Error('FECHA_INVALIDA');
    err.status = 400;
    throw err;
  }
  return { desdeStr, hastaStr, desde, hasta };
}

// Rango inmediatamente anterior, con el mismo número de días, para calcular
// variaciones porcentuales (ej. "vs. periodo anterior").
function rangoAnterior(desdeStr, hastaStr) {
  const n = diasEntre(desdeStr, hastaStr);
  const anteriorHastaStr = sumarDias(desdeStr, -1);
  const anteriorDesdeStr = sumarDias(anteriorHastaStr, -(n - 1));
  return {
    desdeStr: anteriorDesdeStr,
    hastaStr: anteriorHastaStr,
    desde: inicioDiaNegocio(anteriorDesdeStr),
    hasta: finDiaNegocio(anteriorHastaStr),
  };
}

function variacionPct(actual, anterior) {
  if (!anterior) return actual > 0 ? null : 0;
  return ((actual - anterior) / anterior) * 100;
}

// Resuelve desde qué sucursal(es) se puede reportar, igual criterio que
// resolverSucursalId en ventas.js: ADMIN/DESARROLLO pueden ver cualquiera
// (o todas, sin filtro); VENTAS siempre queda forzado a la suya.
function resolverSucursalReporte(req) {
  if (esAdmin(req.usuario.rol)) {
    return req.query.sucursalId ? Number(req.query.sucursalId) : undefined;
  }
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    err.status = 400;
    throw err;
  }
  return req.usuario.sucursalId;
}

// Middleware compartido: deja resuelto req.sucursalReporte (number|undefined)
// o responde 400 si el usuario no admin no tiene sucursal asignada.
function conSucursalResuelta(req, res, next) {
  try {
    req.sucursalReporte = resolverSucursalReporte(req);
    next();
  } catch (err) {
    if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
      return res.status(400).json({
        error: 'Tu usuario no tiene una sucursal asignada. Pide a un administrador que te asigne una para ver reportes.',
      });
    }
    next(err);
  }
}

// Middleware compartido: deja resuelto req.rango (ver resolverRango) o
// responde 400 si las fechas son inválidas.
function conRangoResuelto(req, res, next) {
  try {
    req.rango = resolverRango(req);
    next();
  } catch (err) {
    if (err.message === 'FECHA_INVALIDA') {
      return res.status(400).json({ error: 'Rango de fechas inválido. Usa formato YYYY-MM-DD y desde <= hasta.' });
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Consultas compartidas
// ---------------------------------------------------------------------------

async function fetchVentasCompletadas(desde, hasta, sucursalId) {
  return prisma.venta.findMany({
    where: {
      estado: 'COMPLETADA',
      createdAt: { gte: desde, lte: hasta },
      ...(sucursalId ? { sucursalId } : {}),
    },
    select: {
      id: true,
      total: true,
      descuentoMonto: true,
      metodoPago: true,
      sucursalId: true,
      createdAt: true,
      sucursal: { select: { nombre: true } },
    },
  });
}

// Pedidos de la tienda en línea que ya cuentan como "vendidos": el pago se
// validó (PAGADO, o un paso posterior — ENVIADO/RECIBIDO). Antes de eso
// (PENDIENTE_PAGO/EN_VALIDACION) el dinero todavía no se confirmó, así que no
// es una venta real todavía; CANCELADO tampoco, mismo criterio que una Venta
// CANCELADA. La fecha que cuenta es `validadoAt` (cuándo un empleado
// confirmó que el pago llegó), no `createdAt` (cuándo el cliente armó el
// pedido, que puede ser días antes de que se confirme el pago) — así el
// corte de un día refleja cuándo entró el dinero de verdad, igual criterio
// que una Venta de mostrador (que se registra en el momento exacto en que se
// cobra).
const ESTADOS_PEDIDO_PAGADO = ['PAGADO', 'ENVIADO', 'RECIBIDO'];

// A diferencia de una Venta (siempre de una sola sucursal), un Pedido puede
// tener artículos que salieron de sucursales distintas — cada renglón elige
// su propia sucursal de stock al crearse (ver routes/tienda/pedidos.js). Por
// eso esta consulta regresa también los items (con su sucursalStockId), no
// solo el total del pedido: reportes/desglose y reportes/por-sucursal los
// necesitan a nivel de renglón, mientras que resumen/serie/por-metodo-pago
// usan el total ya resuelto en `total`. Se resuelve todo en una sola
// consulta (en vez de separar "solo totales" / "solo items" como con
// Venta/VentaItem) porque, a diferencia de Venta, aquí el total "correcto"
// para un reporte acotado a una sucursal DEPENDE de los items (ver abajo) —
// separarlo forzaría a duplicar esa misma lógica en dos lugares.
async function fetchPedidosPagados(desde, hasta, sucursalId) {
  const pedidos = await prisma.pedido.findMany({
    where: {
      estado: { in: ESTADOS_PEDIDO_PAGADO },
      validadoAt: { gte: desde, lte: hasta },
    },
    select: {
      id: true,
      total: true,
      cuponDescuento: true,
      descuentoManualMonto: true,
      validadoAt: true,
      // origen/metodoPago: para poder distinguir un pedido de la tienda en
      // línea (siempre SPEI) de uno manual por WhatsApp/Instagram/etc., que
      // puede haberse cobrado en efectivo o tarjeta — ver agruparPorMetodoPago.
      origen: true,
      metodoPago: true,
      items: {
        select: {
          cantidad: true,
          subtotal: true,
          sucursalStockId: true,
          sucursalStock: { select: { nombre: true } },
          proveedor: { select: { id: true, nombre: true } },
          variante: {
            select: {
              color: true,
              talla: { select: { valor: true, tipo: true } },
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  marca: { select: { id: true, nombre: true } },
                  categoria: { select: { id: true, nombre: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Cuando el reporte está acotado a una sucursal (rol VENTAS, o un admin
  // filtrando una en particular), NO se cuenta el total completo del pedido
  // si tiene artículos de otras sucursales — eso sobre-contaría dinero que
  // en realidad salió de otra sucursal. En su lugar se suma solo el
  // subtotal de los artículos que sí salieron de la sucursal filtrada (el
  // envío y los descuentos globales del pedido no se reparten por sucursal,
  // así que quedan fuera de esa suma parcial — misma limitación que ya tenía
  // calcularDesglose con Venta: VentaItem.subtotal tampoco resta el
  // descuento de la venta). Sin filtro (todas las sucursales), si se usa
  // pedido.total completo, que es la cifra exacta que pagó el cliente.
  return pedidos
    .map((p) => {
      const itemsSucursal = sucursalId ? p.items.filter((it) => it.sucursalStockId === sucursalId) : p.items;
      if (sucursalId && itemsSucursal.length === 0) return null;
      const monto = sucursalId
        ? itemsSucursal.reduce((acc, it) => acc + Number(it.subtotal), 0)
        : Number(p.total);
      return {
        id: p.id,
        total: monto,
        descuentoMonto: sucursalId ? 0 : Number(p.cuponDescuento || 0) + Number(p.descuentoManualMonto || 0),
        createdAt: p.validadoAt,
        origen: p.origen,
        metodoPago: p.metodoPago,
        items: itemsSucursal,
      };
    })
    .filter(Boolean);
}

async function fetchVentaItemsCompletados(desde, hasta, sucursalId) {
  return prisma.ventaItem.findMany({
    where: {
      venta: {
        estado: 'COMPLETADA',
        createdAt: { gte: desde, lte: hasta },
        ...(sucursalId ? { sucursalId } : {}),
      },
    },
    select: {
      cantidad: true,
      subtotal: true,
      proveedor: { select: { id: true, nombre: true } },
      // Solo presente en renglones "producto no registrado" (ver
      // migración 20260901100000_venta_items_libres y calcularDesglose).
      descripcionLibre: true,
      variante: {
        select: {
          color: true,
          talla: { select: { valor: true, tipo: true } },
          producto: {
            select: {
              id: true,
              nombre: true,
              marca: { select: { id: true, nombre: true } },
              categoria: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  });
}

function calcularResumen(ventas) {
  const totalVentas = ventas.length;
  const totalMonto = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const totalDescuentos = ventas.reduce((acc, v) => acc + Number(v.descuentoMonto || 0), 0);
  return {
    totalVentas,
    totalMonto,
    totalDescuentos,
    ticketPromedio: totalVentas > 0 ? totalMonto / totalVentas : 0,
  };
}

// Serie diaria completa entre desdeStr y hastaStr (rellena con 0 los días
// sin ventas, para que el gráfico no tenga huecos).
function agruparPorDia(ventas, desdeStr, hastaStr) {
  const porFecha = new Map();
  for (const v of ventas) {
    const fecha = fechaNegocioDeInstante(v.createdAt);
    const actual = porFecha.get(fecha) || { ventas: 0, monto: 0 };
    actual.ventas += 1;
    actual.monto += Number(v.total);
    porFecha.set(fecha, actual);
  }

  const n = diasEntre(desdeStr, hastaStr);
  const serie = [];
  for (let i = 0; i < n; i++) {
    const fecha = sumarDias(desdeStr, i);
    const punto = porFecha.get(fecha) || { ventas: 0, monto: 0 };
    serie.push({ fecha, ventas: punto.ventas, monto: Math.round(punto.monto * 100) / 100 });
  }
  return serie;
}

// Los pedidos de la tienda en línea (origen TIENDA_ONLINE) siempre se pagan
// por transferencia SPEI a la cuenta del negocio — se cuentan aparte, como
// "Pedidos en línea", en vez de sumarlos dentro de TRANSFERENCIA: son
// operativamente un canal distinto (validación de comprobante por un
// empleado, no un cajero cobrando en el momento) y mezclarlos ahí ocultaría
// cuánto de la venta es en línea, que es justo lo que este reporte necesita
// mostrar.
//
// Un pedido MANUAL (WhatsApp/Instagram/etc., ver Pedido.origen) es distinto:
// el vendedor sí elige un método de pago real (efectivo, tarjeta o
// transferencia) al capturarlo, igual que en una Venta de mostrador — así
// que aquí se suma en su bucket real (metodoPago), junto con las ventas, en
// vez de en "Pedidos en línea" (que quedaría engañoso si dijera que todo
// fue SPEI cuando en realidad fue efectivo en mano).
function agruparPorMetodoPago(ventas, pedidos = []) {
  const base = {
    EFECTIVO: { ventas: 0, monto: 0 },
    TARJETA: { ventas: 0, monto: 0 },
    TRANSFERENCIA: { ventas: 0, monto: 0 },
    PEDIDO_ONLINE: { ventas: 0, monto: 0 },
  };
  for (const v of ventas) {
    base[v.metodoPago].ventas += 1;
    base[v.metodoPago].monto += Number(v.total);
  }
  for (const p of pedidos) {
    const bucket = p.origen === 'TIENDA_ONLINE' ? 'PEDIDO_ONLINE' : p.metodoPago || 'TRANSFERENCIA';
    base[bucket].ventas += 1;
    base[bucket].monto += Number(p.total);
  }
  const etiquetas = {
    EFECTIVO: 'Efectivo',
    TARJETA: 'Tarjeta',
    TRANSFERENCIA: 'Transferencia',
    PEDIDO_ONLINE: 'Pedidos en línea',
  };
  return Object.entries(base).map(([metodo, r]) => ({
    metodo,
    etiqueta: etiquetas[metodo],
    ventas: r.ventas,
    monto: Math.round(r.monto * 100) / 100,
  }));
}

// Una Venta pertenece siempre a una sola sucursal, así que su aportación se
// suma a nivel de venta completa (v.total). Un Pedido puede tener artículos
// de sucursales distintas (ver fetchPedidosPagados arriba), así que su
// aportación se suma a nivel de renglón (item.subtotal + sucursalStockId) —
// por lo mismo, el total de esta tabla puede no coincidir exactamente con el
// "Total vendido" del resumen cuando hay pedidos en línea en el periodo
// (envío y descuentos del pedido no se reparten por sucursal). "ventas" por
// pedido cuenta PEDIDOS distintos que tocaron esa sucursal, no un renglón
// por artículo, para no inflar el conteo de un pedido con varios artículos
// de la misma sucursal.
function agruparPorSucursal(ventas, pedidos = []) {
  const porSucursal = new Map();
  for (const v of ventas) {
    const clave = v.sucursalId;
    const actual = porSucursal.get(clave) || { sucursalId: clave, nombre: v.sucursal?.nombre || `Sucursal ${clave}`, ventas: 0, monto: 0 };
    actual.ventas += 1;
    actual.monto += Number(v.total);
    porSucursal.set(clave, actual);
  }

  const pedidosPorSucursal = new Map(); // sucursalId -> Set(pedidoId)
  for (const p of pedidos) {
    for (const item of p.items) {
      const clave = item.sucursalStockId;
      const actual = porSucursal.get(clave) || {
        sucursalId: clave,
        nombre: item.sucursalStock?.nombre || `Sucursal ${clave}`,
        ventas: 0,
        monto: 0,
      };
      actual.monto += Number(item.subtotal);
      porSucursal.set(clave, actual);

      if (!pedidosPorSucursal.has(clave)) pedidosPorSucursal.set(clave, new Set());
      pedidosPorSucursal.get(clave).add(p.id);
    }
  }
  for (const [clave, idsPedidos] of pedidosPorSucursal.entries()) {
    porSucursal.get(clave).ventas += idsPedidos.size;
  }

  return [...porSucursal.values()]
    .map((r) => ({ ...r, monto: Math.round(r.monto * 100) / 100 }))
    .sort((a, b) => b.monto - a.monto);
}

// A partir de renglones de venta — VentaItem (mostrador) y/o PedidoItem
// (tienda en línea, ver fetchPedidosPagados) mezclados en una sola lista,
// ambos con la misma forma (cantidad, subtotal, proveedor, variante) — arma
// varios desgloses a la vez (producto, marca, categoría, talla, proveedor)
// sin repetir la consulta.
function calcularDesglose(items, limiteProductos) {
  const porProducto = new Map();
  const porMarca = new Map();
  const porCategoria = new Map();
  const porTalla = new Map();
  const porProveedor = new Map();
  // Renglones "producto no registrado" (ver migración
  // 20260901100000_venta_items_libres): no tienen producto/marca/categoría/
  // talla del catálogo, así que se desglosan aparte por su descripción.
  const porProductoLibre = new Map();

  for (const item of items) {
    const cantidad = item.cantidad;
    const monto = Number(item.subtotal);
    const producto = item.variante?.producto;
    const marca = producto?.marca;
    const categoria = producto?.categoria;
    const talla = item.variante?.talla;
    const proveedor = item.proveedor;

    if (producto) {
      const actual = porProducto.get(producto.id) || { id: producto.id, nombre: producto.nombre, cantidad: 0, monto: 0 };
      actual.cantidad += cantidad;
      actual.monto += monto;
      porProducto.set(producto.id, actual);
    } else if (item.descripcionLibre) {
      const actual = porProductoLibre.get(item.descripcionLibre) || {
        nombre: item.descripcionLibre,
        cantidad: 0,
        monto: 0,
      };
      actual.cantidad += cantidad;
      actual.monto += monto;
      porProductoLibre.set(item.descripcionLibre, actual);
    }
    if (marca) {
      const actual = porMarca.get(marca.id) || { id: marca.id, nombre: marca.nombre, cantidad: 0, monto: 0 };
      actual.cantidad += cantidad;
      actual.monto += monto;
      porMarca.set(marca.id, actual);
    }
    if (categoria) {
      const actual = porCategoria.get(categoria.id) || { id: categoria.id, nombre: categoria.nombre, cantidad: 0, monto: 0 };
      actual.cantidad += cantidad;
      actual.monto += monto;
      porCategoria.set(categoria.id, actual);
    }
    if (talla) {
      const clave = `${talla.tipo}-${talla.valor}`;
      const actual = porTalla.get(clave) || { valor: talla.valor, tipo: talla.tipo, cantidad: 0, monto: 0 };
      actual.cantidad += cantidad;
      actual.monto += monto;
      porTalla.set(clave, actual);
    }
    const claveProveedor = proveedor?.id ?? 'sin-proveedor';
    const actualProveedor = porProveedor.get(claveProveedor) || {
      id: proveedor?.id ?? null,
      nombre: proveedor?.nombre || 'Sin proveedor asignado',
      cantidad: 0,
      monto: 0,
    };
    actualProveedor.cantidad += cantidad;
    actualProveedor.monto += monto;
    porProveedor.set(claveProveedor, actualProveedor);
  }

  const redondear = (r) => ({ ...r, monto: Math.round(r.monto * 100) / 100 });
  const ordenar = (mapa) => [...mapa.values()].map(redondear).sort((a, b) => b.monto - a.monto);

  return {
    topProductos: ordenar(porProducto).slice(0, limiteProductos),
    porMarca: ordenar(porMarca),
    porCategoria: ordenar(porCategoria),
    porTalla: ordenar(porTalla),
    porProveedor: ordenar(porProveedor),
    productosNoRegistrados: ordenar(porProductoLibre),
  };
}

// ---------------------------------------------------------------------------
// Estimación de ventas futuras: tendencia lineal (regresión simple) sobre el
// histórico + un índice de estacionalidad por día de la semana (para negocios
// de tienda física, sábado/domingo suelen vender distinto que entre semana).
//
// Es una estimación simple e intencionalmente explicable — no sustituye un
// modelo de series de tiempo real, pero da una proyección razonable para
// planear compras/metas sin depender de librerías externas de ML. Ver
// docs/ARQUITECTURA.md para más contexto si se quiere sofisticar a futuro.
// ---------------------------------------------------------------------------

function calcularEstimacion(serieHistorica, horizonteDias) {
  const n = serieHistorica.length;
  const montos = serieHistorica.map((p) => p.monto);
  const promedioGeneral = montos.reduce((a, b) => a + b, 0) / (n || 1);

  // Índice por día de la semana: promedio de ese día / promedio general.
  const sumaPorDia = [0, 0, 0, 0, 0, 0, 0];
  const cuentaPorDia = [0, 0, 0, 0, 0, 0, 0];
  serieHistorica.forEach((p) => {
    const dow = new Date(`${p.fecha}T00:00:00.000Z`).getUTCDay();
    sumaPorDia[dow] += p.monto;
    cuentaPorDia[dow] += 1;
  });
  const indicePorDia = sumaPorDia.map((s, i) => {
    if (cuentaPorDia[i] === 0 || promedioGeneral === 0) return 1;
    return s / cuentaPorDia[i] / promedioGeneral;
  });

  // Regresión lineal simple (mínimos cuadrados) sobre t = 0..n-1.
  const meanT = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    num += (t - meanT) * (montos[t] - promedioGeneral);
    den += (t - meanT) * (t - meanT);
  }
  const pendiente = den > 0 ? num / den : 0;
  const intercepto = promedioGeneral - pendiente * meanT;

  const ultimaFecha = serieHistorica[n - 1]?.fecha || hoyNegocioStr();

  const proyeccion = [];
  for (let i = 1; i <= horizonteDias; i++) {
    const t = n - 1 + i;
    const fecha = sumarDias(ultimaFecha, i);
    const dow = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
    const base = Math.max(0, intercepto + pendiente * t);
    const monto = Math.round(base * indicePorDia[dow] * 100) / 100;
    proyeccion.push({ fecha, monto });
  }

  const totalProyectado = Math.round(proyeccion.reduce((a, p) => a + p.monto, 0) * 100) / 100;
  const cambioSemanalPct = promedioGeneral > 0 ? (pendiente * 7 * 100) / promedioGeneral : 0;
  let direccion = 'estable';
  if (cambioSemanalPct > 3) direccion = 'creciendo';
  else if (cambioSemanalPct < -3) direccion = 'bajando';

  // Con menos de dos semanas de histórico la regresión y el índice por día
  // son poco confiables (fácilmente un solo día atípico domina el cálculo).
  const suficienteDatos = n >= 14 && montos.some((m) => m > 0);

  return {
    suficienteDatos,
    promedioDiarioHistorico: Math.round(promedioGeneral * 100) / 100,
    tendencia: { direccion, cambioSemanalPct: Math.round(cambioSemanalPct * 10) / 10 },
    totalProyectado,
    proyeccion,
    nota:
      'Estimación basada en la tendencia histórica y el patrón de ventas por día de la semana de este periodo. ' +
      'No considera promociones, temporada alta/baja ni factores externos — úsala como referencia para planear, no como cifra garantizada.',
  };
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

// GET /reportes/ventas/resumen?desde=&hasta=&sucursalId=
// KPIs del periodo + comparación contra el periodo inmediatamente anterior
// (mismo número de días).
router.get(
  '/ventas/resumen',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desdeStr, hastaStr, desde, hasta } = req.rango;
    const anterior = rangoAnterior(desdeStr, hastaStr);

    const [ventasActual, pedidosActual, ventasAnterior, pedidosAnterior] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
      fetchVentasCompletadas(anterior.desde, anterior.hasta, req.sucursalReporte),
      fetchPedidosPagados(anterior.desde, anterior.hasta, req.sucursalReporte),
    ]);

    // Ventas de mostrador + pedidos de la tienda en línea ya pagados, juntos
    // (ver fetchPedidosPagados arriba) — "total vendido" ya incluye ambos
    // canales.
    const actual = calcularResumen([...ventasActual, ...pedidosActual]);
    const previo = calcularResumen([...ventasAnterior, ...pedidosAnterior]);

    res.json({
      periodo: { desde: desdeStr, hasta: hastaStr },
      periodoAnterior: { desde: anterior.desdeStr, hasta: anterior.hastaStr },
      actual,
      anterior: previo,
      variacion: {
        monto: variacionPct(actual.totalMonto, previo.totalMonto),
        ventas: variacionPct(actual.totalVentas, previo.totalVentas),
        ticketPromedio: variacionPct(actual.ticketPromedio, previo.ticketPromedio),
      },
    });
  })
);

// GET /reportes/ventas/serie?desde=&hasta=&sucursalId=
// Serie diaria (monto y # de ventas) para graficar la tendencia.
router.get(
  '/ventas/serie',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desdeStr, hastaStr, desde, hasta } = req.rango;
    const [ventas, pedidos] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
    ]);
    res.json({
      periodo: { desde: desdeStr, hasta: hastaStr },
      serie: agruparPorDia([...ventas, ...pedidos], desdeStr, hastaStr),
    });
  })
);

// GET /reportes/ventas/por-metodo-pago?desde=&hasta=&sucursalId=
router.get(
  '/ventas/por-metodo-pago',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.rango;
    const [ventas, pedidos] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
    ]);
    res.json({ porMetodoPago: agruparPorMetodoPago(ventas, pedidos) });
  })
);

// GET /reportes/ventas/por-sucursal?desde=&hasta=
// Solo tiene sentido para ADMIN/DESARROLLO (comparar entre sucursales); si
// un usuario VENTAS lo consulta, sucursalReporte ya viene forzado a la suya
// y regresa un solo renglón.
router.get(
  '/ventas/por-sucursal',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.rango;
    const [ventas, pedidos] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
    ]);
    res.json({ porSucursal: agruparPorSucursal(ventas, pedidos) });
  })
);

// GET /reportes/ventas/desglose?desde=&hasta=&sucursalId=&limite=
// Top productos + desglose por marca/categoría/talla/proveedor, para
// clasificar qué se está vendiendo (no solo cuánto).
router.get(
  '/ventas/desglose',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.rango;
    const limite = Math.min(Number(req.query.limite) || 10, 50);
    const [items, pedidos] = await Promise.all([
      fetchVentaItemsCompletados(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
    ]);
    const itemsPedidos = pedidos.flatMap((p) => p.items);
    res.json(calcularDesglose([...items, ...itemsPedidos], limite));
  })
);

// GET /reportes/ventas/estimacion?historialDias=90&horizonte=30&sucursalId=
// Proyección de ventas para los próximos días, con base en el histórico
// reciente (ver calcularEstimacion arriba).
router.get(
  '/ventas/estimacion',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  asyncHandler(async (req, res) => {
    const historialDias = Math.min(Math.max(Number(req.query.historialDias) || 90, 14), 365);
    const horizonte = Math.min(Math.max(Number(req.query.horizonte) || 30, 1), 90);

    const hastaStr = hoyNegocioStr();
    const desdeStr = sumarDias(hastaStr, -(historialDias - 1));
    const desde = inicioDiaNegocio(desdeStr);
    const hasta = finDiaNegocio(hastaStr);

    const [ventas, pedidos] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
    ]);
    const serieHistorica = agruparPorDia([...ventas, ...pedidos], desdeStr, hastaStr);
    const estimacion = calcularEstimacion(serieHistorica, horizonte);

    res.json({ historico: serieHistorica, ...estimacion });
  })
);

// GET /reportes/ventas/exportar?desde=&hasta=&sucursalId=
// Descarga un .xlsx con resumen, serie diaria, desglose y proyección del
// periodo filtrado (reusa las mismas consultas que las rutas de arriba).
router.get(
  '/ventas/exportar',
  requireAuth,
  requireRole(...ROLES_REPORTES),
  conSucursalResuelta,
  conRangoResuelto,
  asyncHandler(async (req, res) => {
    const { desdeStr, hastaStr, desde, hasta } = req.rango;
    const anterior = rangoAnterior(desdeStr, hastaStr);
    const limite = Math.min(Number(req.query.limite) || 10, 50);

    const [ventasActual, pedidosActual, ventasAnterior, pedidosAnterior, items] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchPedidosPagados(desde, hasta, req.sucursalReporte),
      fetchVentasCompletadas(anterior.desde, anterior.hasta, req.sucursalReporte),
      fetchPedidosPagados(anterior.desde, anterior.hasta, req.sucursalReporte),
      fetchVentaItemsCompletados(desde, hasta, req.sucursalReporte),
    ]);

    const actual = calcularResumen([...ventasActual, ...pedidosActual]);
    const previo = calcularResumen([...ventasAnterior, ...pedidosAnterior]);
    const resumen = {
      actual,
      anterior: previo,
      variacion: {
        monto: variacionPct(actual.totalMonto, previo.totalMonto),
        ventas: variacionPct(actual.totalVentas, previo.totalVentas),
      },
    };

    const serie = agruparPorDia([...ventasActual, ...pedidosActual], desdeStr, hastaStr);
    const porMetodoPago = agruparPorMetodoPago(ventasActual, pedidosActual);
    const porSucursal = agruparPorSucursal(ventasActual, pedidosActual);
    const desglose = calcularDesglose([...items, ...pedidosActual.flatMap((p) => p.items)], limite);

    // La estimación en el Excel usa el mismo histórico del periodo filtrado
    // (no los 90 días por defecto de /estimacion) para que el archivo
    // corresponda exactamente al rango que el usuario eligió.
    const estimacion = calcularEstimacion(serie, 30);

    const buffer = generarReporteVentasExcel({
      periodo: { desde: desdeStr, hasta: hastaStr },
      resumen,
      serie,
      porMetodoPago,
      porSucursal,
      desglose,
      estimacion,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-ventas-${desdeStr}-a-${hastaStr}.xlsx"`);
    res.send(buffer);
  })
);

module.exports = router;
