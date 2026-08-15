const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Cupones de la tienda en línea: información financiera/operativa, igual
// que cuentas de transferencia — solo administración los crea/edita.
const ROLES_CUPONES = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

const CUPON_INCLUDE = {
  productos: { include: { producto: { select: { id: true, nombre: true } } } },
  creadoPor: { select: { nombre: true } },
  _count: { select: { usos: true } },
};

// GET /cupones - todos los cupones (activos e inactivos), más recientes primero
router.get('/', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const cupones = await prisma.cupon.findMany({
    include: CUPON_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(cupones);
}));

// GET /cupones/:id
router.get('/:id', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const cupon = await prisma.cupon.findUnique({
    where: { id: Number(req.params.id) },
    include: CUPON_INCLUDE,
  });
  if (!cupon) return res.status(404).json({ error: 'Cupón no encontrado.' });
  res.json(cupon);
}));

const cuponSchema = z
  .object({
    codigo: z.string().min(1).max(40),
    descripcion: z.string().optional(),
    tipoDescuento: z.enum(['PORCENTAJE', 'MONTO']),
    valor: z.number().positive(),
    productosIds: z.array(z.number().int()).min(1, 'Elige al menos un producto al que aplique el cupón.'),
    montoMinimo: z.number().nonnegative().optional().nullable(),
    fechaInicio: z.string().datetime().optional().nullable(),
    fechaFin: z.string().datetime().optional().nullable(),
    usosMaximos: z.number().int().positive().optional().nullable(),
    usosPorCliente: z.number().int().positive().optional().nullable(),
    activo: z.boolean().optional(),
  })
  .refine((d) => d.tipoDescuento !== 'PORCENTAJE' || d.valor <= 100, {
    message: 'Un descuento por porcentaje no puede ser mayor a 100.',
    path: ['valor'],
  })
  .refine((d) => !d.fechaInicio || !d.fechaFin || new Date(d.fechaInicio) <= new Date(d.fechaFin), {
    message: 'La fecha de inicio debe ser anterior a la fecha de fin.',
    path: ['fechaFin'],
  });

// POST /cupones - crea un cupón nuevo con su lista de productos
router.post('/', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const parsed = cuponSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { productosIds, codigo, montoMinimo, fechaInicio, fechaFin, usosMaximos, usosPorCliente, ...resto } =
    parsed.data;

  const codigoNormalizado = codigo.trim().toUpperCase();

  const existente = await prisma.cupon.findUnique({ where: { codigo: codigoNormalizado } });
  if (existente) {
    return res.status(409).json({ error: 'Ya existe un cupón con ese código.' });
  }

  const productos = await prisma.producto.findMany({ where: { id: { in: productosIds } }, select: { id: true } });
  if (productos.length !== productosIds.length) {
    return res.status(400).json({ error: 'Uno o más productos seleccionados no existen.' });
  }

  const nuevo = await prisma.cupon.create({
    data: {
      ...resto,
      codigo: codigoNormalizado,
      montoMinimo: montoMinimo ?? null,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
      fechaFin: fechaFin ? new Date(fechaFin) : null,
      usosMaximos: usosMaximos ?? null,
      usosPorCliente: usosPorCliente ?? null,
      creadoPorId: req.usuario.id,
      productos: { create: productosIds.map((productoId) => ({ productoId })) },
    },
    include: CUPON_INCLUDE,
  });
  res.status(201).json(nuevo);
}));

// PUT /cupones/:id - reemplaza los datos y la lista de productos del cupón
router.put('/:id', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const parsed = cuponSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const cuponId = Number(req.params.id);
  const actual = await prisma.cupon.findUnique({ where: { id: cuponId } });
  if (!actual) return res.status(404).json({ error: 'Cupón no encontrado.' });

  const { productosIds, codigo, montoMinimo, fechaInicio, fechaFin, usosMaximos, usosPorCliente, ...resto } =
    parsed.data;
  const codigoNormalizado = codigo.trim().toUpperCase();

  const otroConMismoCodigo = await prisma.cupon.findFirst({
    where: { codigo: codigoNormalizado, NOT: { id: cuponId } },
  });
  if (otroConMismoCodigo) {
    return res.status(409).json({ error: 'Ya existe otro cupón con ese código.' });
  }

  const productos = await prisma.producto.findMany({ where: { id: { in: productosIds } }, select: { id: true } });
  if (productos.length !== productosIds.length) {
    return res.status(400).json({ error: 'Uno o más productos seleccionados no existen.' });
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.cuponProducto.deleteMany({ where: { cuponId } });
    return tx.cupon.update({
      where: { id: cuponId },
      data: {
        ...resto,
        codigo: codigoNormalizado,
        montoMinimo: montoMinimo ?? null,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        usosMaximos: usosMaximos ?? null,
        usosPorCliente: usosPorCliente ?? null,
        productos: { create: productosIds.map((productoId) => ({ productoId })) },
      },
      include: CUPON_INCLUDE,
    });
  });
  res.json(actualizado);
}));

const activoSchema = z.object({ activo: z.boolean() });

// POST /cupones/:id/activo - activar/desactivar sin tener que reenviar todo
// el formulario (ej. apagar un cupón de una promoción que ya terminó).
router.post('/:id/activo', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const parsed = activoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const cupon = await prisma.cupon.findUnique({ where: { id: Number(req.params.id) } });
  if (!cupon) return res.status(404).json({ error: 'Cupón no encontrado.' });

  const actualizado = await prisma.cupon.update({
    where: { id: cupon.id },
    data: { activo: parsed.data.activo },
    include: CUPON_INCLUDE,
  });
  res.json(actualizado);
}));

// DELETE /cupones/:id - solo si nunca se ha usado; si ya tiene usos, se
// desactiva en vez de borrarse (ver POST /:id/activo) para no perder el
// rastro de los pedidos que ya lo aplicaron.
router.delete('/:id', requireAuth, requireRole(...ROLES_CUPONES), asyncHandler(async (req, res) => {
  const cuponId = Number(req.params.id);
  const usos = await prisma.cuponUso.count({ where: { cuponId } });
  if (usos > 0) {
    return res.status(409).json({ error: 'Este cupón ya se usó en pedidos; desactívalo en vez de borrarlo.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.cuponProducto.deleteMany({ where: { cuponId } });
    await tx.cupon.delete({ where: { id: cuponId } });
  });
  res.status(204).end();
}));

module.exports = router;
