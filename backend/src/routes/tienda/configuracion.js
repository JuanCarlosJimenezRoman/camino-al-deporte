const express = require('express');
const prisma = require('../../db');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// GET /tienda/configuracion - datos públicos que el checkout necesita antes
// de crear el pedido. Por ahora solo el costo de envío fijo (ver
// routes/configuracionTienda.js, donde el negocio lo edita).
router.get('/', asyncHandler(async (req, res) => {
  const config = await prisma.configuracionTienda.findFirst();
  res.json({ costoEnvio: config?.costoEnvio ?? 0 });
}));

module.exports = router;
