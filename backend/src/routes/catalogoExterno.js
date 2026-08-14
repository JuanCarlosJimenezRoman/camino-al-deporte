const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { subirImagen } = require('../config/cloudinary');
const { generarCodigoInterno } = require('../utils/codigoInterno');
const {
  buscarOCrearMarca,
  buscarOCrearCategoria,
  buscarOCrearModelo,
  buscarOCrearTalla,
} = require('../utils/importarProductos');
const kicksdb = require('../utils/kicksdb');

// Rutas para traer datos de sneakers desde KicksDB (kicks.dev) y usarlos
// para dar de alta productos sin capturar a mano marca/modelo/SKU/imagen —
// ver "Catálogo externo (KicksDB)" en docs/ARQUITECTURA.md.
//
// Se monta DENTRO de productos.js (como productosImportExport.js), antes de
// la ruta genérica GET /:id, para que "/buscar-externo" no se interprete
// como un id de producto.
const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

function requireKicksDBConfigurado(req, res, next) {
  if (!kicksdb.tieneApiKey()) {
    return res.status(503).json({
      error: 'La integración con KicksDB no está configurada (falta KICKSDB_API_KEY en el servidor).',
    });
  }
  next();
}

// GET /productos/buscar-externo?q=Jordan+1 - busca sneakers en KicksDB por
// nombre o SKU. No toca la base de datos local, es solo consulta.
router.get(
  '/buscar-externo',
  requireAuth,
  requireRole(...ROLES_EDICION),
  requireKicksDBConfigurado,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'Escribe al menos 2 caracteres para buscar.' });

    try {
      const resultados = await kicksdb.buscarSneakers(q);
      res.json({ data: resultados });
    } catch (err) {
      console.error('Error consultando KicksDB (buscar-externo):', err);
      res.status(502).json({ error: 'No se pudo consultar KicksDB en este momento.' });
    }
  })
);

// GET /productos/buscar-externo/:idExterno - ficha completa (tallas
// incluidas si KicksDB las trae) de un resultado de la búsqueda anterior.
// Ver el comentario al inicio de utils/kicksdb.js: el shape exacto de
// "variantes" (tallas) puede necesitar ajuste una vez probado con una API
// key real; por eso también se regresa "raw" con la respuesta cruda.
router.get(
  '/buscar-externo/:idExterno',
  requireAuth,
  requireRole(...ROLES_EDICION),
  requireKicksDBConfigurado,
  asyncHandler(async (req, res) => {
    try {
      const detalle = await kicksdb.obtenerDetalleSneaker(req.params.idExterno);
      res.json(detalle);
    } catch (err) {
      console.error('Error consultando KicksDB (detalle):', err);
      res.status(502).json({ error: 'No se pudo consultar el detalle en KicksDB en este momento.' });
    }
  })
);

const varianteImportSchema = z.object({
  talla: z.string().min(1).optional(),
  // TD/PS/GS/WMNS/MENS para calzado, "ropa" para ropa, o vacío -> "general"
  // (ver tallas segmentadas en docs/ARQUITECTURA.md).
  tipoTalla: z.string().optional(),
  color: z.string().optional(),
  sku: z.string().min(1),
  stockInicial: z.number().int().nonnegative().default(0),
  stockMinimo: z.number().int().nonnegative().default(0),
});

const importarExternoSchema = z.object({
  nombre: z.string().min(1),
  marca: z.string().min(1),
  modelo: z.string().optional(),
  categoria: z.string().min(1),
  descripcion: z.string().optional(),
  precioCompra: z.number().nonnegative().optional(),
  precioVenta: z.number().nonnegative().optional(),

  // Datos propios de sneakers que no tienen columna dedicada en Producto:
  // se guardan en atributosExtra (mismo mecanismo pensado para "campos
  // personalizados", ver docs/ARQUITECTURA.md) en vez de forzar una
  // migración por cada campo que traiga KicksDB.
  colorway: z.string().optional(),
  genero: z.string().optional(),
  fuenteExterna: z.string().default('kicksdb'),
  idExterno: z.string().optional(),
  skuExterno: z.string().optional(),

  imagenUrl: z.string().url().optional(),
  galeria: z.array(z.object({ url: z.string().url(), color: z.string().optional() })).optional(),

  sucursalId: z.number().int(),
  variantes: z.array(varianteImportSchema).min(1),
});

