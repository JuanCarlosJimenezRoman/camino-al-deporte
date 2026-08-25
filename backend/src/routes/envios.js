const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién administra el catálogo de envíos (transportistas, rutas, puntos de
// entrega, destinos, cobertura, tarifas): los mismos roles que ya capturan
// pedidos manuales y los marcan como enviados (ver ROLES_PEDIDOS_MANUAL en
// routes/pedidosOnline.js), porque en la práctica son quienes se enteran de
// una ruta, un punto de entrega o un precio nuevo mientras cotizan con un
// cliente por WhatsApp. A diferencia de los catálogos de mercancía
// (routes/catalogos.js), esto no afecta qué se vende ni datos bancarios,
// así que no pasa por una solicitud de aprobación.
const ROLES_ENVIOS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

const TIPOS_TRANSPORTISTA = ['PAQUETERIA', 'AUTOBUS', 'SUBURBAN', 'TAXI', 'LINEA_TRANSPORTE', 'OTRO'];
const TAMANOS_PAQUETE = ['CHICO', 'MEDIANO', 'GRANDE', 'EXTRA_GRANDE'];
const TIPOS_ENTREGA = ['DOMICILIO', 'PUNTO_RECOLECCION', 'COTIZACION_MANUAL'];

// ---------------------------------------------------------------------
// Transportistas
// ---------------------------------------------------------------------

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
// Rutas: qué transportista cubre qué tramo, saliendo de qué sucursal
// ---------------------------------------------------------------------

const RUTA_INCLUDE = {
  sucursalOrigen: { select: { id: true, nombre: true } },
  transportista: true,
  puntos: {
    where: { activo: true },
    include: { puntoEntrega: true },
    orderBy: { orden: 'asc' },
  },
};

router.get('/rutas', requireAuth, asyncHandler(async (req, res) => {
  const { sucursalOrigenId, transportistaId } = req.query;
  const rutas = await prisma.rutaEnvio.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(sucursalOrigenId ? { sucursalOrigenId: Number(sucursalOrigenId) } : {}),
      ...(transportistaId ? { transportistaId: Number(transportistaId) } : {}),
    },
    include: RUTA_INCLUDE,
    orderBy: { nombre: 'asc' },
  });
  res.json(rutas);
}));

router.get('/rutas/:id', requireAuth, asyncHandler(async (req, res) => {
  const ruta = await prisma.rutaEnvio.findUnique({
    where: { id: Number(req.params.id) },
    include: RUTA_INCLUDE,
  });
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  res.json(ruta);
}));

const rutaSchema = z.object({
  nombre: z.string().min(1),
  sucursalOrigenId: z.number().int(),
  transportistaId: z.number().int(),
  notas: z.string().optional().nullable(),
});

router.post('/rutas', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = rutaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const ruta = await prisma.rutaEnvio.create({ data: parsed.data, include: RUTA_INCLUDE });
  res.status(201).json(ruta);
}));

router.put('/rutas/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = rutaSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const ruta = await prisma.rutaEnvio.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
    include: RUTA_INCLUDE,
  });
  res.json(ruta);
}));

// POST /rutas/:id/puntos - agrega un punto de entrega a la ruta (con su
// orden en la secuencia). PUT para reordenar/desactivar un renglón puntual.
const rutaPuntoSchema = z.object({
  puntoEntregaId: z.number().int(),
  orden: z.number().int().optional(),
});

router.post('/rutas/:id/puntos', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = rutaPuntoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  try {
    const rutaPunto = await prisma.rutaPuntoEntrega.create({
      data: { rutaEnvioId: Number(req.params.id), ...parsed.data },
      include: { puntoEntrega: true },
    });
    res.status(201).json(rutaPunto);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ese punto de entrega ya está en esta ruta.' });
    }
    throw err;
  }
}));

router.put(
  '/rutas/:id/puntos/:rutaPuntoId',
  requireAuth,
  requireRole(...ROLES_ENVIOS),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ orden: z.number().int().optional(), activo: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const rutaPunto = await prisma.rutaPuntoEntrega.update({
      where: { id: Number(req.params.rutaPuntoId) },
      data: parsed.data,
      include: { puntoEntrega: true },
    });
    res.json(rutaPunto);
  })
);

// ---------------------------------------------------------------------
// Puntos de entrega: lugares físicos reutilizables (terminal, agencia...)
// ---------------------------------------------------------------------

router.get('/puntos-entrega', requireAuth, asyncHandler(async (req, res) => {
  const { municipio } = req.query;
  const puntos = await prisma.puntoEntrega.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(municipio ? { municipio: { contains: String(municipio), mode: 'insensitive' } } : {}),
    },
    orderBy: { nombre: 'asc' },
  });
  res.json(puntos);
}));

