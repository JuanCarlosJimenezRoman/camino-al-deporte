const express = require('express');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// Todas las rutas de favoritos requieren sesión de cliente: es una lista
// personal, no tiene sentido guardarla para un visitante anónimo (a
// diferencia del carrito, que sí vive en el navegador sin cuenta).
router.use(requireClienteAuth);

// Mismo cálculo de stock que el catálogo público (ver routes/tienda/catalogo.js
// conStockTotal) para que la tarjeta de producto se vea igual en
// /tienda/favoritos que en el resto de la tienda (incluye el badge de
// "última pieza").
function conStockTotal(producto) {
  const variantes = producto.variantes.map((v) => {
    const stockTotal = v.existencias.reduce((acc, e) => acc + e.stockActual, 0);
    return { id: v.id, sku: v.sku, color: v.color, talla: v.talla, stockTotal };
  });
  const stockTotal = variantes.reduce((acc, v) => acc + v.stockTotal, 0);
  return {
    id: producto.id,
    nombre: producto.nombre,
    marca: producto.marca,
    categoria: producto.categoria,
    precioVenta: producto.precioVenta,
    imagenes: producto.imagenes,
    variantes,
    stockTotal,
  };
}

// GET /tienda/favoritos - productos favoritos del cliente autenticado, más
// recientes primero. Se incluyen aunque ya no tengan stock (a diferencia del
// catálogo): el cliente sigue queriendo ver qué guardó, para poder quitarlo
// o esperar a que vuelva a haber existencias.
router.get('/', asyncHandler(async (req, res) => {
  const favoritos = await prisma.clienteFavorito.findMany({
    where: { clienteId: req.cliente.id },
    orderBy: { createdAt: 'desc' },
    include: {
      producto: {
        include: {
          marca: true,
          categoria: true,
          imagenes: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] },
          variantes: {
            where: { activo: true },
            include: { talla: true, existencias: { select: { stockActual: true } } },
          },
        },
      },
    },
  });

  const productos = favoritos
    .filter((f) => f.producto && f.producto.activo)
    .map((f) => conStockTotal(f.producto));
  res.json(productos);
}));

// GET /tienda/favoritos/ids - solo los IDs de producto, para que el catálogo
// y el detalle de producto puedan pintar el corazón lleno sin traer todo el
// detalle de cada producto favorito.
router.get('/ids', asyncHandler(async (req, res) => {
  const favoritos = await prisma.clienteFavorito.findMany({
    where: { clienteId: req.cliente.id },
    select: { productoId: true },
  });
  res.json(favoritos.map((f) => f.productoId));
}));

// POST /tienda/favoritos/:productoId - agrega a favoritos (idempotente: si
// ya estaba, no truena ni duplica).
router.post('/:productoId', asyncHandler(async (req, res) => {
  const productoId = Number(req.params.productoId);
  const producto = await prisma.producto.findUnique({ where: { id: productoId } });
  if (!producto || !producto.activo) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  await prisma.clienteFavorito.upsert({
    where: { clienteId_productoId: { clienteId: req.cliente.id, productoId } },
    update: {},
    create: { clienteId: req.cliente.id, productoId },
  });
  res.status(201).json({ ok: true });
}));

// DELETE /tienda/favoritos/:productoId - quita de favoritos (idempotente).
router.delete('/:productoId', asyncHandler(async (req, res) => {
  const productoId = Number(req.params.productoId);
  await prisma.clienteFavorito.deleteMany({ where: { clienteId: req.cliente.id, productoId } });
  res.json({ ok: true });
}));

module.exports = router;
