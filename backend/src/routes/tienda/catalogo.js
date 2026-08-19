const express = require('express');
const prisma = require('../../db');
const { asyncHandler } = require('../../utils/asyncHandler');

const router = express.Router();

// Catálogo público de la tienda en línea: sin autenticación, solo productos
// activos con al menos una variante activa que tenga stock (sumando todas
// las sucursales) mayor a cero. No se expone el desglose por sucursal, solo
// el total disponible — a los clientes no les interesa (ni les compete) de
// qué sucursal sale su pedido, eso lo decide el backend al hacer checkout.

function conStockTotal(producto) {
  const variantes = producto.variantes.map((v) => {
    const stockTotal = v.existencias.reduce((acc, e) => acc + e.stockActual, 0);
    return {
      id: v.id,
      sku: v.sku,
      color: v.color,
      talla: v.talla,
      stockTotal,
    };
  });
  const stockTotal = variantes.reduce((acc, v) => acc + v.stockTotal, 0);
  return {
    id: producto.id,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    marca: producto.marca,
    modelo: producto.modelo,
    categoria: producto.categoria,
    precioVenta: producto.precioVenta,
    imagenes: producto.imagenes,
    variantes,
    stockTotal,
    // Se reenvían los campos personalizados tal cual (mismo formato clave→
    // string que ya usa el panel admin, ver dashboard/productos/[id]) para
    // que la tienda pueda leer, por ejemplo, un campo booleano "destacado"
    // sin necesitar una columna/migración nueva. No cambia nada de lo que
    // ya se mandaba antes, solo agrega este campo extra a la respuesta.
    atributosExtra: producto.atributosExtra || {},
  };
}

// GET /tienda/productos?q=&marcaId=&categoriaId=
router.get('/', asyncHandler(async (req, res) => {
  const { q, marcaId, categoriaId } = req.query;

  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(q ? { nombre: { contains: String(q), mode: 'insensitive' } } : {}),
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
    },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      imagenes: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] },
      variantes: {
        where: { activo: true },
        include: { talla: true, existencias: { select: { stockActual: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const disponibles = productos.map(conStockTotal).filter((p) => p.stockTotal > 0);
  res.json(disponibles);
}));

// GET /tienda/productos/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      imagenes: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] },
      variantes: {
        where: { activo: true },
        include: { talla: true, existencias: { select: { stockActual: true } } },
      },
    },
  });
  if (!producto || !producto.activo) return res.status(404).json({ error: 'Producto no encontrado.' });

  res.json(conStockTotal(producto));
}));

module.exports = router;
