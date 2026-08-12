const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Mismos roles que administran pedidos en línea: las reseñas son parte de
// esa misma operación (ver routes/pedidosOnline.js).
const ROLES_RESENAS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

// GET /resenas - todas las reseñas de clientes, más recientes primero. Solo
// las ve el negocio por ahora (no hay una vista pública de reseñas todavía).
router.get('/', requireAuth, requireRole(...ROLES_RESENAS), asyncHandler(async (req, res) => {
  const resenas = await prisma.pedidoResena.findMany({
    include: {
      fotos: true,
      pedido: {
        select: {
          id: true,
          folio: true,
          cliente: { select: { nombre: true } },
          items: {
            select: {
              variante: { select: { producto: { select: { nombre: true } } } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(resenas);
}));

module.exports = router;
