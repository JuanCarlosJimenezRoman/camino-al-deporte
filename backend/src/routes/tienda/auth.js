const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

function firmar(cliente) {
  return jwt.sign(
    { id: cliente.id, email: cliente.email, nombre: cliente.nombre, tipo: 'cliente' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN_CLIENTE || '30d' }
  );
}

function publico(cliente) {
  const { passwordHash, ...resto } = cliente;
  return resto;
}

const registroSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

// POST /tienda/auth/registro
//
// Si ya existe un Cliente con ese email o teléfono (por ejemplo, dado de
// alta por un vendedor al hacer un apartado en tienda física) y todavía no
// tiene contraseña, este registro "reclama" esa cuenta en vez de duplicarla
// — así el cliente ve su historial de apartados junto con sus pedidos en
// línea. Si el registro ya tiene contraseña, se rechaza (ya existe cuenta).
router.post('/registro', asyncHandler(async (req, res) => {
  const parsed = registroSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { nombre, telefono, email, password } = parsed.data;

  const existente = await prisma.cliente.findFirst({ where: { OR: [{ email }, { telefono }] } });
  if (existente && existente.passwordHash) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo o teléfono. Intenta iniciar sesión.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let cliente;
  try {
    if (existente) {
      cliente = await prisma.cliente.update({
        where: { id: existente.id },
        data: { nombre, telefono, email, passwordHash, activo: true },
      });
    } else {
      cliente = await prisma.cliente.create({ data: { nombre, telefono, email, passwordHash } });
    }
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono.' });
    throw err;
  }

  res.status(201).json({ token: firmar(cliente), cliente: publico(cliente) });
}));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /tienda/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email y password son requeridos.' });
  }
  const { email, password } = parsed.data;

  const cliente = await prisma.cliente.findFirst({ where: { email } });
  if (!cliente || !cliente.passwordHash || !cliente.activo) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const passwordOk = await bcrypt.compare(password, cliente.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  res.json({ token: firmar(cliente), cliente: publico(cliente) });
}));

// GET /tienda/auth/me
router.get('/me', requireClienteAuth, asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.cliente.id } });
  if (!cliente || !cliente.activo) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  res.json(publico(cliente));
}));

const perfilSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().email(),
});

// PUT /tienda/auth/me - el cliente edita sus propios datos
router.put('/me', requireClienteAuth, asyncHandler(async (req, res) => {
  const parsed = perfilSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { nombre, telefono, email } = parsed.data;

  // El teléfono es la clave natural del Cliente (ver modelo): si ya lo usa
  // otra cuenta, no se permite el cambio.
  const enUso = await prisma.cliente.findFirst({ where: { telefono, NOT: { id: req.cliente.id } } });
  if (enUso) {
    return res.status(409).json({ error: 'Ese teléfono ya está en uso por otra cuenta.' });
  }

  try {
    const actualizado = await prisma.cliente.update({
      where: { id: req.cliente.id },
      data: { nombre, telefono, email },
    });
    res.json(publico(actualizado));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ese teléfono ya está en uso por otra cuenta.' });
    throw err;
  }
}));

const passwordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
});

// PUT /tienda/auth/password - el cliente cambia su contraseña (pide la
// actual para confirmar que es él quien la está cambiando).
router.put('/password', requireClienteAuth, asyncHandler(async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: req.cliente.id } });
  if (!cliente || !cliente.passwordHash) {
    return res.status(404).json({ error: 'Cuenta no encontrada.' });
  }

  const passwordOk = await bcrypt.compare(parsed.data.passwordActual, cliente.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.passwordNueva, 10);
  await prisma.cliente.update({ where: { id: cliente.id }, data: { passwordHash } });
  res.json({ ok: true });
}));

module.exports = router;
