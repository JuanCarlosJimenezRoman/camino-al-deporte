const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');
const { enviarCodigoRecuperacion } = require('../../config/whatsapp');
const { enviarCodigoRecuperacionEmail } = require('../../config/email');

const router = express.Router();

// Límites para el flujo de "olvidé mi contraseña": son las dos únicas rutas
// públicas (sin sesión) de toda la tienda que, sin freno, se podrían usar
// para bombardear el correo de alguien a pedidos, o para adivinar por fuerza
// bruta un código de 6 dígitos dentro de su ventana de 10 minutos. Por IP,
// no por cuenta — no hace falta saber si el correo existe para aplicarlo.
const limitarOlvidePassword = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.' },
});
const limitarRestablecer = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

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

// 10 minutos: igual al tiempo de entrega por default que Meta le pone a las
// plantillas AUTHENTICATION (ver docs del ticket/WhatsApp) — no tiene caso
// que nuestro código dure más que la ventana en la que WhatsApp garantiza
// intentar entregarlo.
const CODIGO_VIGENCIA_MIN = 10;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Código numérico de 6 dígitos (con ceros a la izquierda si hace falta),
// como cualquier OTP típico — la plantilla AUTHENTICATION de Meta espera un
// código corto que el cliente pueda copiar/teclear a mano, no un link (ver
// config/whatsapp.js).
function generarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

const olvidePasswordSchema = z.object({
  email: z.string().email(),
});

// POST /tienda/auth/olvide-password
//
// Genera un código de un solo uso y lo manda por los canales que estén
// configurados: correo (config/email.js, el principal — no depende de
// aprobación de Meta) y WhatsApp (config/whatsapp.js, si más adelante se
// aprueba la plantilla AUTHENTICATION). Se intentan los dos, cada uno de
// forma independiente, así que si uno falla o no está configurado el otro
// sigue funcionando. La respuesta es siempre la misma exista o no la
// cuenta, para no revelar qué correos están registrados (mismo criterio
// que el resto del sistema).
router.post('/olvide-password', limitarOlvidePassword, asyncHandler(async (req, res) => {
  const parsed = olvidePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ingresa un correo válido.' });
  }

  const mensajeGenerico = {
    ok: true,
    mensaje: 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña.',
  };

  const cliente = await prisma.cliente.findFirst({ where: { email: parsed.data.email } });
  if (!cliente || !cliente.passwordHash || !cliente.activo) {
    return res.json(mensajeGenerico);
  }

  // Cualquier código anterior sin usar queda invalidado antes de crear el
  // nuevo: así nunca hay más de un código vigente por cliente al mismo
  // tiempo, aunque alguien pida varios seguidos (reduce la superficie para
  // adivinar por fuerza bruta).
  const codigo = generarCodigo();
  await prisma.$transaction([
    prisma.clienteResetToken.updateMany({
      where: { clienteId: cliente.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.clienteResetToken.create({
      data: {
        clienteId: cliente.id,
        tokenHash: hashToken(codigo),
        expiresAt: new Date(Date.now() + CODIGO_VIGENCIA_MIN * 60 * 1000),
      },
    }),
  ]);

  // Best-effort: si el envío falla o el canal no está configurado, el
  // código ya quedó creado y la respuesta al cliente no cambia (no
  // delatamos si la cuenta existe ni si el envío falló).
  try {
    await enviarCodigoRecuperacionEmail({
      email: cliente.email,
      nombre: cliente.nombre,
      codigo,
      vigenciaMin: CODIGO_VIGENCIA_MIN,
    });
  } catch (err) {
    console.error('Error enviando correo de recuperación de contraseña:', err);
  }
  try {
    const config = await prisma.configuracionTienda.findFirst();
    await enviarCodigoRecuperacion({
      phoneNumberId: config?.whatsappPhoneNumberId || null,
      telefonoCliente: cliente.telefono,
      codigo,
    });
  } catch (err) {
    console.error('Error enviando WhatsApp de recuperación de contraseña:', err);
  }

  res.json(mensajeGenerico);
}));

const restablecerSchema = z.object({
  email: z.string().email(),
  codigo: z.string().length(6, 'El código debe tener 6 dígitos.'),
  passwordNueva: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres.'),
});

// POST /tienda/auth/restablecer
//
// Se pide el email además del código (a diferencia del link anterior, que
// llevaba todo en el token): un código de 6 dígitos por sí solo no es lo
// bastante único como para buscarlo en toda la tabla sin riesgo de que
// choque con el de otro cliente — con el email acotamos la búsqueda a los
// códigos vigentes de esa cuenta.
router.post('/restablecer', limitarRestablecer, asyncHandler(async (req, res) => {
  const parsed = restablecerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { email, codigo, passwordNueva } = parsed.data;

  const mensajeError = { error: 'El código no es válido o ya expiró. Solicita uno nuevo.' };

  const cliente = await prisma.cliente.findFirst({ where: { email } });
  if (!cliente) {
    return res.status(400).json(mensajeError);
  }

  const registro = await prisma.clienteResetToken.findFirst({
    where: { clienteId: cliente.id, tokenHash: hashToken(codigo), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!registro) {
    return res.status(400).json(mensajeError);
  }

  const passwordHash = await bcrypt.hash(passwordNueva, 10);
  await prisma.$transaction([
    prisma.cliente.update({ where: { id: registro.clienteId }, data: { passwordHash } }),
    prisma.clienteResetToken.update({ where: { id: registro.id }, data: { usedAt: new Date() } }),
    // Cualquier otro código pendiente para este cliente también queda
    // inválido: si pidió otro código después, no debe poder usarse uno
    // anterior ya superado.
    prisma.clienteResetToken.updateMany({
      where: { clienteId: registro.clienteId, usedAt: null, id: { not: registro.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true });
}));

module.exports = router;
