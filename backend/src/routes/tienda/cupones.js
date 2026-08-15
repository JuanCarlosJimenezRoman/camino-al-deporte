const express = require('express');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');
const { buscarCupon, calcularDescuentoCupon, mensajeError } = require('../../utils/cupones');

const router = express.Router();

const validarSchema = z.object({
  codigo: z.string().min(1),
  items: z
    .array(
      z.object({
        varianteId: z.number().int(),
        cantidad: z.number().int().positive(),
      })
    )
    .min(1),
});

// POST /tienda/cupones/validar - vista previa del descuento antes de armar
// el pedido (se usa en el checkout, con lo que ya trae el carrito). Requiere
// sesión de cliente porque los límites de uso son por cliente. No registra
// nada: solo calcula "si aplicaras el cupón ahora mismo, esto pasaría" — el
// uso real se registra hasta que el pedido se crea de verdad (ver POST
// /tienda/pedidos), para no gastar un uso solo por vista previa.
router.post('/validar', requireClienteAuth, asyncHandler(async (req, res) => {
  const parsed = validarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  const { cupon, error } = await buscarCupon(prisma, parsed.data.codigo);
  if (error) return res.status(400).json({ error: mensajeError(error) });

  const variantes = await prisma.productoVariante.findMany({
    where: { id: { in: parsed.data.items.map((it) => it.varianteId) } },
    include: { producto: { select: { id: true, precioVenta: true } } },
  });
  const items = parsed.data.items
    .map((it) => {
      const variante = variantes.find((v) => v.id === it.varianteId);
      if (!variante) return null;
      return {
        productoId: variante.producto.id,
        cantidad: it.cantidad,
        precioUnitario: Number(variante.producto.precioVenta),
      };
    })
    .filter(Boolean);

  const resultado = await calcularDescuentoCupon(prisma, cupon, items, req.cliente.id);
  if (resultado.error) {
    return res.status(400).json({ error: resultado.mensaje || mensajeError(resultado.error) });
  }

  res.json({
    valido: true,
    codigo: cupon.codigo,
    tipoDescuento: cupon.tipoDescuento,
    montoDescuento: resultado.montoDescuento,
  });
}));

module.exports = router;
