const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_INVENTARIO = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// GET /inventario/existencias?sucursalId= - consulta de stock de esa sucursal.
//
// Importante: esto se arma a partir de TODAS las variantes activas (no solo
// las que ya tienen una fila en "existencias"). Una variante puede no tener
// todavía fila de existencia en una sucursal (por ejemplo, si se importó por
// Excel con stock 0, o si se creó en otra sucursal) — en ese caso aparece
// aquí igual, con stock 0, para que se pueda editar. Si no se hiciera así,
// un producto recién creado con stock 0 "desaparecería" de Inventario y no
// habría forma de cargarle stock.
router.get('/existencias', requireAuth, asyncHandler(async (req, res) => {
  const { skuOProducto, sucursalId } = req.query;
  if (!sucursalId) return res.status(400).json({ error: 'Falta sucursalId.' });

  const variantes = await prisma.productoVariante.findMany({
    where: {
      activo: true,
      producto: { activo: true },
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
      existencias: { where: { sucursalId: Number(sucursalId) } },
    },
    orderBy: { sku: 'asc' },
  });

  const resultado = variantes.map((v) => {
    const { existencias, ...variante } = v;
    const ex = existencias[0];
    return {
      id: ex ? ex.id : null,
      sucursalId: Number(sucursalId),
      stockActual: ex ? ex.stockActual : 0,
      stockMinimo: ex ? ex.stockMinimo : 0,
      variante,
    };
  });

  res.json(resultado);
}));

// GET /inventario/bajo-stock?sucursalId= - variantes en o por debajo del mínimo en esa sucursal
router.get('/bajo-stock', requireAuth, asyncHandler(async (req, res) => {
  const { sucursalId } = req.query;
  if (!sucursalId) return res.status(400).json({ error: 'Falta sucursalId.' });

  const variantes = await prisma.productoVariante.findMany({
    where: { activo: true, producto: { activo: true } },
    include: {
      producto: true,
      talla: true,
      existencias: { where: { sucursalId: Number(sucursalId) } },
    },
  });

  const bajoStock = variantes
    .map((v) => {
      const { existencias, ...variante } = v;
      const ex = existencias[0];
      return {
        id: ex ? ex.id : null,
        sucursalId: Number(sucursalId),
        stockActual: ex ? ex.stockActual : 0,
        stockMinimo: ex ? ex.stockMinimo : 0,
        variante,
      };
    })
    .filter((e) => e.stockActual <= e.stockMinimo)
    .sort((a, b) => a.stockActual - b.stockActual);

  res.json(bajoStock);
}));

// POST /inventario/movimientos - registrar entrada/salida/ajuste de stock en una sucursal
router.post(
  '/movimientos',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      sucursalId: z.number().int(),
      varianteId: z.number().int(),
      tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
      cantidad: z.number().int(),
      motivo: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { sucursalId, varianteId, tipo, cantidad, motivo } = parsed.data;

    // Entradas suman, salidas restan; ajuste usa el signo tal cual se envía.
    const delta = tipo === 'SALIDA' ? -Math.abs(cantidad) : tipo === 'ENTRADA' ? Math.abs(cantidad) : cantidad;

    const resultado = await prisma
      .$transaction(async (tx) => {
        const existencia = await tx.existencia.findUnique({
          where: { sucursalId_varianteId: { sucursalId, varianteId } },
        });

        const stockPrevio = existencia ? existencia.stockActual : 0;
        const nuevoStock = stockPrevio + delta;
        if (nuevoStock < 0) throw new Error('STOCK_INSUFICIENTE');

        const actualizada = await tx.existencia.upsert({
          where: { sucursalId_varianteId: { sucursalId, varianteId } },
          update: { stockActual: nuevoStock },
          create: { sucursalId, varianteId, stockActual: nuevoStock, stockMinimo: 0 },
        });

        const movimiento = await tx.movimientoInventario.create({
          data: {
            sucursalId,
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
        throw err;
      });

    if (resultado.error === 'STOCK_INSUFICIENTE') {
      return res.status(409).json({ error: 'Stock insuficiente para esta salida.' });
    }

    res.status(201).json(resultado);
  })
);

// GET /inventario/movimientos/:varianteId - historial de una variante (todas las sucursales)
router.get('/movimientos/:varianteId', requireAuth, asyncHandler(async (req, res) => {
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { varianteId: Number(req.params.varianteId) },
    include: {
      usuario: { select: { nombre: true, email: true } },
      sucursal: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(movimientos);
}));

// PUT /inventario/minimo - fija el stock mínimo de una variante en una sucursal
router.put(
  '/minimo',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      sucursalId: z.number().int(),
      varianteId: z.number().int(),
      stockMinimo: z.number().int().nonnegative(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { sucursalId, varianteId, stockMinimo } = parsed.data;

    const existencia = await prisma.existencia.upsert({
      where: { sucursalId_varianteId: { sucursalId, varianteId } },
      update: { stockMinimo },
      create: { sucursalId, varianteId, stockMinimo, stockActual: 0 },
    });

    res.json(existencia);
  })
);

module.exports = router;
