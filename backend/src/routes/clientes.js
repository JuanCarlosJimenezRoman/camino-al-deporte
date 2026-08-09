const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién puede dar de alta/editar clientes y ver sus adeudos: los mismos
// roles que pueden vender/apartar.
const ROLES_CLIENTES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

// GET /clientes?q= - buscar por nombre o teléfono (para autocompletar al
// registrar un apartado)
router.get('/', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const { q } = req.query;
  const clientes = await prisma.cliente.findMany({
    where: q
      ? {
          OR: [
            { nombre: { contains: String(q), mode: 'insensitive' } },
            { telefono: { contains: String(q), mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { nombre: 'asc' },
  });
  res.json(clientes);
}));

// GET /clientes/:id - detalle de un cliente con sus apartados y saldo pendiente de cada uno
router.get('/:id', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      apartados: {
        include: {
          items: { include: { variante: { include: { producto: true, talla: true } } } },
          pagos: true,
          sucursalVenta: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const apartadosConSaldo = cliente.apartados.map((a) => {
    const pagado = a.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    return { ...a, pagado, saldoPendiente: Number(a.total) - pagado };
  });

  res.json({ ...cliente, apartados: apartadosConSaldo });
}));

const clienteSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  notas: z.string().optional(),
});

router.post('/', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const parsed = clienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { email, ...resto } = parsed.data;

  try {
    const cliente = await prisma.cliente.create({ data: { ...resto, email: email || undefined } });
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono.' });
    throw err;
  }
}));

router.put('/:id', requireAuth, requireRole(...ROLES_CLIENTES), asyncHandler(async (req, res) => {
  const parsed = clienteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { email, ...resto } = parsed.data;

  try {
    const cliente = await prisma.cliente.update({
      where: { id: Number(req.params.id) },
      data: { ...resto, ...(email !== undefined ? { email: email || null } : {}) },
    });
    res.json(cliente);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un cliente con ese teléfono.' });
    throw err;
  }
}));

module.exports = router;
