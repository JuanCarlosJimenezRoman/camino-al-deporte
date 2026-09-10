const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién puede dar de alta/editar clientes y ver sus adeudos: los mismos
// roles que pueden vender/apartar.
const ROLES_CLIENTES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
// Ajustar el saldo a favor de un cliente a mano (corrección de un error,
// cortesía, etc.) es una operación financiera sensible — solo administración,
// igual que cancelar un Cambio (ver ROLES_ADMIN en routes/cambios.js).
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

// Mismo criterio que resolverSucursalId en routes/ventas.js y routes/cambios.js:
// ADMIN/DESARROLLO pueden mandar la sucursal que quieran, VENTAS siempre
// queda forzado a la suya.
function resolverSucursalId(req, sucursalIdSolicitada) {
  if (esAdmin(req.usuario.rol)) return sucursalIdSolicitada;
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    throw err;
  }
  return req.usuario.sucursalId;
}

// GET /clientes?q= - buscar por nombre o teléfono (para autocompletar al
// registrar un apartado, cambio o venta)
router.get('/', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const { q } = req.query;
  const clientes = await prisma.cliente.findMany({
    where: q
      ? {
          OR: [
            { nombre: { contains: String(q), mode: 'insensitive' } },
            { telefono: { contains: String(q), mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { nombre: 'asc' },
  });
  res.json(clientes);
}));

// GET /clientes/:id - detalle de un cliente: sus apartados con saldo
// pendiente, su saldo a favor y el historial de movimientos de ese saldo
// (ver MovimientoSaldoCliente, generado por Cambios, Ventas o un ajuste
// manual de administración), y sus cambios/ventas recientes para dar
// contexto de dónde salió cada movimiento.
router.get('/:id', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      apartados: {
        include: {
          items: { include: { variante: { include: { producto: true, talla: true } } } },
          pagos: true,
          sucursalVenta: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      movimientosSaldo: {
        include: {
          usuario: { select: { nombre: true } },
          sucursal: { select: { nombre: true } },
          cambio: { select: { id: true, folio: true } },
          venta: { select: { id: true, folio: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      cambios: {
        select: {
          id: true,
          folio: true,
          totalDevuelto: true,
          totalNuevo: true,
          diferencia: true,
          estado: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      ventas: {
        select: {
          id: true,
          folio: true,
          total: true,
          saldoAplicado: true,
          estado: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const apartadosConSaldo = cliente.apartados.map((a) => {
    const pagado = a.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    return { ...a, pagado, saldoPendiente: Number(a.total) - pagado };
  });

  res.json({ ...cliente, apartados: apartadosConSaldo });
}));

const clienteSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  notas: z.string().optional(),
});

router.post('/', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const parsed = clienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { email, ...resto } = parsed.data;

  try {
    const cliente = await prisma.cliente.create({ data: { ...resto, email: email || undefined } });
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono.' });
    throw err;
  }
}));

router.put('/:id', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const parsed = clienteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { email, ...resto } = parsed.data;

  try {
    const cliente = await prisma.cliente.update({
      where: { id: Number(req.params.id) },
      data: { ...resto, ...(email !== undefined ? { email: email || null } : {}) },
    });
    res.json(cliente);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono.' });
    throw err;
  }
}));

// POST /clientes/:id/ajustar-saldo - corrección manual del saldo a favor
// (ej. cortesía, corregir un error de captura) — solo ADMIN_PRINCIPAL/
// DESARROLLO. Deja rastro en MovimientoSaldoCliente igual que un Cambio o
// una Venta, solo que sin cambioId/ventaId (el origen es este ajuste manual,
// queda identificado por usuarioId + notas).
const ajusteSaldoSchema = z.object({
  tipo: z.enum(['ABONO', 'CONSUMO']),
  monto: z.number().positive(),
  notas: z.string().min(1, 'Indica el motivo del ajuste.'),
  sucursalId: z.number().int().optional(),
});

router.post('/:id/ajustar-saldo', requireAuth, requireRole(...ROLES_ADMIN), asyncHandler(async (req, res) => {
  const parsed = ajusteSaldoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { tipo, monto, notas } = parsed.data;

  let sucursalId;
  try {
    sucursalId = resolverSucursalId(req, parsed.data.sucursalId);
  } catch (err) {
    if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
      return res.status(400).json({
        error: 'Tu usuario no tiene una sucursal asignada. Pide a un administrador que te asigne una para poder registrar ajustes.',
      });
    }
    throw err;
  }
  if (!sucursalId) {
    return res.status(400).json({ error: 'Falta indicar la sucursal.' });
  }

  const clienteId = Number(req.params.id);
  const montoCentavos = Math.round(monto * 100);

  try {
    const cliente = await prisma.$transaction(async (tx) => {
      const clienteActual = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!clienteActual) throw new Error('CLIENTE_NO_ENCONTRADO');

      const saldoActualCentavos = Math.round(Number(clienteActual.saldoFavor) * 100);
      let saldoResultanteCentavos;
      if (tipo === 'ABONO') {
        saldoResultanteCentavos = saldoActualCentavos + montoCentavos;
      } else {
        if (montoCentavos > saldoActualCentavos) throw new Error('SALDO_INSUFICIENTE');
        saldoResultanteCentavos = saldoActualCentavos - montoCentavos;
      }
      const saldoResultante = saldoResultanteCentavos / 100;

      await tx.movimientoSaldoCliente.create({
        data: {
          clienteId,
          tipo,
          monto,
          saldoResultante,
          usuarioId: req.usuario.id,
          sucursalId,
          notas,
        },
      });

      return tx.cliente.update({ where: { id: clienteId }, data: { saldoFavor: saldoResultante } });
    });

    res.json(cliente);
  } catch (err) {
    if (err.message === 'CLIENTE_NO_ENCONTRADO') return res.status(404).json({ error: 'Cliente no encontrado.' });
    if (err.message === 'SALDO_INSUFICIENTE') {
      return res.status(400).json({ error: 'El cliente no tiene suficiente saldo a favor para este ajuste.' });
    }
    throw err;
  }
}));

module.exports = router;
