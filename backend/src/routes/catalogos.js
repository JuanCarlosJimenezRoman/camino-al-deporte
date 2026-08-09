const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// ---- Marcas ----------------------------------------------------------

// ?todas=1 incluye marcas inactivas (dadas de baja); por defecto solo activas.
router.get('/marcas', requireAuth, asyncHandler(async (req, res) => {
  const marcas = await prisma.marca.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(marcas);
}));

router.post('/marcas', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  try {
    const marca = await prisma.marca.create({ data: { nombre: parsed.data.nombre } });
    res.status(201).json(marca);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una marca con ese nombre.' });
    throw err;
  }
}));

router.put('/marcas/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  try {
    const marca = await prisma.marca.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(marca);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una marca con ese nombre.' });
    throw err;
  }
}));

// ---- Modelos -----------------------------------------------------------

router.get('/modelos', requireAuth, asyncHandler(async (req, res) => {
  const { marcaId } = req.query;
  const modelos = await prisma.modelo.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
    },
    orderBy: { nombre: 'asc' },
  });
  res.json(modelos);
}));

router.post('/modelos', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1), marcaId: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'nombre y marcaId son requeridos.' });

  try {
    const modelo = await prisma.modelo.create({ data: parsed.data });
    res.status(201).json(modelo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe ese modelo para esta marca.' });
    throw err;
  }
}));

router.put('/modelos/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  const modelo = await prisma.modelo.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(modelo);
}));

// ---- Categorías ----------------------------------------------------------

router.get('/categorias', requireAuth, asyncHandler(async (req, res) => {
  const categorias = await prisma.categoria.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(categorias);
}));

router.post('/categorias', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  try {
    const categoria = await prisma.categoria.create({ data: { nombre: parsed.data.nombre } });
    res.status(201).json(categoria);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

router.put('/categorias/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  try {
    const categoria = await prisma.categoria.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(categoria);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

// ---- Tallas ----------------------------------------------------------

router.get('/tallas', requireAuth, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  const tallas = await prisma.talla.findMany({
    where: tipo ? { tipo: String(tipo) } : undefined,
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
  });
  res.json(tallas);
}));

router.post('/tallas', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({
    valor: z.string().min(1),
    tipo: z.string().min(1),
    orden: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'valor y tipo son requeridos.' });

  try {
    const talla = await prisma.talla.create({ data: parsed.data });
    res.status(201).json(talla);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Esa talla ya existe para ese tipo.' });
    throw err;
  }
}));

router.put('/tallas/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({
    valor: z.string().min(1).optional(),
    tipo: z.string().min(1).optional(),
    orden: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  try {
    const talla = await prisma.talla.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(talla);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Esa talla ya existe para ese tipo.' });
    throw err;
  }
}));

// ---- Cuentas de transferencia (dónde se reciben los pagos por transferencia) --

// Es información sensible/financiera: solo ADMIN_PRINCIPAL/DESARROLLO la
// editan. Cualquier rol autenticado puede listarla (VENTAS la necesita para
// elegir la cuenta al registrar un pago por transferencia).
router.get('/cuentas-transferencia', requireAuth, asyncHandler(async (req, res) => {
  const cuentas = await prisma.cuentaTransferencia.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(cuentas);
}));

const cuentaTransferenciaSchema = z.object({
  nombre: z.string().min(1),
  banco: z.string().optional(),
  titular: z.string().optional(),
  numeroCuenta: z.string().optional(),
  // Si es true, esta cuenta (y su CLABE) se le muestra al cliente al pagar
  // un pedido en la tienda en línea (ver routes/tienda/pedidos.js).
  paraVentasOnline: z.boolean().optional(),
});

router.post(
  '/cuentas-transferencia',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const parsed = cuentaTransferenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const cuenta = await prisma.cuentaTransferencia.create({ data: parsed.data });
    res.status(201).json(cuenta);
  })
);

router.put(
  '/cuentas-transferencia/:id',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const parsed = cuentaTransferenciaSchema
      .partial()
      .extend({ activo: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const cuenta = await prisma.cuentaTransferencia.update({
      where: { id: Number(req.params.id) },
      data: parsed.data,
    });
    res.json(cuenta);
  })
);

// ---- Campos personalizados (rol DESARROLLO) ---------------------------

router.get('/campos-personalizados', requireAuth, asyncHandler(async (req, res) => {
  const { entidad } = req.query;
  const campos = await prisma.campoPersonalizado.findMany({
    where: { activo: true, ...(entidad ? { entidad: String(entidad) } : {}) },
  });
  res.json(campos);
}));

router.post(
  '/campos-personalizados',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      entidad: z.string().min(1),
      clave: z.string().min(1),
      etiqueta: z.string().min(1),
      tipo: z.enum(['TEXTO', 'NUMERO', 'BOOLEANO', 'FECHA', 'SELECT']),
      opciones: z.array(z.string()).optional(),
      requerido: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const campo = await prisma.campoPersonalizado.create({ data: parsed.data });
    res.status(201).json(campo);
  })
);

module.exports = router;
