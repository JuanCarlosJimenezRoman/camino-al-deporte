const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_INVENTARIO = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// GET /inventario/existencias - consulta de stock (todos los roles, incluido CONSULTA)
router.get('/existencias', requireAuth, asyncHandler(async (req, res) => {
  const { skuOProducto } = req.query;

  const variantes = await prisma.productoVariante.findMany({
    where: {
      activo: true,
      ...(skuOProducto
        ? {
            OR: [
              { sku: { contains: String(skuOProducto), mode: 'insensitive' } },
              { producto: { nombre: { contains: String(skuOProducto), mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      producto: { include: { marca: true, categoria: true } },
      talla: true,
    },
    orderBy: { sku: 'asc' },
  });

  res.json(variantes);
}));

// GET /inventario/bajo-stock - variantes en o por debajo del stock mínimo
router.get('/bajo-stock', requireAuth, asyncHandler(async (req, res) => {
  const variantes = await prisma.$queryRaw`
    SELECT pv.*, p.nombre AS producto_nombre
    FROM producto_variantes pv
    JOIN productos p ON p.id = pv.producto_id
    WHERE pv.activo = true AND pv.stock_actual <= pv.stock_minimo
    ORDER BY pv.stock_actual ASC
  `;
  res.json(variantes);
}));

// POST /inventario/movimientos - registrar entrada/salida/ajuste de stock
router.post(
  '/movimientos',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      varianteId: z.number().int(),
      tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
      cantidad: z.number().int(),
      motivo: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { varianteId, tipo, cantidad, motivo } = parsed.data;

    // Entradas suman, salidas restan; ajuste usa el signo tal cual se envía.
    const delta = tipo === 'SALIDA' ? -Math.abs(cantidad) : tipo === 'ENTRADA' ? Math.abs(cantidad) : cantidad;

    const resultado = await prisma
      .$transaction(async (tx) => {
        const variante = await tx.productoVariante.findUnique({ where: { id: varianteId } });
        if (!variante) throw new Error('VARIANTE_NO_ENCONTRADA');

        const nuevoStock = variante.stockActual + delta;
        if (nuevoStock < 0) throw new Error('STOCK_INSUFICIENTE');

        const actualizada = await tx.productoVariante.update({
          where: { id: varianteId },
          data: { stockActual: nuevoStock },
        });

        const movimiento = await tx.movimientoInventario.create({
          data: {
            varianteId,
            tipo,
            cantidad: delta,
            motivo,
            usuarioId: req.usuario.id,
          },
        });

        return { movimiento, stockActual: actualizada.stockActual };
      })
      .catch((err) => {
        if (err.message === 'STOCK_INSUFICIENTE') return { error: 'STOCK_INSUFICIENTE' };
        if (err.message === 'VARIANTE_NO_ENCONTRADA') return { error: 'VARIANTE_NO_ENCONTRADA' };
        throw err;
      });

    if (resultado.error === 'STOCK_INSUFICIENTE') {
      return res.status(409).json({ error: 'Stock insuficiente para esta salida.' });
    }
    if (resultado.error === 'VARIANTE_NO_ENCONTRADA') {
      return res.status(404).json({ error: 'Variante no encontrada.' });
    }

    res.status(201).json(resultado);
  })
);

// GET /inventario/movimientos/:varianteId - historial de una variante
router.get('/movimientos/:varianteId', requireAuth, asyncHandler(async (req, res) => {
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { varianteId: Number(req.params.varianteId) },
    include: { usuario: { select: { nombre: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(movimientos);
}));

module.exports = router;
