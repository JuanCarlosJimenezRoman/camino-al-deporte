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

function agruparPorMetodoPago(ventas) {
  const base = { EFECTIVO: { ventas: 0, monto: 0 }, TARJETA: { ventas: 0, monto: 0 }, TRANSFERENCIA: { ventas: 0, monto: 0 } };
  for (const v of ventas) {
    base[v.metodoPago].ventas += 1;
    base[v.metodoPago].monto += Number(v.total);
  }
  const etiquetas = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };
  return Object.entries(base).map(([metodo, r]) => ({
    metodo,
    etiqueta: etiquetas[metodo],
    ventas: r.ventas,
    monto: Math.round(r.monto * 100) / 100,
  }));
}

function agruparPorSucursal(ventas) {
  const porSucursal = new Map();
  for (const v of ventas) {
    const clave = v.sucursalId;
    const actual = porSucursal.get(clave) || { sucursalId: clave, nombre: v.sucursal?.nombre || `Sucursal ${clave}`, ventas: 0, monto: 0 };
    actual.ventas += 1;
    actual.monto += Number(v.total);
    porSucursal.set(clave, actual);
  }
  return [...porSucursal.values()]
    .map((r) => ({ ...r, monto: Math.round(r.monto * 100) / 100 }))
    .sort((a, b) => b.monto - a.monto);
}

// A partir de los renglones de venta (VentaItem), arma varios desgloses a la
// vez (producto, marca, categoría, talla, proveedor) sin repetir la consulta.
function calcularDesglose(items, limiteProductos) {
  const porProducto = new Map();
  const porMarca = new Map();
  const porCategoria = new Map();
  const porTalla = new Map();
  const porProveedor = new Map();

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

    const [ventasActual, ventasAnterior] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchVentasCompletadas(anterior.desde, anterior.hasta, req.sucursalReporte),
    ]);

    const actual = calcularResumen(ventasActual);
    const previo = calcularResumen(ventasAnterior);

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
    const ventas = await fetchVentasCompletadas(desde, hasta, req.sucursalReporte);
    res.json({ periodo: { desde: desdeStr, hasta: hastaStr }, serie: agruparPorDia(ventas, desdeStr, hastaStr) });
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
    const ventas = await fetchVentasCompletadas(desde, hasta, req.sucursalReporte);
    res.json({ porMetodoPago: agruparPorMetodoPago(ventas) });
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
    const ventas = await fetchVentasCompletadas(desde, hasta, req.sucursalReporte);
    res.json({ porSucursal: agruparPorSucursal(ventas) });
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
    const items = await fetchVentaItemsCompletados(desde, hasta, req.sucursalReporte);
    res.json(calcularDesglose(items, limite));
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

    const ventas = await fetchVentasCompletadas(desde, hasta, req.sucursalReporte);
    const serieHistorica = agruparPorDia(ventas, desdeStr, hastaStr);
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

    const [ventasActual, ventasAnterior, items] = await Promise.all([
      fetchVentasCompletadas(desde, hasta, req.sucursalReporte),
      fetchVentasCompletadas(anterior.desde, anterior.hasta, req.sucursalReporte),
      fetchVentaItemsCompletados(desde, hasta, req.sucursalReporte),
    ]);

    const actual = calcularResumen(ventasActual);
    const previo = calcularResumen(ventasAnterior);
    const resumen = {
      actual,
      anterior: previo,
      variacion: {
        monto: variacionPct(actual.totalMonto, previo.totalMonto),
        ventas: variacionPct(actual.totalVentas, previo.totalVentas),
      },
    };

    const serie = agruparPorDia(ventasActual, desdeStr, hastaStr);
    const porMetodoPago = agruparPorMetodoPago(ventasActual);
    const porSucursal = agruparPorSucursal(ventasActual);
    const desglose = calcularDesglose(items, limite);

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
