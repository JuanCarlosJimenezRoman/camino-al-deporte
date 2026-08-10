const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen } = require('../config/cloudinary');

const router = express.Router();

// Proveedores son parte de "cómo se surte la mercancía", junto con
// inventario: mismos roles que ya administran productos/existencias.
const ROLES_PROVEEDORES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

function calcularTotalPagado(pagos) {
  return (pagos || []).reduce((acc, p) => acc + Number(p.monto), 0);
}

// GET /proveedores?todas=1 - listado. Cualquier rol autenticado puede
// consultarlo (por ejemplo, VENTAS podría necesitar saber quién surte un
// modelo al atender a un cliente).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const proveedores = await prisma.proveedor.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(proveedores);
}));

// GET /proveedores/pagos - historial global de pagos a proveedores, con
// filtros opcionales. Se monta ANTES de "/:id" para que "pagos" no se
// confunda con un id.
router.get(
  '/pagos',
  requireAuth,
  requireRole(...ROLES_PROVEEDORES),
  asyncHandler(async (req, res) => {
    const { proveedorId, fechaInicio, fechaFin } = req.query;

    const where = {
      ...(proveedorId ? { proveedorId: Number(proveedorId) } : {}),
    };
    if (fechaInicio || fechaFin) {
      where.createdAt = {};
      if (fechaInicio) where.createdAt.gte = new Date(`${fechaInicio}T00:00:00.000Z`);
      if (fechaFin) where.createdAt.lte = new Date(`${fechaFin}T23:59:59.999Z`);
    }

    const pagos = await prisma.pagoProveedor.findMany({
      where,
      include: {
        proveedor: { select: { nombre: true } },
        registradoPor: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalGeneral = pagos.reduce((acc, p) => acc + Number(p.monto), 0);

    res.json({ pagos, totalGeneral });
  })
);

// GET /proveedores/:id - detalle: datos, variantes que surte y su historial de pagos
router.get('/:id', requireAuth, requireRole(...ROLES_PROVEEDORES), asyncHandler(async (req, res) => {
  const proveedor = await prisma.proveedor.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      variantes: {
        where: { activo: true },
        include: { producto: { select: { nombre: true } }, talla: true },
        orderBy: { sku: 'asc' },
      },
      pagos: {
        include: { registradoPor: { select: { nombre: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });

  res.json({ ...proveedor, totalPagado: calcularTotalPagado(proveedor.pagos) });
}));

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  banco: z.string().optional(),
  titular: z.string().optional(),
  numeroCuenta: z.string().optional(),
  notas: z.string().optional(),
});

router.post('/', requireAuth, requireRole(...ROLES_PROVEEDORES), asyncHandler(async (req, res) => {
  const parsed = proveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const proveedor = await prisma.proveedor.create({ data: parsed.data });
  res.status(201).json(proveedor);
}));

router.put('/:id', requireAuth, requireRole(...ROLES_PROVEEDORES), asyncHandler(async (req, res) => {
  const parsed = proveedorSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const proveedor = await prisma.proveedor.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
  });
  res.json(proveedor);
}));

const pagoProveedorSchema = z.object({
  monto: z.number().positive(),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
  concepto: z.string().optional(),
});

// POST /proveedores/:id/pagos - registrar un pago. Igual que en ventas y
// apartados: acepta multipart/form-data con "datos" (JSON) + "comprobante"
// (archivo, obligatorio solo si metodoPago = TRANSFERENCIA), o JSON normal
// si no hay comprobante que subir.
router.post(
  '/:id/pagos',
  requireAuth,
  requireRole(...ROLES_PROVEEDORES),
  manejarSubidaImagen('comprobante'),
  asyncHandler(async (req, res) => {
    const proveedorId = Number(req.params.id);

    let body = req.body;
    if (req.is('multipart/form-data')) {
      try {
        body = JSON.parse(req.body.datos || '{}');
      } catch {
        return res.status(400).json({ error: 'El campo "datos" debe ser un JSON válido.' });
      }
    }

    const parsed = pagoProveedorSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { monto, metodoPago, concepto } = parsed.data;

    const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });

    let comprobanteUrl = null;
    let comprobantePublicId = null;
    if (metodoPago === 'TRANSFERENCIA') {
      if (!req.file) {
        return res.status(400).json({ error: 'Falta la foto del comprobante (campo "comprobante").' });
      }
      const subida = await subirImagen(req.file.buffer, 'comprobantes');
      comprobanteUrl = subida.url;
      comprobantePublicId = subida.publicId;
    }

    const pago = await prisma.pagoProveedor.create({
      data: {
        proveedorId,
        monto,
        metodoPago,
        concepto,
        comprobanteUrl,
        comprobantePublicId,
        registradoPorId: req.usuario.id,
      },
      include: { registradoPor: { select: { nombre: true } } },
    });

    res.status(201).json(pago);
  })
);

module.exports = router;
