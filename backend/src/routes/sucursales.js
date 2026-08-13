const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Solo ADMIN_PRINCIPAL/DESARROLLO crean o editan sucursales; el resto de
// roles autenticados pueden verlas (para elegir en qué sucursal operan).
const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

// GET /sucursales - listado simple
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const sucursales = await prisma.sucursal.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(sucursales);
}));

// GET /sucursales/:id - detalle + sus existencias (productos y stock)
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const sucursal = await prisma.sucursal.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });

  const existencias = await prisma.existencia.findMany({
    where: { sucursalId: sucursal.id },
    include: {
      variante: {
        include: { producto: { include: { marca: true, categoria: true } }, talla: true },
      },
    },
    orderBy: { variante: { sku: 'asc' } },
  });

  res.json({ ...sucursal, existencias });
}));

const sucursalSchema = z.object({
  nombre: z.string().min(1),
  codigo: z.string().min(1).optional(),
  direccion: z.string().optional(),
  // .nullable() además de .optional(): la pantalla de edición manda
  // explícitamente null al querer borrar un número ya capturado (no solo
  // omitir el campo), tanto para telefono como para whatsappPhoneNumberId.
  telefono: z.string().optional().nullable(),
  // ID de WhatsApp Business Platform (Cloud API) de esta sucursal, para el
  // envío automático del ticket digital — ver config/whatsapp.js. NO es el
  // número de teléfono visible.
  whatsappPhoneNumberId: z.string().optional().nullable(),
  esBodegaCentral: z.boolean().optional(),
});

router.post('/', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = sucursalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  try {
    const sucursal = await prisma.sucursal.create({ data: parsed.data });
    res.status(201).json(sucursal);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una sucursal con ese código.' });
    }
    throw err;
  }
}));

router.put('/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = sucursalSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  const sucursal = await prisma.sucursal.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
  });
  res.json(sucursal);
}));

module.exports = router;
