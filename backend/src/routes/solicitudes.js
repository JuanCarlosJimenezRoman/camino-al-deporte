const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién puede aprobar/rechazar: los mismos roles que administran usuarios.
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];
// Quién puede ver la bandeja: admin (todas) + INVENTARIO (solo las suyas,
// para poder darle seguimiento a lo que pidió).
const ROLES_LECTURA = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

const INCLUDE_USUARIOS = {
  solicitadoPor: { select: { id: true, nombre: true } },
  revisadoPor: { select: { id: true, nombre: true } },
};

// Mapa tipo de solicitud -> modelo de Prisma sobre el que se aplica el
// cambio al aprobarse.
const MODELOS = {
  MARCA: prisma.marca,
  CATEGORIA: prisma.categoria,
  MODELO: prisma.modelo,
  TALLA: prisma.talla,
  PROVEEDOR: prisma.proveedor,
};

// GET /solicitudes?estado= - bandeja de solicitudes. ADMIN_PRINCIPAL/
// DESARROLLO ven todas; INVENTARIO solo ve las que él mismo creó.
router.get('/', requireAuth, requireRole(...ROLES_LECTURA), asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const esAdmin = ROLES_ADMIN.includes(req.usuario.rol);

  const solicitudes = await prisma.solicitudPermiso.findMany({
    where: {
      ...(estado ? { estado: String(estado) } : {}),
      ...(esAdmin ? {} : { solicitadoPorId: req.usuario.id }),
    },
    include: INCLUDE_USUARIOS,
    orderBy: { solicitadoAt: 'desc' },
  });

  res.json(solicitudes);
}));

// POST /solicitudes/:id/aprobar - aplica el cambio pendiente y marca la
// solicitud como aprobada.
router.post(
  '/:id/aprobar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const solicitud = await prisma.solicitudPermiso.findUnique({ where: { id: Number(req.params.id) } });
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(409).json({ error: 'Esta solicitud ya fue revisada.' });
    }

    const modelo = MODELOS[solicitud.tipo];
    if (!modelo) return res.status(400).json({ error: 'Tipo de solicitud no reconocido.' });

    // DESACTIVAR siempre implica { activo: false }; EDITAR aplica tal cual
    // los campos que se guardaron al crear la solicitud (puede incluir
    // activo: true si lo que se pidió fue reactivar).
    const data = solicitud.accion === 'DESACTIVAR' ? { activo: false } : solicitud.datosCambio || {};

    let actualizado;
    try {
      actualizado = await modelo.update({ where: { id: solicitud.entidadId }, data });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'No se pudo aplicar: ya existe un registro con esos datos.' });
      }
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'El registro original ya no existe.' });
      }
      throw err;
    }

    const actualizada = await prisma.solicitudPermiso.update({
      where: { id: solicitud.id },
      data: { estado: 'APROBADA', revisadoPorId: req.usuario.id, revisadoAt: new Date() },
      include: INCLUDE_USUARIOS,
    });

    res.json({ solicitud: actualizada, resultado: actualizado });
  })
);

// POST /solicitudes/:id/rechazar - descarta la solicitud sin aplicar nada.
router.post(
  '/:id/rechazar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const schema = z.object({ notaRevision: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const solicitud = await prisma.solicitudPermiso.findUnique({ where: { id: Number(req.params.id) } });
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    if (solicitud.estado !== 'PENDIENTE') {
      return res.status(409).json({ error: 'Esta solicitud ya fue revisada.' });
    }

    const actualizada = await prisma.solicitudPermiso.update({
      where: { id: solicitud.id },
      data: {
        estado: 'RECHAZADA',
        revisadoPorId: req.usuario.id,
        revisadoAt: new Date(),
        notaRevision: parsed.data.notaRevision || null,
      },
      include: INCLUDE_USUARIOS,
    });

    res.json(actualizada);
  })
);

module.exports = router;
