const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { inicioDiaNegocio, finDiaNegocio } = require('../utils/fechas');

const router = express.Router();

// Gastos son un tema de operación diaria de sucursal (igual que ventas y el
// corte del día, ver GET /ventas/corte-dia): los registra quien vende o
// administra, no inventario/catálogo.
const ROLES_GASTOS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

// Mismo criterio que resolverSucursalId en routes/ventas.js: ADMIN/DESARROLLO
// pueden registrar/consultar gastos de cualquier sucursal (la que manden),
// VENTAS siempre queda forzado a la suya para que no pueda registrar (ni
// ver) gastos "desde" otra sucursal manipulando la petición.
function resolverSucursalId(req, sucursalIdSolicitada) {
  if (esAdmin(req.usuario.rol)) return sucursalIdSolicitada;
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    err.status = 400;
    throw err;
  }
  return req.usuario.sucursalId;
}

// Reparte montoTotal entre los proveedores de "ids" en partes iguales, en
// centavos exactos: el residuo de la división (cuando montoTotal no es
// divisible exacto entre la cantidad de proveedores) se le agrega al
// último renglón, para que la suma de las partes SIEMPRE cuadre con el
// total exacto del gasto (nunca se "pierden" ni se "inventan" centavos por
// redondeo de punto flotante).
function repartirEntreProveedores(montoTotal, ids) {
  const totalCentavos = Math.round(montoTotal * 100);
  const parteCentavos = Math.floor(totalCentavos / ids.length);
  const residuo = totalCentavos - parteCentavos * ids.length;
  return ids.map((proveedorId, i) => ({
    proveedorId,
    monto: (parteCentavos + (i === ids.length - 1 ? residuo : 0)) / 100,
  }));
}

const GASTO_INCLUDE = {
  sucursal: { select: { id: true, nombre: true } },
  registradoPor: { select: { nombre: true } },
  proveedores: {
    include: { proveedor: { select: { id: true, nombre: true } } },
    orderBy: { id: 'asc' },
  },
};

// GET /gastos - listado con filtros opcionales: proveedorId (gastos donde
// participa ese proveedor, sea nivel PROVEEDOR o su parte de uno SUCURSAL),
// fechaInicio/fechaFin (YYYY-MM-DD, límites de día en horario de México,
// igual criterio que el corte del día). VENTAS solo ve su propia sucursal;
// ADMIN/DESARROLLO pueden ver una sucursal específica o todas.
router.get('/', requireAuth, requireRole(...ROLES_GASTOS), asyncHandler(async (req, res) => {
  let sucursalId;
  if (esAdmin(req.usuario.rol)) {
    sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : undefined;
  } else {
    if (!req.usuario.sucursalId) {
      return res.status(400).json({ error: 'Tu usuario no tiene una sucursal asignada.' });
    }
    sucursalId = req.usuario.sucursalId;
  }

  const { proveedorId, fechaInicio, fechaFin } = req.query;

  const where = {
    ...(sucursalId ? { sucursalId } : {}),
    ...(proveedorId ? { proveedores: { some: { proveedorId: Number(proveedorId) } } } : {}),
  };
  if (fechaInicio || fechaFin) {
    where.createdAt = {};
    if (fechaInicio) where.createdAt.gte = inicioDiaNegocio(String(fechaInicio));
    if (fechaFin) where.createdAt.lte = finDiaNegocio(String(fechaFin));
  }

  const gastos = await prisma.gasto.findMany({
    where,
    include: GASTO_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const totalGeneral = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

  res.json({ gastos, totalGeneral });
}));

const gastoSchema = z.object({
  // Solo la usa ADMIN/DESARROLLO (ver resolverSucursalId); VENTAS siempre
  // se fuerza a la suya aunque mande otra cosa.
  sucursalId: z.number().int().positive().optional(),
  motivo: z.string().min(1, 'El motivo es obligatorio.'),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
  notas: z.string().optional(),
  nivel: z.enum(['PROVEEDOR', 'SUCURSAL']),
  // nivel PROVEEDOR:
  proveedorId: z.number().int().positive().optional(),
  monto: z.number().positive().optional(),
  // nivel SUCURSAL:
  proveedorIds: z.array(z.number().int().positive()).optional(),
  montoTotal: z.number().positive().optional(),
});

// POST /gastos - registrar un gasto.
//  - nivel "PROVEEDOR": requiere proveedorId + monto, se crea un único
//    renglón en GastoProveedor con el monto completo.
//  - nivel "SUCURSAL": requiere proveedorIds (2 o más) + montoTotal, se
//    reparte en partes iguales entre esos proveedores (ver
//    repartirEntreProveedores). Si el gasto es de un solo proveedor, se usa
//    el nivel "PROVEEDOR" en vez de mandar un solo id aquí.
router.post('/', requireAuth, requireRole(...ROLES_GASTOS), asyncHandler(async (req, res) => {
  const parsed = gastoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const datos = parsed.data;

  let sucursalId;
  try {
    sucursalId = resolverSucursalId(req, datos.sucursalId);
  } catch (err) {
    if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
      return res.status(400).json({ error: 'Tu usuario no tiene una sucursal asignada.' });
    }
    throw err;
  }
  if (!sucursalId) {
    return res.status(400).json({ error: 'Falta la sucursal del gasto.' });
  }

  let montoTotal;
  let repartos;

  if (datos.nivel === 'PROVEEDOR') {
    if (!datos.proveedorId) {
      return res.status(400).json({ error: 'Falta el proveedor del gasto.' });
    }
    if (!datos.monto) {
      return res.status(400).json({ error: 'Falta el monto del gasto.' });
    }
    montoTotal = datos.monto;
    repartos = [{ proveedorId: datos.proveedorId, monto: montoTotal }];
  } else {
    const ids = [...new Set(datos.proveedorIds || [])];
    if (ids.length < 2) {
      return res.status(400).json({
        error: 'Selecciona al menos dos proveedores para dividir un gasto de sucursal (si es de un solo proveedor, usa el nivel "Proveedor").',
      });
    }
    if (!datos.montoTotal) {
      return res.status(400).json({ error: 'Falta el monto total del gasto.' });
    }
    montoTotal = datos.montoTotal;
    repartos = repartirEntreProveedores(montoTotal, ids);
  }

  const proveedoresExistentes = await prisma.proveedor.findMany({
    where: { id: { in: repartos.map((r) => r.proveedorId) } },
    select: { id: true },
  });
  if (proveedoresExistentes.length !== repartos.length) {
    return res.status(400).json({ error: 'Uno o más proveedores seleccionados no existen.' });
  }

  const gasto = await prisma.gasto.create({
    data: {
      sucursalId,
      nivel: datos.nivel,
      motivo: datos.motivo,
      monto: montoTotal,
      metodoPago: datos.metodoPago,
      notas: datos.notas || undefined,
      registradoPorId: req.usuario.id,
      proveedores: { create: repartos },
    },
    include: GASTO_INCLUDE,
  });

  res.status(201).json(gasto);
}));

// DELETE /gastos/:id - solo administración puede eliminar un gasto mal
// capturado: a diferencia de crearlo (VENTAS lo hace a diario), borrarlo
// afecta directamente la conciliación de caja de un corte ya cerrado.
router.delete('/:id', requireAuth, requireRole(...ROLES_ADMIN), asyncHandler(async (req, res) => {
  const gasto = await prisma.gasto.findUnique({ where: { id: Number(req.params.id) } });
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado.' });
  await prisma.gasto.delete({ where: { id: gasto.id } });
  res.status(204).end();
}));

module.exports = router;