const puntoEntregaSchema = z.object({
  nombre: z.string().min(1),
  estadoMx: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  localidad: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

router.post('/puntos-entrega', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = puntoEntregaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const punto = await prisma.puntoEntrega.create({ data: parsed.data });
  res.status(201).json(punto);
}));

router.put('/puntos-entrega/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = puntoEntregaSchema.partial().extend({ activo: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const punto = await prisma.puntoEntrega.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(punto);
}));

// ---------------------------------------------------------------------
// Destinos: la ubicación del cliente que queremos atender
// ---------------------------------------------------------------------

router.get('/destinos', requireAuth, asyncHandler(async (req, res) => {
  const { municipio } = req.query;
  const destinos = await prisma.destinoEnvio.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(municipio ? { municipio: { contains: String(municipio), mode: 'insensitive' } } : {}),
    },
    orderBy: [{ municipio: 'asc' }, { nombre: 'asc' }],
  });
  res.json(destinos);
}));

// GET /envios/destinos/:id - detalle + cobertura conocida hacia ese destino
// (cada opción con su ruta/transportista/punto de entrega y tarifas).
router.get('/destinos/:id', requireAuth, asyncHandler(async (req, res) => {
  const destino = await prisma.destinoEnvio.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      coberturas: {
        where: { activo: true },
        include: {
          rutaEnvio: { include: { sucursalOrigen: { select: { id: true, nombre: true } }, transportista: true } },
          puntoEntrega: true,
          tarifas: { where: { activo: true }, orderBy: { tamano: 'asc' } },
        },
        orderBy: { prioridad: 'asc' },
      },
    },
  });
  if (!destino) return res.status(404).json({ error: 'Destino no encontrado.' });
  res.json(destino);
}));

const destinoSchema = z.object({
  nombre: z.string().min(1),
  estadoMx: z.string().optional().nullable(),
  municipio: z.string().min(1),
  localidad: z.string().optional().nullable(),
  codigoPostal: z.string().optional().nullable(),
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
    const destino = await prisma.destinoEnvio.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(destino);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un destino con ese nombre en ese municipio.' });
    }
    throw err;
  }
}));

// ---------------------------------------------------------------------
// Cobertura: una forma válida de atender un destino (ruta + tipo de
// entrega + punto de entrega si aplica). Un destino puede tener varias.
// ---------------------------------------------------------------------

const COBERTURA_INCLUDE = {
  destinoEnvio: true,
  rutaEnvio: { include: { sucursalOrigen: { select: { id: true, nombre: true } }, transportista: true } },
  puntoEntrega: true,
  tarifas: { where: { activo: true }, orderBy: { tamano: 'asc' } },
};

router.get('/coberturas', requireAuth, asyncHandler(async (req, res) => {
  const { destinoId, rutaId } = req.query;
  const coberturas = await prisma.coberturaEnvio.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(destinoId ? { destinoEnvioId: Number(destinoId) } : {}),
      ...(rutaId ? { rutaEnvioId: Number(rutaId) } : {}),
    },
    include: COBERTURA_INCLUDE,
    orderBy: { prioridad: 'asc' },
  });
  res.json(coberturas);
}));

const coberturaSchema = z
  .object({
    destinoEnvioId: z.number().int(),
    rutaEnvioId: z.number().int(),
    tipoEntrega: z.enum(TIPOS_ENTREGA),
    puntoEntregaId: z.number().int().optional().nullable(),
    prioridad: z.number().int().optional(),
    notas: z.string().optional().nullable(),
  })
  .refine((datos) => datos.tipoEntrega !== 'PUNTO_RECOLECCION' || !!datos.puntoEntregaId, {
    message: 'Si la entrega es en un punto de recolección, indica cuál.',
    path: ['puntoEntregaId'],
  });

router.post('/coberturas', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = coberturaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const datos = { ...parsed.data };
  if (datos.tipoEntrega !== 'PUNTO_RECOLECCION') datos.puntoEntregaId = null;
  try {
    const cobertura = await prisma.coberturaEnvio.create({ data: datos, include: COBERTURA_INCLUDE });
    res.status(201).json(cobertura);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una cobertura para ese destino con esa ruta.' });
    }
    throw err;
  }
}));

const coberturaUpdateSchema = z.object({
  tipoEntrega: z.enum(TIPOS_ENTREGA).optional(),
  puntoEntregaId: z.number().int().optional().nullable(),
  prioridad: z.number().int().optional(),
  notas: z.string().optional().nullable(),
  activo: z.boolean().optional(),
});

