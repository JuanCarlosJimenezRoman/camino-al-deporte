const express = require('express');
const prisma = require('../../db');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// Solo el primer nombre: son testimonios públicos y el cliente nunca dio
// consentimiento explícito de mostrar su nombre completo o teléfono al
// escribir su reseña.
function primerNombre(nombreCompleto) {
  return (nombreCompleto || '').trim().split(/\s+/)[0] || 'Cliente';
}

// GET /tienda/resenas?productoId= - testimonios públicos (sin autenticación)
// para mostrar en el catálogo o en el detalle de un producto. Solo reseñas
// marcadas como visibles (ver routes/resenas.js, donde el negocio puede
// ocultar alguna puntual).
router.get('/', asyncHandler(async (req, res) => {
  const { productoId } = req.query;

  const resenas = await prisma.pedidoResena.findMany({
    where: {
      visible: true,
      ...(productoId
        ? { pedido: { items: { some: { variante: { productoId: Number(productoId) } } } } }
        : {}),
    },
    include: {
      fotos: { select: { url: true } },
      pedido: {
        select: {
          cliente: { select: { nombre: true } },
          items: {
            select: { variante: { select: { producto: { select: { nombre: true } } } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const publicas = resenas.map((r) => ({
    id: r.id,
    calificacionProducto: r.calificacionProducto,
    calificacionEnvio: r.calificacionEnvio,
    comentario: r.comentario,
    createdAt: r.createdAt,
    fotos: r.fotos,
    clienteNombre: primerNombre(r.pedido.cliente?.nombre),
    productos: [...new Set(r.pedido.items.map((it) => it.variante.producto.nombre))],
  }));

  res.json(publicas);
}));

module.exports = router;
