const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { subirImagen, borrarImagen } = require('../config/cloudinary');

const router = express.Router();

// Multer guarda el logo en memoria (no en disco: Render no persiste archivos
// entre despliegues) para subirlo directo a Cloudinary — mismo patrón que las
// fotos de producto (ver routes/productos.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('SOLO_IMAGENES'));
    cb(null, true);
  },
});

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
  // Botón fijo/dinámico (ver comentario junto a este campo en schema.prisma,
  // modelo ConfiguracionTienda) — mientras esté en false, el checkout de la
  // tienda en línea se comporta exactamente igual que siempre (costoEnvio
  // fijo); en true, cotiza contra el catálogo de envíos v2 cuando el
  // cliente elige un destino dentro de Oaxaca.
  envioDinamicoActivo: z.boolean().optional(),
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
      ...(('envioDinamicoActivo' in req.body)
        ? { envioDinamicoActivo: parsed.data.envioDinamicoActivo ?? false }
        : {}),
    },
  });
  res.json(actualizada);
}));

// POST /configuracion-tienda/logo - subir (o reemplazar) el logo del ticket/
// comprobante digital. Se guarda en Cloudinary (camino-al-deporte/logo) y, si
// ya había uno, se borra el anterior. Si no se sube ninguno, el PDF sigue
// dibujando la insignia con iniciales (ver utils/ticketEstilo.js).
router.post(
  '/logo',
  requireAuth,
  requireRole(...ROLES_EDICION),
  (req, res, next) => {
    upload.single('logo')(req, res, (err) => {
      if (err) {
        if (err.message === 'SOLO_IMAGENES') return res.status(400).json({ error: 'El archivo debe ser una imagen.' });
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La imagen no puede pesar más de 5 MB.' });
        return res.status(400).json({ error: 'No se pudo procesar el archivo.' });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen (campo "logo").' });

    const actual = await obtenerOCrear();
    if (actual.logoTicketPublicId) {
      await borrarImagen(actual.logoTicketPublicId).catch((err) =>
        console.error('No se pudo borrar el logo anterior de Cloudinary:', err.message)
      );
    }

    const subida = await subirImagen(req.file.buffer, 'logo');
    const actualizada = await prisma.configuracionTienda.update({
      where: { id: actual.id },
      data: { logoTicketUrl: subida.url, logoTicketPublicId: subida.publicId },
    });
    res.json(actualizada);
  })
);

// DELETE /configuracion-tienda/logo - quitar el logo y volver a la insignia
// con iniciales en el ticket.
router.delete('/logo', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const actual = await obtenerOCrear();
  if (actual.logoTicketPublicId) {
    await borrarImagen(actual.logoTicketPublicId).catch((err) =>
      console.error('No se pudo borrar el logo de Cloudinary:', err.message)
    );
  }
  const actualizada = await prisma.configuracionTienda.update({
    where: { id: actual.id },
    data: { logoTicketUrl: null, logoTicketPublicId: null },
  });
  res.json(actualizada);
}));

module.exports = router;
