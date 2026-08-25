const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién administra el catálogo de envíos (transportistas, destinos,
// tarifas): los mismos roles que ya capturan pedidos manuales y los marcan
// como enviados (ver ROLES_PEDIDOS_MANUAL en routes/pedidosOnline.js),
// porque en la práctica son quienes se enteran de un precio o un punto de
// entrega nuevo mientras cotizan con un cliente por WhatsApp. A diferencia
// de los catálogos de mercancía (routes/catalogos.js), esto no afecta qué
// se vende ni datos bancarios, así que no pasa por una solicitud de
// aprobación: VENTAS puede darlo de alta o corregirlo directo.
const ROLES_ENVIOS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

const TIPOS_TRANSPORTISTA = ['PAQUETERIA', 'AUTOBUS', 'SUBURBAN', 'TAXI', 'LINEA_TRANSPORTE', 'OTRO'];
const TAMANOS_PAQUETE = ['CHICO', 'MEDIANO', 'GRANDE', 'EXTRA_GRANDE'];

// ---------------------------------------------------------------------
// Transportistas
// ---------------------------------------------------------------------

// GET /envios/transportistas?todas=1 - listado. Cualquier rol autenticado
// puede consultarlo (igual que /proveedores y /sucursales).
router.get('/transportistas', requireAuth, asyncHandler(async (req, res) => {
  const transportistas = await prisma.transportista.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: [{ esNacional: 'desc' }, { nombre: 'asc' }],
  });
  res.json(transportistas);
}));

const transportistaSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(TIPOS_TRANSPORTISTA),
  esNacional: z.boolean().optional(),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

router.post('/transportistas', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = transportistaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const transportista = await prisma.transportista.create({ data: parsed.data });
  res.status(201).json(transportista);
}));

router.put('/transportistas/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = transportistaSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const transportista = await prisma.transportista.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
  });
  res.json(transportista);
}));

// ---------------------------------------------------------------------
// Destinos (dentro de Oaxaca)
// ---------------------------------------------------------------------

// GET /envios/destinos?todas=1&municipio= - listado, opcionalmente filtrado
// por municipio (búsqueda parcial, para el selector de "a dónde se manda").
router.get('/destinos', requireAuth, asyncHandler(async (req, res) => {
  const { municipio } = req.query;
  const destinos = await prisma.destinoEnvio.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(municipio ? { municipio: { contains: String(municipio), mode: 'insensitive' } } : {}),
    },
    include: { transportistaSugerido: true },
    orderBy: [{ municipio: 'asc' }, { nombre: 'asc' }],
  });
  res.json(destinos);
}));

// GET /envios/destinos/:id - detalle + tarifas conocidas hacia ese destino.
router.get('/destinos/:id', requireAuth, asyncHandler(async (req, res) => {
  const destino = await prisma.destinoEnvio.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      transportistaSugerido: true,
      tarifas: {
        where: { activo: true },
        include: { transportista: true },
        orderBy: [{ tamano: 'asc' }, { precio: 'asc' }],
      },
    },
  });
  if (!destino) return res.status(404).json({ error: 'Destino no encontrado.' });
  res.json(destino);
}));

const destinoSchema = z.object({
  nombre: z.string().min(1),
  municipio: z.string().min(1),
  region: z.string().optional().nullable(),
  transportistaSugeridoId: z.number().int().optional().nullable(),
  // false = ningún transportista llega directo al domicilio en este
  // destino; puntoEntregaTexto describe dónde recoge el cliente (una
  // terminal, una encomienda) — ver comentario en el modelo en
  // schema.prisma.
  entregaDomicilio: z.boolean().optional(),
  puntoEntregaTexto: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

router.post('/destinos', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = destinoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  try {
    const destino = await prisma.destinoEnvio.create({ data: parsed.data });
    res.status(201).json(destino);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un destino con ese nombre en ese municipio.' });
    }
    throw err;
  }
}));

router.put('/destinos/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = destinoSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  try {
    const destino = await prisma.destinoEnvio.update({
      where: { id: Number(req.params.id) },
      data: parsed.data,
    });
    res.json(destino);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un destino con ese nombre en ese municipio.' });
    }
    throw err;
  }
}));

// ---------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------

// GET /envios/tarifas?destinoId=&transportistaId= - listado con filtros.
router.get('/tarifas', requireAuth, asyncHandler(async (req, res) => {
  const { destinoId, transportistaId } = req.query;
  const tarifas = await prisma.tarifaEnvio.findMany({
    where: {
      activo: true,
      ...(destinoId ? { destinoId: Number(destinoId) } : {}),
      ...(transportistaId ? { transportistaId: Number(transportistaId) } : {}),
    },
    include: { transportista: true, destino: true },
    orderBy: [{ destinoId: 'asc' }, { tamano: 'asc' }],
  });
  res.json(tarifas);
}));

// GET /envios/cotizar?destinoId=&tamano= - lo que usa quien arma un envío de
// transporte local: dado un destino (y opcionalmente un tamaño de
// paquete), regresa las tarifas conocidas (puede haber más de un
// transportista) y si ese destino no tiene entrega a domicilio, dónde
// recoge el cliente. No reemplaza cotizar algo nuevo por teléfono/WhatsApp
// cuando el destino todavía no está en el catálogo — solo evita repetir la
// pregunta para uno ya conocido.
const cotizarQuerySchema = z.object({
  destinoId: z.coerce.number().int(),
  tamano: z.enum(TAMANOS_PAQUETE).optional(),
});

router.get('/cotizar', requireAuth, asyncHandler(async (req, res) => {
  const parsed = cotizarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Indica destinoId (y opcionalmente tamano).' });
  }

  const destino = await prisma.destinoEnvio.findUnique({
    where: { id: parsed.data.destinoId },
    include: { transportistaSugerido: true },
  });
  if (!destino) return res.status(404).json({ error: 'Destino no encontrado.' });

  const tarifas = await prisma.tarifaEnvio.findMany({
    where: {
      destinoId: destino.id,
      activo: true,
      ...(parsed.data.tamano ? { tamano: parsed.data.tamano } : {}),
    },
    include: { transportista: true },
    orderBy: { precio: 'asc' },
  });

  res.json({ destino, tarifas });
}));

const tarifaSchema = z.object({
  transportistaId: z.number().int(),
  destinoId: z.number().int(),
  tamano: z.enum(TAMANOS_PAQUETE),
  precio: z.number().nonnegative(),
  notas: z.string().optional().nullable(),
});

router.post('/tarifas', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = tarifaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  try {
    const tarifa = await prisma.tarifaEnvio.create({ data: parsed.data });
    res.status(201).json(tarifa);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Ya existe una tarifa para ese transportista, destino y tamaño (edítala en vez de duplicarla).',
      });
    }
    throw err;
  }
}));

router.put('/tarifas/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = tarifaSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const tarifa = await prisma.tarifaEnvio.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
  });
  res.json(tarifa);
}));

module.exports = router;
