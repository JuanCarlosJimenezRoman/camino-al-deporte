const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_VENTAS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

// GET /ventas - listar ventas (admin/desarrollo ven todo; ventas ve las propias)
// Filtro opcional ?sucursalId=
router.get('/', requireAuth, requireRole(...ROLES_VENTAS), asyncHandler(async (req, res) => {
  const esAdmin = ['ADMIN_PRINCIPAL', 'DESARROLLO'].includes(req.usuario.rol);
  const { sucursalId } = req.query;

  const ventas = await prisma.venta.findMany({
    where: {
      ...(esAdmin ? {} : { usuarioId: req.usuario.id }),
      ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
    },
    include: {
      items: { include: { variante: { include: { producto: true, talla: true } } } },
      usuario: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(ventas);
}));

const ventaSchema = z.object({
  sucursalId: z.number().int(),
  cliente: z.string().optional(),
  metodoPago: z.string().optional(),
  items: z
    .array(
      z.object({
        varianteId: z.number().int(),
        cantidad: z.number().int().positive(),
        precioUnitario: z.number().nonnegative(),
      })
    )
    .min(1),
});

// POST /ventas - registrar una venta y descontar inventario de esa sucursal en la misma transacción
router.post('/', requireAuth, requireRole(...ROLES_VENTAS), asyncHandler(async (req, res) => {
  const parsed = ventaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { sucursalId, cliente, metodoPago, items } = parsed.data;

  try {
    const venta = await prisma.$transaction(async (tx) => {
      let total = 0;
      const itemsData = [];

      for (const item of items) {
        const existencia = await tx.existencia.findUnique({
          where: { sucursalId_varianteId: { sucursalId, varianteId: item.varianteId } },
          include: { variante: true },
        });
        if (!existencia) throw new Error(`SIN_EXISTENCIA:${item.varianteId}`);
        if (existencia.stockActual < item.cantidad) {
          throw new Error(`STOCK_INSUFICIENTE:${existencia.variante.sku}`);
        }

        const subtotal = item.cantidad * item.precioUnitario;
        total += subtotal;

        await tx.existencia.update({
          where: { id: existencia.id },
          data: { stockActual: { decrement: item.cantidad } },
        });

        await tx.movimientoInventario.create({
          data: {
            sucursalId,
            varianteId: item.varianteId,
            tipo: 'VENTA',
            cantidad: -item.cantidad,
            motivo: 'Venta',
            usuarioId: req.usuario.id,
          },
        });

        itemsData.push({ ...item, subtotal });
      }

      const folio = `V-${Date.now()}`;

      return tx.venta.create({
        data: {
          folio,
          sucursalId,
          usuarioId: req.usuario.id,
          cliente,
          metodoPago,
          total,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });

    res.status(201).json(venta);
  } catch (err) {
    if (err.message.startsWith('STOCK_INSUFICIENTE')) {
      return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
    }
    if (err.message.startsWith('SIN_EXISTENCIA')) {
      return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en esta sucursal.' });
    }
    throw err;
  }
}));

// POST /ventas/:id/cancelar - cancela y repone inventario en la sucursal donde se vendió
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const ventaId = Number(req.params.id);

    const venta = await prisma
      .$transaction(async (tx) => {
        const v = await tx.venta.findUnique({ where: { id: ventaId }, include: { items: true } });
        if (!v) throw new Error('VENTA_NO_ENCONTRADA');
        if (v.estado === 'CANCELADA') return v;

        for (const item of v.items) {
          await tx.existencia.upsert({
            where: { sucursalId_varianteId: { sucursalId: v.sucursalId, varianteId: item.varianteId } },
            update: { stockActual: { increment: item.cantidad } },
            create: {
              sucursalId: v.sucursalId,
              varianteId: item.varianteId,
              stockActual: item.cantidad,
              stockMinimo: 0,
            },
          });
          await tx.movimientoInventario.create({
            data: {
              sucursalId: v.sucursalId,
              varianteId: item.varianteId,
              tipo: 'DEVOLUCION',
              cantidad: item.cantidad,
              motivo: `Cancelación venta ${v.folio}`,
              usuarioId: req.usuario.id,
            },
          });
        }

        return tx.venta.update({ where: { id: ventaId }, data: { estado: 'CANCELADA' } });
      })
      .catch((err) => {
        if (err.message === 'VENTA_NO_ENCONTRADA') return null;
        throw err;
      });

    if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
    res.json(venta);
  })
);

module.exports = router;
