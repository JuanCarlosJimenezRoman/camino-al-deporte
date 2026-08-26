const express = require('express');
const prisma = require('../../db');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// GET /tienda/configuracion - datos públicos que el checkout necesita antes
// de crear el pedido: el costo de envío fijo, y si el envío dinámico (ver
// ConfiguracionTienda.envioDinamicoActivo en schema.prisma) está activo —
// con eso el checkout decide si vale la pena ofrecerle al cliente elegir un
// destino dentro de Oaxaca (ver routes/tienda/envios.js) o simplemente
// mostrar el monto fijo de siempre (ver routes/configuracionTienda.js,
// donde el negocio edita ambos).
router.get('/', asyncHandler(async (req, res) => {
  const config = await prisma.configuracionTienda.findFirst();
  res.json({
    costoEnvio: config?.costoEnvio ?? 0,
    envioDinamicoActivo: config?.envioDinamicoActivo ?? false,
  });
}));

module.exports = router;
