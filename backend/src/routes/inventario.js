const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const ROLES_INVENTARIO = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// Manda la galería completa (solo url/color/esPrincipal, sin publicId ni
// fechas) en vez de una sola foto: como una foto puede estar etiquetada para
// un color de variante específico (ver ProductoImagen.color), el frontend
// necesita ver todas para elegir la que corresponde al color de cada
// renglón, no solo la portada general del producto.
const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: {
    orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
    select: { url: true, color: true, esPrincipal: true },
  },
};

// GET /inventario/existencias?sucursalId=&proveedorId= - consulta de stock
// de esa sucursal.
//
// Desde que el stock se separó por proveedor, esto ya NO es un renglón por
// variante: es un renglón por (variante, proveedor) — si dos proveedores
// surten la misma talla en la misma sucursal, aparecen dos renglones, cada
// uno con su propio stockActual. proveedorId puede ser null en un renglón
// (bucket "sin clasificar").
//
// Importante: esto se arma a partir de TODAS las variantes activas (no solo
// las que ya tienen alguna fila en "existencias"). Una variante puede no
// tener todavía ninguna fila de existencia en una sucursal (por ejemplo, si
// se importó por Excel con stock 0, o si se creó en otra sucursal) — en ese
// caso aparece aquí igual, con un renglón placeholder en 0 sin proveedor,
// para que se pueda cargar el primer stock. Si no se hiciera así, un
// producto recién creado con stock 0 "desaparecería" de Inventario y no
// habría forma de cargarle stock.
//
// ?proveedorId= filtra a los renglones donde ese proveedor YA tiene stock en
// esta sucursal, más las variantes que tienen a ese proveedor como
// "por defecto" (asignado en Productos) aunque todavía no tengan nada
// cargado ahí — así el filtro también sirve para ver qué le toca surtir a
// ese proveedor, no solo lo que ya se registró.
//
// ?marcaId= ?categoriaId= ?modeloId= filtran por esos campos del producto.
// ?tallaId= filtra directo por la talla de la variante — para poder ver de
// un vistazo qué hay disponible, por ejemplo, en el número 27.
router.get('/existencias', requireAuth, asyncHandler(async (req, res) => {
  const { skuOProducto, sucursalId, proveedorId, marcaId, categoriaId, modeloId, tallaId } = req.query;
  if (!sucursalId) return res.status(400).json({ error: 'Falta sucursalId.' });
  const filtroProveedorId = proveedorId ? Number(proveedorId) : null;

  const variantes = await prisma.productoVariante.findMany({
    where: {
      activo: true,
      producto: {
        activo: true,
        ...(marcaId ? { marcaId: Number(marcaId) } : {}),
        ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
        ...(modeloId ? { modeloId: Number(modeloId) } : {}),
      },
      ...(tallaId ? { tallaId: Number(tallaId) } : {}),
      ...(skuOProducto
        ? {
            OR: [
              { sku: { contains: String(skuOProducto), mode: 'insensitive' } },
              { producto: { nombre: { contains: String(skuOProducto), mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      producto: { include: { marca: true, categoria: true, ...IMAGEN_PRINCIPAL_INCLUDE } },
      talla: true,
      proveedor: { select: { id: true, nombre: true } },
      existencias: {
        where: { sucursalId: Number(sucursalId) },
        include: { proveedor: { select: { id: true, nombre: true } } },
      },
    },
    orderBy: { sku: 'asc' },
  });

  const resultado = [];
  for (const v of variantes) {
    const { existencias, ...variante } = v;
    const buckets = filtroProveedorId
      ? existencias.filter((ex) => ex.proveedorId === filtroProveedorId)
      : existencias;

    if (buckets.length === 0) {
      // Si se filtra por proveedor y esta variante no tiene ese bucket en
      // esta sucursal, solo la mostramos (en 0) cuando ese proveedor es
      // justo el "por defecto" de la variante — si no, de plano no tiene
      // relación con ese proveedor y no tiene caso listarla.
      if (filtroProveedorId && variante.proveedorId !== filtroProveedorId) continue;
      // El placeholder se etiqueta con el proveedor "por defecto" de la
      // variante (el que se le asignó en Productos), no con "Sin proveedor":
      // así, aunque todavía no haya una fila de existencia real en esta
      // sucursal, la pantalla muestra de forma consistente quién surte esa
      // talla en vez de un genérico "Sin proveedor" que cambiaba según la
      // sucursal y hacía parecer que el proveedor asignado se perdía.
      resultado.push({
        id: null,
        sucursalId: Number(sucursalId),
        proveedorId: variante.proveedorId,
        proveedor: variante.proveedor,
        stockActual: 0,
        stockMinimo: 0,
        variante,
      });
      continue;
    }

    for (const ex of buckets) {
      resultado.push({
        id: ex.id,
        sucursalId: Number(sucursalId),
        proveedorId: ex.proveedorId,
        proveedor: ex.proveedor,
        stockActual: ex.stockActual,
        stockMinimo: ex.stockMinimo,
        variante,
      });
    }
  }

  res.json(resultado);
}));

// GET /inventario/bajo-stock?sucursalId= - variantes en o por debajo del
// mínimo en esa sucursal. Aquí SÍ se suma el stock de todos los proveedores
// de una misma variante (el mínimo es una política de reorden por talla, no
// por proveedor) — se compara el total contra el mínimo más alto que tenga
// registrado cualquiera de sus buckets (normalmente todos comparten el mismo
// valor, ver PUT /minimo).
router.get('/bajo-stock', requireAuth, asyncHandler(async (req, res) => {
  const { sucursalId } = req.query;
  if (!sucursalId) return res.status(400).json({ error: 'Falta sucursalId.' });

  const variantes = await prisma.productoVariante.findMany({
    where: { activo: true, producto: { activo: true } },
    include: {
      producto: { include: IMAGEN_PRINCIPAL_INCLUDE },
      talla: true,
      proveedor: { select: { id: true, nombre: true } },
      existencias: {
        where: { sucursalId: Number(sucursalId) },
        include: { proveedor: { select: { id: true, nombre: true } } },
      },
    },
  });

  const bajoStock = variantes
    .map((v) => {
      const { existencias, ...variante } = v;
      const stockActual = existencias.reduce((s, ex) => s + ex.stockActual, 0);
      const stockMinimo = existencias.reduce((max, ex) => Math.max(max, ex.stockMinimo), 0);
      return {
        sucursalId: Number(sucursalId),
        stockActual,
        stockMinimo,
        buckets: existencias.map((ex) => ({
          proveedorId: ex.proveedorId,
          proveedor: ex.proveedor,
          stockActual: ex.stockActual,
        })),
        variante,
      };
    })
    .filter((e) => e.stockActual <= e.stockMinimo)
    .sort((a, b) => a.stockActual - b.stockActual);

  res.json(bajoStock);
}));

// POST /inventario/movimientos - registrar entrada/salida/ajuste de stock en
// una sucursal.
//
// proveedorId ya no es opcional: como el stock se separa por proveedor, cada
// movimiento tiene que decir de qué bucket suma/resta. Puede ser null (el
// bucket "sin proveedor"), pero el campo debe mandarse explícitamente — así
// nunca se mezcla sin querer con el bucket de otro proveedor.
router.post(
  '/movimientos',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      sucursalId: z.number().int(),
      varianteId: z.number().int(),
      tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
      cantidad: z.number().int(),
      motivo: z.string().optional(),
      proveedorId: z.number().int().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { sucursalId, varianteId, tipo, cantidad, motivo, proveedorId } = parsed.data;

    // Entradas suman, salidas restan; ajuste usa el signo tal cual se envía.
    const delta = tipo === 'SALIDA' ? -Math.abs(cantidad) : tipo === 'ENTRADA' ? Math.abs(cantidad) : cantidad;

    const resultado = await prisma
      .$transaction(async (tx) => {
        const existencia = await tx.existencia.findFirst({
          where: { sucursalId, varianteId, proveedorId },
        });

        const stockPrevio = existencia ? existencia.stockActual : 0;
        const nuevoStock = stockPrevio + delta;
        if (nuevoStock < 0) throw new Error('STOCK_INSUFICIENTE');

        const actualizada = existencia
          ? await tx.existencia.update({ where: { id: existencia.id }, data: { stockActual: nuevoStock } })
          : await tx.existencia.create({
              data: { sucursalId, varianteId, proveedorId, stockActual: nuevoStock, stockMinimo: 0 },
            });

        const movimiento = await tx.movimientoInventario.create({
          data: {
            sucursalId,
            varianteId,
            tipo,
            cantidad: delta,
            motivo,
            usuarioId: req.usuario.id,
            proveedorId,
          },
        });

        return { movimiento, stockActual: actualizada.stockActual };
      })
      .catch((err) => {
        if (err.message === 'STOCK_INSUFICIENTE') return { error: 'STOCK_INSUFICIENTE' };
        throw err;
      });

    if (resultado.error === 'STOCK_INSUFICIENTE') {
      return res.status(409).json({ error: 'Stock insuficiente para esta salida.' });
    }

    res.status(201).json(resultado);
  })
);

// GET /inventario/movimientos/:varianteId - historial de una variante (todas las sucursales)
router.get('/movimientos/:varianteId', requireAuth, asyncHandler(async (req, res) => {
  const movimientos = await prisma.movimientoInventario.findMany({
    where: { varianteId: Number(req.params.varianteId) },
    include: {
      usuario: { select: { nombre: true, email: true } },
      sucursal: { select: { nombre: true } },
      proveedor: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(movimientos);
}));

// PUT /inventario/minimo - fija el stock mínimo de una variante en una
// sucursal. El mínimo es una política de reorden por talla+sucursal, no por
// proveedor, así que se aplica por igual a TODOS los buckets que ya existan
// (ver GET /bajo-stock, que compara el mínimo contra el total sumado). Si
// todavía no hay ningún bucket, se crea uno "sin proveedor" para guardarlo.
router.put(
  '/minimo',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      sucursalId: z.number().int(),
      varianteId: z.number().int(),
      stockMinimo: z.number().int().nonnegative(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { sucursalId, varianteId, stockMinimo } = parsed.data;

    const existentes = await prisma.existencia.findMany({ where: { sucursalId, varianteId } });

    if (existentes.length === 0) {
      const creada = await prisma.existencia.create({
        data: { sucursalId, varianteId, proveedorId: null, stockMinimo, stockActual: 0 },
      });
      return res.json([creada]);
    }

    await prisma.existencia.updateMany({ where: { sucursalId, varianteId }, data: { stockMinimo } });
    const actualizadas = await prisma.existencia.findMany({
      where: { sucursalId, varianteId },
      include: { proveedor: { select: { id: true, nombre: true } } },
    });
    res.json(actualizadas);
  })
);

module.exports = router;