router.put('/coberturas/:id', requireAuth, requireRole(...ROLES_ENVIOS), asyncHandler(async (req, res) => {
  const parsed = coberturaUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const datos = { ...parsed.data };
  if (datos.tipoEntrega && datos.tipoEntrega !== 'PUNTO_RECOLECCION') datos.puntoEntregaId = null;
  if (datos.tipoEntrega === 'PUNTO_RECOLECCION' && datos.puntoEntregaId === undefined) {
    const actual = await prisma.coberturaEnvio.findUnique({ where: { id: Number(req.params.id) } });
    if (!actual?.puntoEntregaId) {
      return res.status(400).json({ error: 'Si la entrega es en un punto de recolección, indica cuál.' });
    }
  }
  const cobertura = await prisma.coberturaEnvio.update({
    where: { id: Number(req.params.id) },
    data: datos,
    include: COBERTURA_INCLUDE,
  });
  res.json(cobertura);
}));

// ---------------------------------------------------------------------
// Tarifas: precio de una cobertura por tamaño de paquete
// ---------------------------------------------------------------------

router.get('/tarifas', requireAuth, asyncHandler(async (req, res) => {
  const { coberturaId } = req.query;
  const tarifas = await prisma.tarifaEnvio.findMany({
    where: {
      activo: true,
      ...(coberturaId ? { coberturaEnvioId: Number(coberturaId) } : {}),
    },
    include: { coberturaEnvio: { include: COBERTURA_INCLUDE } },
    orderBy: [{ coberturaEnvioId: 'asc' }, { tamano: 'asc' }],
  });
  res.json(tarifas);
}));

const tarifaSchema = z.object({
  coberturaEnvioId: z.number().int(),
  tamano: z.enum(TAMANOS_PAQUETE),
  costoReal: z.number().nonnegative(),
  precioCliente: z.number().nonnegative(),
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
        error: 'Ya existe una tarifa para esa cobertura y tamaño (edítala en vez de duplicarla).',
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

// ---------------------------------------------------------------------
// Motor de cotización (regional): dado un destino conocido y opcionalmente
// un tamaño de paquete, arma la lista de opciones válidas (una por
// cobertura activa con tarifa activa) — carrier/tipo de entrega/punto de
// entrega/precio, ordenadas por prioridad y luego por precio. Esta es la
// forma de respuesta ("ShippingOption") que después también debería
// devolver la cotización nacional cuando se integre una API externa (ver
// comentario junto a CoberturaEnvio en schema.prisma) — hoy paquetería
// nacional no pasa por aquí, sigue su camino simple y manual.
//
// Si el destino no tiene ninguna cobertura activa (o ninguna con tarifa
// para el tamaño pedido), responde estado COTIZACION_MANUAL en vez de una
// lista vacía silenciosa — es la señal de "nadie ha cargado todavía cómo
// se atiende este lugar, hay que cotizarlo a mano".
const cotizarQuerySchema = z.object({
  destinoId: z.coerce.number().int(),
  tamano: z.enum(TAMANOS_PAQUETE).optional(),
});

router.get('/cotizar', requireAuth, asyncHandler(async (req, res) => {
  const parsed = cotizarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Indica destinoId (y opcionalmente tamano).' });
  }

  const destino = await prisma.destinoEnvio.findUnique({ where: { id: parsed.data.destinoId } });
  if (!destino) return res.status(404).json({ error: 'Destino no encontrado.' });

  const coberturas = await prisma.coberturaEnvio.findMany({
    where: { destinoEnvioId: destino.id, activo: true },
    include: {
      rutaEnvio: { include: { sucursalOrigen: { select: { id: true, nombre: true } }, transportista: true } },
      puntoEntrega: true,
      tarifas: {
        where: { activo: true, ...(parsed.data.tamano ? { tamano: parsed.data.tamano } : {}) },
      },
    },
    orderBy: { prioridad: 'asc' },
  });

  const opciones = [];
  for (const cobertura of coberturas) {
    for (const tarifa of cobertura.tarifas) {
      opciones.push({
        coberturaId: cobertura.id,
        rutaId: cobertura.rutaEnvio.id,
        rutaNombre: cobertura.rutaEnvio.nombre,
        sucursalOrigen: cobertura.rutaEnvio.sucursalOrigen,
        transportista: { id: cobertura.rutaEnvio.transportista.id, nombre: cobertura.rutaEnvio.transportista.nombre },
        tipoEntrega: cobertura.tipoEntrega,
        puntoEntrega: cobertura.puntoEntrega
          ? { id: cobertura.puntoEntrega.id, nombre: cobertura.puntoEntrega.nombre, direccion: cobertura.puntoEntrega.direccion }
          : null,
        tamano: tarifa.tamano,
        tarifaId: tarifa.id,
        precioCliente: tarifa.precioCliente,
        costoReal: tarifa.costoReal,
      });
    }
  }
  opciones.sort((a, b) => Number(a.precioCliente) - Number(b.precioCliente));

  res.json({
    estado: opciones.length > 0 ? 'DISPONIBLE' : 'COTIZACION_MANUAL',
    destino,
    opciones,
  });
}));

module.exports = router;
