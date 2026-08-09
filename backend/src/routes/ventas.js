const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

const ROLES_VENTAS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

// GET /ventas - listar ventas (admin/desarrollo ven todo; ventas ve las propias)
router.get('/', requireAuth, requireRole(...ROLES_VENTAS), async (req, res) => {
  const esAdmin = ['ADMIN_PRINCIPAL', 'DESARROLLO'].includes(req.usuario.rol);

  const ventas = await prisma.venta.findMany({
    where: esAdmin ? undefined : { usuarioId: req.usuario.id },
    include: {
      items: { include: { variante: { include: { producto: true, talla: true } } } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(ventas);
});

const ventaSchema = z.object({
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

// POST /ventas - registrar una venta y descontar inventario en la misma transacción
router.post('/', requireAuth, requireRole(...ROLES_VENTAS), async (req, res) => {
  const parsed = ventaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { cliente, metodoPago, items } = parsed.data;

  try {
    const venta = await prisma.$transaction(async (tx) => {
      let total = 0;
      const itemsData = [];

      for (const item of items) {
        const variante = await tx.productoVariante.findUnique({ where: { id: item.varianteId } });
        if (!variante) throw new Error(`VARIANTE_NO_ENCONTRADA:${item.varianteId}`);
        if (variante.stockActual < item.cantidad) {
          throw new Error(`STOCK_INSUFICIENTE:${variante.sku}`);
        }

        const subtotal = item.cantidad * item.precioUnitario;
        total += subtotal;

        await tx.productoVariante.update({
          where: { id: item.varianteId },
          data: { stockActual: { decrement: item.cantidad } },
        });

        await tx.movimientoInventario.create({
          data: {
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
    if (err.message.startsWith('VARIANTE_NO_ENCONTRADA')) {
      return res.status(404).json({ error: 'Una de las variantes no existe.' });
    }
    throw err;
  }
});

// POST /ventas/:id/cancelar - cancela y repone inventario
router.post('/:id/cancelar', requireAuth, requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'), async (req, res) => {
  const ventaId = Number(req.params.id);

  const venta = await prisma.$transaction(async (tx) => {
    const v = await tx.venta.findUnique({ where: { id: ventaId }, include: { items: true } });
    if (!v) throw new Error('VENTA_NO_ENCONTRADA');
    if (v.estado === 'CANCELADA') return v;

    for (const item of v.items) {
      await tx.productoVariante.update({
        where: { id: item.varianteId },
        data: { stockActual: { increment: item.cantidad } },
      });
      await tx.movimientoInventario.create({
        data: {
          varianteId: item.varianteId,
          tipo: 'DEVOLUCION',
          cantidad: item.cantidad,
          motivo: `Cancelación venta ${v.folio}`,
          usuarioId: req.usuario.id,
        },
      });
    }

    return tx.venta.update({ where: { id: ventaId }, data: { estado: 'CANCELADA' } });
  }).catch((err) => {
    if (err.message === 'VENTA_NO_ENCONTRADA') return null;
    throw err;
  });

  if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
  res.json(venta);
});

module.exports = router;