// Descarga una imagen externa (vía KicksDB/StockX) y la vuelve a subir a
// Cloudinary — igual que las fotos que se suben a mano — para no depender
// de que la URL externa siga viva ni de su hotlinking.
async function descargarYSubirImagen(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo descargar la imagen (${resp.status}).`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return subirImagen(buffer, 'productos');
}

// POST /productos/importar-externo - crea (o extiende, si el producto
// nombre+marca ya existe) un producto a partir de datos ya elegidos por
// quien llama (típicamente el resultado de buscar-externo/detalle, más las
// tallas/stock/precio que el usuario captura a mano) — mismo patrón
// "buscar o crear" catálogo que la importación por Excel (ver
// utils/importarProductos.js), reutilizando sus helpers.
router.post(
  '/importar-externo',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const parsed = importarExternoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const datos = parsed.data;

    const sucursal = await prisma.sucursal.findUnique({ where: { id: datos.sucursalId } });
    if (!sucursal) return res.status(400).json({ error: 'La sucursal indicada no existe.' });

    // La descarga de imágenes se hace FUERA de la transacción de Prisma (es
    // una llamada de red que puede tardar; no conviene tener abierta una
    // transacción de base de datos mientras tanto). Si falla, no se aborta
    // la importación: el producto se crea sin esa foto y se puede agregar
    // después a mano.
    let imagenSubida = null;
    if (datos.imagenUrl) {
      try {
        imagenSubida = await descargarYSubirImagen(datos.imagenUrl);
      } catch (err) {
        console.error('No se pudo subir la imagen principal desde KicksDB:', err.message);
      }
    }
    const galeriaSubida = [];
    for (const foto of datos.galeria || []) {
      try {
        const subida = await descargarYSubirImagen(foto.url);
        galeriaSubida.push({ ...subida, color: foto.color || null });
      } catch (err) {
        console.error('No se pudo subir una foto de la galería desde KicksDB:', err.message);
      }
    }

    const resultado = await prisma.$transaction(
      async (tx) => {
        const marca = await buscarOCrearMarca(tx, datos.marca);
        const categoria = await buscarOCrearCategoria(tx, datos.categoria);
        let modeloId;
        if (datos.modelo) {
          const modelo = await buscarOCrearModelo(tx, datos.modelo, marca.id);
          modeloId = modelo.id;
        }

        let producto = await tx.producto.findFirst({
          where: { nombre: { equals: datos.nombre, mode: 'insensitive' }, marcaId: marca.id, activo: true },
        });
        let productoCreado = false;

        if (!producto) {
          const atributosExtra = {
            ...(datos.colorway ? { colorway: datos.colorway } : {}),
            ...(datos.genero ? { genero: datos.genero } : {}),
            ...(datos.idExterno ? { kicksdb_id: datos.idExterno } : {}),
            ...(datos.skuExterno ? { sku_externo: datos.skuExterno } : {}),
            fuente_externa: datos.fuenteExterna,
          };
          producto = await tx.producto.create({
            data: {
              nombre: datos.nombre,
              descripcion: datos.descripcion,
              marcaId: marca.id,
              modeloId,
              categoriaId: categoria.id,
              precioCompra: datos.precioCompra ?? 0,
              precioVenta: datos.precioVenta ?? 0,
              atributosExtra,
            },
          });
          productoCreado = true;
        }

        if (imagenSubida) {
          const yaTieneImagenes = (await tx.productoImagen.count({ where: { productoId: producto.id } })) > 0;
          await tx.productoImagen.create({
            data: {
              productoId: producto.id,
              url: imagenSubida.url,
              publicId: imagenSubida.publicId,
              esPrincipal: !yaTieneImagenes,
            },
          });
        }
        for (const foto of galeriaSubida) {
          await tx.productoImagen.create({
            data: { productoId: producto.id, url: foto.url, publicId: foto.publicId, color: foto.color },
          });
        }

        const variantesResultado = [];
        for (const v of datos.variantes) {
          let tallaId;
          if (v.talla) {
            const talla = await buscarOCrearTalla(tx, v.talla, v.tipoTalla || 'general');
            tallaId = talla.id;
          }

          // Si ya existe esa combinación producto+talla+color (por ejemplo,
          // ya se había importado antes este mismo sneaker), no se
          // duplica: se salta y se avisa en la respuesta, igual que la
          // importación por Excel.
          const existente = tallaId
            ? await tx.productoVariante.findFirst({ where: { productoId: producto.id, tallaId, color: v.color || null } })
            : null;
          if (existente) {
            variantesResultado.push({ ...existente, omitida: true, motivo: 'Esa talla/color ya existe en este producto.' });
            continue;
          }

          const codigoInterno = await generarCodigoInterno(tx, { sku: v.sku, tallaValor: v.talla || null, color: v.color });
          const variante = await tx.productoVariante.create({
            data: { productoId: producto.id, tallaId, color: v.color || null, sku: v.sku, codigoInterno },
          });

          await tx.existencia.create({
            data: {
              sucursalId: datos.sucursalId,
              varianteId: variante.id,
              stockActual: v.stockInicial,
              stockMinimo: v.stockMinimo,
            },
          });
          if (v.stockInicial > 0) {
            await tx.movimientoInventario.create({
              data: {
                sucursalId: datos.sucursalId,
                varianteId: variante.id,
                tipo: 'ENTRADA',
                cantidad: v.stockInicial,
                motivo: `Alta desde catálogo externo (${datos.fuenteExterna})`,
                usuarioId: req.usuario.id,
              },
            });
          }
          variantesResultado.push(variante);
        }

        const productoFinal = await tx.producto.findUnique({
          where: { id: producto.id },
          include: {
            variantes: { include: { existencias: true, talla: true } },
            imagenes: true,
            marca: true,
            modelo: true,
            categoria: true,
          },
        });

        return { producto: productoFinal, productoCreado, variantes: variantesResultado };
      },
      { timeout: 30000 }
    );

    res.status(resultado.productoCreado ? 201 : 200).json(resultado);
  })
);

module.exports = router;
