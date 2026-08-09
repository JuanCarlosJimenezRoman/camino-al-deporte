const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email y password son requeridos.' });
  }
  const { email, password } = parsed.data;

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { rol: true },
  });

  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol.nombre, sucursalId: usuario.sucursalId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoLogin: new Date() },
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol.nombre,
      sucursalId: usuario.sucursalId,
    },
  });
}));

// GET /auth/me - devuelve el usuario autenticado (para que el frontend
// sepa qué vista/rol mostrar al cargar la app).
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    include: { rol: true, sucursal: true },
  });
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

  res.json({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol.nombre,
    sucursalId: usuario.sucursalId,
    sucursal: usuario.sucursal ? { id: usuario.sucursal.id, nombre: usuario.sucursal.nombre } : null,
  });
}));

module.exports = router;
