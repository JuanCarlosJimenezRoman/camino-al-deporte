const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// GET /notificaciones?soloNoLeidas=true - las del usuario autenticado, más
// recientes primero. Cada usuario solo ve las suyas (no hay noción de
// notificaciones "compartidas": si le interesan a varios, se crea un
// renglón por persona — ver utils/notificaciones.js).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { soloNoLeidas } = req.query;
  const notificaciones = await prisma.notificacion.findMany({
    where: {
      usuarioId: req.usuario.id,
      ...(soloNoLeidas === 'true' ? { leida: false } : {}),
    },
    include: {
      transferencia: {
        select: {
          id: true,
          folio: true,
          estado: true,
          sucursalOrigen: { select: { nombre: true } },
          sucursalDestino: { select: { nombre: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notificaciones);
}));

// PUT /notificaciones/:id/leida - marca una sola como leída.
router.put('/:id/leida', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  // where con usuarioId incluido: así un usuario no puede marcar como leída
  // (ni de paso confirmar que existe) una notificación ajena.
  const resultado = await prisma.notificacion.updateMany({
    where: { id, usuarioId: req.usuario.id },
    data: { leida: true },
  });
  if (resultado.count === 0) return res.status(404).json({ error: 'Notificación no encontrada.' });
  res.json({ ok: true });
}));

// PUT /notificaciones/leer-todas - marca todas las del usuario como leídas.
router.put('/leer-todas', requireAuth, asyncHandler(async (req, res) => {
  await prisma.notificacion.updateMany({
    where: { usuarioId: req.usuario.id, leida: false },
    data: { leida: true },
  });
  res.json({ ok: true });
}));

module.exports = router;
