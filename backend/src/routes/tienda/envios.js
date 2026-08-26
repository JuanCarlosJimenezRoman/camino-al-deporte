const express = require('express');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// Versión para clientes del motor de cotización de envío local dentro de
// Oaxaca (ver GET /envios/cotizar en routes/envios.js, la versión para
// staff, y el comentario extenso junto a CoberturaEnvio/TarifaEnvio en
// schema.prisma). Solo se usa desde el checkout de la tienda en línea
// cuando ConfiguracionTienda.envioDinamicoActivo está activo — con el flag
// apagado (default) el checkout no llama nada de este archivo y sigue
// cobrando el costo de envío fijo de siempre.
//
// Requiere sesión de cliente (no la de staff) porque el checkout ya exige
// estar logueado antes de llegar aquí — y así tampoco se expone el
// catálogo de rutas/cobertura a cualquiera sin cuenta.

// Tamaño usado para cotizar en el checkout mientras no exista una forma de
// calcular el tamaño real a partir de los productos del carrito (ver "Qué
// falta" en docs/ARQUITECTURA.md, sección de Envíos — resolverlo queda
// pendiente a propósito). MEDIANO como punto medio razonable: el costo real
// del envío puede corregirse después a mano cuando el staff lo despache
// (ver POST /pedidos-online/:id/marcar-enviado, que sigue permitiendo
// elegir una tarifa distinta con el tamaño correcto).
const TAMANO_CHECKOUT_DEFAULT = 'MEDIANO';

// GET /tienda/envios/destinos - catálogo de destinos activos, para que el
// cliente elija el suyo en el checkout cuando compra dentro de Oaxaca.
router.get('/destinos', requireClienteAuth, asyncHandler(async (req, res) => {
  const destinos = await prisma.destinoEnvio.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, municipio: true },
    orderBy: [{ municipio: 'asc' }, { nombre: 'asc' }],
  });
  res.json(destinos);
}));

// GET /tienda/envios/cotizar?destinoId= - opciones de envío conocidas hacia
// un destino, ya con precio. A diferencia de la versión de staff, esta
// nunca expone costoReal (el costo interno no es algo que el cliente deba
// ver) y fija el tamaño de paquete al default de arriba en vez de pedírselo
// al cliente.
const cotizarQuerySchema = z.object({ destinoId: z.coerce.number().int() });

router.get('/cotizar', requireClienteAuth, asyncHandler(async (req, res) => {
  const parsed = cotizarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Indica destinoId.' });
  }

  const destino = await prisma.destinoEnvio.findUnique({ where: { id: parsed.data.destinoId } });
  if (!destino || !destino.activo) {
    return res.status(404).json({ error: 'Destino no encontrado.' });
  }

  const coberturas = await prisma.coberturaEnvio.findMany({
    where: { destinoEnvioId: destino.id, activo: true },
    include: {
      rutaEnvio: { include: { transportista: true } },
      puntoEntrega: true,
      tarifas: { where: { activo: true, tamano: TAMANO_CHECKOUT_DEFAULT } },
    },
    orderBy: { prioridad: 'asc' },
  });

  const opciones = [];
  for (const cobertura of coberturas) {
    for (const tarifa of cobertura.tarifas) {
      opciones.push({
        tarifaId: tarifa.id,
        transportista: { nombre: cobertura.rutaEnvio.transportista.nombre },
        tipoEntrega: cobertura.tipoEntrega,
        puntoEntrega: cobertura.puntoEntrega
          ? { nombre: cobertura.puntoEntrega.nombre, direccion: cobertura.puntoEntrega.direccion }
          : null,
        precioCliente: tarifa.precioCliente,
      });
    }
  }
  opciones.sort((a, b) => Number(a.precioCliente) - Number(b.precioCliente));

  res.json({
    estado: opciones.length > 0 ? 'DISPONIBLE' : 'COTIZACION_MANUAL',
    destino: { id: destino.id, nombre: destino.nombre, municipio: destino.municipio },
    opciones,
  });
}));

module.exports = router;
