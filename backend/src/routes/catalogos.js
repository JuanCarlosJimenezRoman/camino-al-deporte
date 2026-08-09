const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// ---- Marcas ----------------------------------------------------------

router.get('/marcas', requireAuth, async (req, res) => {
  const marcas = await prisma.marca.findMany({ orderBy: { nombre: 'asc' } });
  res.json(marcas);
});

router.post('/marcas', requireAuth, requireRole(...ROLES_EDICION), async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  const marca = await prisma.marca.create({ data: { nombre: parsed.data.nombre } });
  res.status(201).json(marca);
});

// ---- Modelos -----------------------------------------------------------

router.get('/modelos', requireAuth, async (req, res) => {
  const { marcaId } = req.query;
  const modelos = await prisma.modelo.findMany({
    where: marcaId ? { marcaId: Number(marcaId) } : undefined,
    orderBy: { nombre: 'asc' },
  });
  res.json(modelos);
});

router.post('/modelos', requireAuth, requireRole(...ROLES_EDICION), async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1), marcaId: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'nombre y marcaId son requeridos.' });

  const modelo = await prisma.modelo.create({ data: parsed.data });
  res.status(201).json(modelo);
});

// ---- Categorías ----------------------------------------------------------

router.get('/categorias', requireAuth, async (req, res) => {
  const categorias = await prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });
  res.json(categorias);
});

router.post('/categorias', requireAuth, requireRole(...ROLES_EDICION), async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  const categoria = await prisma.categoria.create({ data: { nombre: parsed.data.nombre } });
  res.status(201).json(categoria);
});

// ---- Tallas ----------------------------------------------------------

router.get('/tallas', requireAuth, async (req, res) => {
  const { tipo } = req.query;
  const tallas = await prisma.talla.findMany({
    where: tipo ? { tipo: String(tipo) } : undefined,
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
  });
  res.json(tallas);
});

router.post('/tallas', requireAuth, requireRole(...ROLES_EDICION), async (req, res) => {
  const schema = z.object({
    valor: z.string().min(1),
    tipo: z.string().min(1),
    orden: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'valor y tipo son requeridos.' });

  const talla = await prisma.talla.create({ data: parsed.data });
  res.status(201).json(talla);
});

// ---- Campos personalizados (rol DESARROLLO) ---------------------------

router.get('/campos-personalizados', requireAuth, async (req, res) => {
  const { entidad } = req.query;
  const campos = await prisma.campoPersonalizado.findMany({
    where: { activo: true, ...(entidad ? { entidad: String(entidad) } : {}) },
  });
  res.json(campos);
});

router.post(
  '/campos-personalizados',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  async (req, res) => {
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
  }
);

module.exports = router;
