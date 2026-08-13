const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Configuración general de la tienda en línea: WhatsApp de contacto y costo
// de envío fijo (fila única, siempre id=1). Es información
// sensible/operativa, igual que las cuentas de transferencia: solo
// ADMIN_PRINCIPAL/DESARROLLO la editan.
const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

async function obtenerOCrear() {
  const existente = await prisma.configuracionTienda.findFirst();
  if (existente) return existente;
  return prisma.configuracionTienda.create({ data: {} });
}

// GET /configuracion-tienda
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.json(await obtenerOCrear());
}));

const schema = z.object({
  whatsappTienda: z.string().optional().nullable(),
  // ID de WhatsApp Business Platform (Cloud API) usado como respaldo
  // general cuando una sucursal no tiene uno propio — ver
  // Sucursal.whatsappPhoneNumberId y config/whatsapp.js.
  whatsappPhoneNumberId: z.string().optional().nullable(),
  costoEnvio: z.coerce.number().min(0).optional(),
});

// PUT /configuracion-tienda
router.put('/', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  const actual = await obtenerOCrear();
  const actualizada = await prisma.configuracionTienda.update({
    where: { id: actual.id },
    data: {
      ...(('whatsappTienda' in req.body) ? { whatsappTienda: parsed.data.whatsappTienda || null } : {}),
      ...(('whatsappPhoneNumberId' in req.body)
        ? { whatsappPhoneNumberId: parsed.data.whatsappPhoneNumberId || null }
        : {}),
      ...(('costoEnvio' in req.body) ? { costoEnvio: parsed.data.costoEnvio ?? 0 } : {}),
    },
  });
  res.json(actualizada);
}));

module.exports = router;
