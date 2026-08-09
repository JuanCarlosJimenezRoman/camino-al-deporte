const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// GET /productos - todos los roles autenticados pueden consultar
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { marcaId, categoriaId, q } = req.query;

  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(q ? { nombre: { contains: String(q), mode: 'insensitive' } } : {}),
    },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      variantes: { include: { talla: true } },
    },
    orderBy: { nombre: 'asc' },
  });

  res.json(productos);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      variantes: { include: { talla: true } },
    },
  });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(producto);
}));

const productoSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  marcaId: z.number().int(),
  modeloId: z.number().int().optional(),
  categoriaId: z.number().int(),
  precioCompra: z.number().nonnegative().optional(),
  precioVenta: z.number().nonnegative().optional(),
  atributosExtra: z.record(z.any()).optional(),
  // variantes iniciales opcionales al crear el producto
  variantes: z
    .array(
      z.object({
        tallaId: z.number().int().optional(),
        color: z.string().optional(),
        sku: z.string().min(1),
        stockActual: z.number().int().nonnegative().default(0),
        stockMinimo: z.number().int().nonnegative().default(0),
      })
    )
    .optional(),
});

// POST /productos - crear producto (con variantes opcionales)
router.post('/', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = productoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { variantes, ...productoData } = parsed.data;

  const producto = await prisma.producto.create({
    data: {
      ...productoData,
      variantes: variantes ? { create: variantes } : undefined,
    },
    include: { variantes: true },
  });

  res.status(201).json(producto);
}));

// PUT /productos/:id - editar producto
router.put('/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = productoSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { variantes, ...productoData } = parsed.data;

  const producto = await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: productoData,
  });

  res.json(producto);
}));

// DELETE /productos/:id - baja lógica (no se borra físicamente)
router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  })
);

// POST /productos/:id/variantes - agregar una variante (talla/color) a un producto existente
router.post(
  '/:id/variantes',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      tallaId: z.number().int().optional(),
      color: z.string().optional(),
      sku: z.string().min(1),
      stockActual: z.number().int().nonnegative().default(0),
      stockMinimo: z.number().int().nonnegative().default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const variante = await prisma.productoVariante.create({
      data: { ...parsed.data, productoId: Number(req.params.id) },
    });

    res.status(201).json(variante);
  })
);

module.exports = router;
