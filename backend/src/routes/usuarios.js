const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Solo ADMIN_PRINCIPAL y DESARROLLO gestionan usuarios.
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

router.get('/', requireAuth, requireRole(...ROLES_ADMIN), asyncHandler(async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    include: { rol: true, sucursal: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(
    usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol.nombre,
      activo: u.activo,
      ultimoLogin: u.ultimoLogin,
      sucursalId: u.sucursalId,
      sucursal: u.sucursal ? u.sucursal.nombre : null,
    }))
  );
}));

const usuarioSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  rol: z.enum(['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA']),
  sucursalId: z.number().int().optional(),
});

router.post('/', requireAuth, requireRole(...ROLES_ADMIN), asyncHandler(async (req, res) => {
  const parsed = usuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { nombre, email, password, rol, sucursalId } = parsed.data;

  const rolRow = await prisma.rol.findUnique({ where: { nombre: rol } });
  if (!rolRow) return res.status(400).json({ error: 'Rol no válido.' });

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const usuario = await prisma.usuario.create({
      data: { nombre, email, passwordHash, rolId: rolRow.id, sucursalId },
    });
    res.status(201).json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
    }
    throw err;
  }
}));

router.put('/:id', requireAuth, requireRole(...ROLES_ADMIN), asyncHandler(async (req, res) => {
  const schema = z.object({
    nombre: z.string().min(1).optional(),
    rol: z.enum(['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA']).optional(),
    activo: z.boolean().optional(),
    password: z.string().min(8).optional(),
    sucursalId: z.number().int().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { rol, password, ...rest } = parsed.data;

  const data = { ...rest };
  if (rol) {
    const rolRow = await prisma.rol.findUnique({ where: { nombre: rol } });
    if (!rolRow) return res.status(400).json({ error: 'Rol no válido.' });
    data.rolId = rolRow.id;
  }
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const usuario = await prisma.usuario.update({ where: { id: Number(req.params.id) }, data });
  res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email });
}));

module.exports = router;
