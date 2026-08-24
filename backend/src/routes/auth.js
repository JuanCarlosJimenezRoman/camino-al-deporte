const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Límite de intentos de login del personal (por IP): sin esto, un login
// expuesto a internet es blanco fácil de fuerza bruta. 20 intentos / 15 min
// es holgado para alguien que se equivoca varias veces, pero corta un
// ataque automatizado. Mismo patrón que ya se usa en tienda/auth.js.
const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos e intenta de nuevo.' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/login
router.post('/login', limitarLogin, asyncHandler(async (req, res) => {
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

// PUT /auth/perfil - el usuario autenticado edita su propio nombre/email.
const perfilSchema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

router.put('/perfil', requireAuth, asyncHandler(async (req, res) => {
  const parsed = perfilSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'No hay cambios para guardar.' });
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id: req.usuario.id },
      data: parsed.data,
      include: { rol: true, sucursal: true },
    });
    res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol.nombre,
      sucursalId: usuario.sucursalId,
      sucursal: usuario.sucursal ? { id: usuario.sucursal.id, nombre: usuario.sucursal.nombre } : null,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
    }
    throw err;
  }
}));

// PUT /auth/perfil/password - el usuario autenticado cambia su propia
// contraseña, verificando primero la contraseña actual.
const passwordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(8),
});

router.put('/perfil/password', requireAuth, asyncHandler(async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { passwordActual, passwordNueva } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const passwordOk = await bcrypt.compare(passwordActual, usuario.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }

  const passwordHash = await bcrypt.hash(passwordNueva, 10);
  await prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash } });

  res.json({ ok: true });
}));

module.exports = router;
