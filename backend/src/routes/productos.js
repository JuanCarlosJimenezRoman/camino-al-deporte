const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { subirImagen, borrarImagen } = require('../config/cloudinary');
const { generarCodigoInterno } = require('../utils/codigoInterno');

const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// Multer guarda el archivo en memoria (no en disco: Render no persiste
// archivos entre despliegues) para subirlo directo a Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('SOLO_IMAGENES'));
    }
    cb(null, true);
  },
});

const IMAGENES_INCLUDE = { imagenes: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] } };

// Importante: se monta ANTES de "GET /:id" para que rutas como
// /productos/plantilla-excel no se confundan con un id de producto.
router.use('/', require('./productosImportExport'));

// GET /productos - todos los roles autenticados pueden consultar
// ?marcaId= ?categoriaId= ?modeloId= filtran por esos campos directos del
// producto. ?tallaId= es distinto: la talla vive en la variante, no en el
// producto, así que filtra a los productos que tengan AL MENOS una variante
// activa con esa talla (para poder responder rápido "qué productos hay
// disponibles en el número 27", por ejemplo).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { marcaId, categoriaId, modeloId, tallaId, q } = req.query;

  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(modeloId ? { modeloId: Number(modeloId) } : {}),
      ...(tallaId ? { variantes: { some: { tallaId: Number(tallaId), activo: true } } } : {}),
      ...(q ? { nombre: { contains: String(q), mode: 'insensitive' } } : {}),
    },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      variantes: {
        include: {
          talla: true,
          proveedor: { select: { id: true, nombre: true } },
          existencias: { include: { sucursal: true, proveedor: { select: { id: true, nombre: true } } } },
        },
      },
      ...IMAGENES_INCLUDE,
    },
    orderBy: { nombre: 'asc' },
  });

  res.json(productos);
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      marca: true,
      modelo: true,
      categoria: true,
      variantes: {
        include: {
          talla: true,
          proveedor: { select: { id: true, nombre: true } },
          existencias: { include: { sucursal: true, proveedor: { select: { id: true, nombre: true } } } },
        },
      },
      ...IMAGENES_INCLUDE,
    },
  });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(producto);
}));

// Existencia inicial opcional al dar de alta una variante: por cada sucursal
// donde ya tengas ese producto físicamente.
const existenciaInicialSchema = z.object({
  sucursalId: z.number().int(),
  stockActual: z.number().int().nonnegative().default(0),
  stockMinimo: z.number().int().nonnegative().default(0),
});

const varianteSchema = z.object({
  tallaId: z.number().int().optional(),
  color: z.string().optional(),
  sku: z.string().min(1),
  // Proveedor "por defecto" de este SKU específico — una talla del mismo
  // producto puede venir de un proveedor distinto a otra (ver schema.prisma).
  proveedorId: z.number().int().optional(),
  existencias: z.array(existenciaInicialSchema).optional(),
});

const productoSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  marcaId: z.number().int(),
  modeloId: z.number().int().optional(),
  categoriaId: z.number().int(),
  precioCompra: z.number().nonnegative().optional(),
  precioVenta: z.number().nonnegative().optional(),
  atributosExtra: z.record(z.any()).optional(),
  // variantes iniciales opcionales al crear el producto
  variantes: z.array(varianteSchema).optional(),
});

// POST /productos - crear producto (con variantes y existencias iniciales opcionales)
router.post('/', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = productoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { variantes, ...productoData } = parsed.data;

  const producto = await prisma.$transaction(async (tx) => {
    const creado = await tx.producto.create({ data: productoData });

    for (const v of variantes || []) {
      const { existencias, ...varianteData } = v;
      const talla = varianteData.tallaId ? await tx.talla.findUnique({ where: { id: varianteData.tallaId } }) : null;
      const codigoInterno = await generarCodigoInterno(tx, {
        sku: varianteData.sku,
        tallaValor: talla?.valor ?? null,
        color: varianteData.color,
      });
      const variante = await tx.productoVariante.create({
        data: { ...varianteData, codigoInterno, productoId: creado.id },
      });
      // El stock inicial se carga al bucket del proveedor que se le acaba de
      // asignar a la variante (o "sin proveedor" si no se indicó uno).
      for (const ex of existencias || []) {
        await tx.existencia.create({
          data: { ...ex, varianteId: variante.id, proveedorId: varianteData.proveedorId ?? null },
        });
      }
    }

    return tx.producto.findUnique({
      where: { id: creado.id },
      include: { variantes: { include: { existencias: true, talla: true } } },
    });
  });

  res.status(201).json(producto);
}));

// PUT /productos/:id - editar producto (datos generales, no variantes)
router.put('/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const parsed = productoSchema.omit({ variantes: true }).partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }

  const producto = await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
  });

  res.json(producto);
}));

// DELETE /productos/:id - baja lógica (no se borra físicamente)
router.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: { activo: false },
    });
    res.status(204).send();
  })
);

// POST /productos/:id/variantes - agregar una variante (talla/color) a un producto existente
router.post(
  '/:id/variantes',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const parsed = varianteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { existencias, ...varianteData } = parsed.data;

    const variante = await prisma.$transaction(async (tx) => {
      const talla = varianteData.tallaId ? await tx.talla.findUnique({ where: { id: varianteData.tallaId } }) : null;
      const codigoInterno = await generarCodigoInterno(tx, {
        sku: varianteData.sku,
        tallaValor: talla?.valor ?? null,
        color: varianteData.color,
      });
      const creada = await tx.productoVariante.create({
        data: { ...varianteData, codigoInterno, productoId: Number(req.params.id) },
      });
      for (const ex of existencias || []) {
        await tx.existencia.create({
          data: { ...ex, varianteId: creada.id, proveedorId: varianteData.proveedorId ?? null },
        });
      }
      return tx.productoVariante.findUnique({
        where: { id: creada.id },
        include: { existencias: { include: { sucursal: true } }, talla: true },
      });
    });

    res.status(201).json(variante);
  })
);

// PUT /productos/:id/variantes/:varianteId - editar una variante existente.
// Pensado sobre todo para poder asignar/cambiar el proveedor de un SKU que
// ya existe (dar de alta el catálogo y clasificarlo por proveedor son pasos
// separados en la práctica), pero también permite corregir talla/color/sku.
router.put(
  '/:id/variantes/:varianteId',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      tallaId: z.number().int().nullable().optional(),
      color: z.string().nullable().optional(),
      sku: z.string().min(1).optional(),
      proveedorId: z.number().int().nullable().optional(),
      activo: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    try {
      const variante = await prisma.productoVariante.update({
        where: { id: Number(req.params.varianteId) },
        data: parsed.data,
        include: {
          talla: true,
          proveedor: { select: { id: true, nombre: true } },
          existencias: { include: { sucursal: true, proveedor: { select: { id: true, nombre: true } } } },
        },
      });
      res.json(variante);
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una variante con esos datos.' });
      if (err.code === 'P2025') return res.status(404).json({ error: 'Variante no encontrada.' });
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Fotos del producto (Cloudinary)
// ---------------------------------------------------------------------------

// POST /productos/:id/imagenes - subir una foto (multipart/form-data, campo "imagen")
router.post(
  '/:id/imagenes',
  requireAuth,
  requireRole(...ROLES_EDICION),
  (req, res, next) => {
    upload.single('imagen')(req, res, (err) => {
      if (err) {
        if (err.message === 'SOLO_IMAGENES') return res.status(400).json({ error: 'El archivo debe ser una imagen.' });
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La imagen no puede pesar más de 5 MB.' });
        return res.status(400).json({ error: 'No se pudo procesar el archivo.' });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const productoId = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen (campo "imagen").' });

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });

    // Color de variante al que pertenece esta foto (opcional): para
    // productos donde el color cambia mucho el aspecto (modelos "By You"
    // custom, por ejemplo) y una sola foto genérica no sirve para todos los
    // colores. Si no se manda, la foto es general (sirve de respaldo para
    // cualquier color que no tenga la suya propia).
    const color = req.body.color ? String(req.body.color).trim() || null : null;

    const { url, publicId } = await subirImagen(req.file.buffer);

    const esPrimera = (await prisma.productoImagen.count({ where: { productoId } })) === 0;

    const imagen = await prisma.productoImagen.create({
      data: { productoId, url, publicId, color, esPrincipal: esPrimera },
    });

    res.status(201).json(imagen);
  })
);

// POST /productos/fotos-por-sku - sube una foto identificando el producto (y,
// si aplica, el color) por el SKU de fábrica del archivo (multipart/form-data,
// campos "sku" e "imagen"). Pensado para subir en lote fotos de una carpeta
// local etiquetada por SKU, sin tener que buscar cada producto a mano uno
// por uno.
//
// El SKU de fábrica ya no es único (se repite entre tallas del mismo lote, y
// en modelos "By You" custom a veces también entre colores — ver
// docs/ARQUITECTURA.md), así que un mismo SKU puede apuntar a más de una
// combinación producto+color. Si solo hay una, se sube directo y se etiqueta
// con ese color automáticamente. Si hay varias, no se adivina: se responde
// 409 con las opciones para que se resuelva a mano (ver
// PUT /productos/:id/imagenes que acepta "color").
router.post(
  '/fotos-por-sku',
  requireAuth,
  requireRole(...ROLES_EDICION),
  (req, res, next) => {
    upload.single('imagen')(req, res, (err) => {
      if (err) {
        if (err.message === 'SOLO_IMAGENES') return res.status(400).json({ error: 'El archivo debe ser una imagen.' });
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'La imagen no puede pesar más de 5 MB.' });
        return res.status(400).json({ error: 'No se pudo procesar el archivo.' });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen (campo "imagen").' });
    const sku = String(req.body.sku || '').trim();
    if (!sku) return res.status(400).json({ error: 'Falta el SKU (campo "sku").' });

    const variantes = await prisma.productoVariante.findMany({
      where: { sku: { equals: sku, mode: 'insensitive' }, activo: true, producto: { activo: true } },
      select: { productoId: true, color: true, producto: { select: { id: true, nombre: true } } },
    });

    if (variantes.length === 0) {
      return res.status(404).json({ error: `No se encontró ningún producto con el SKU "${sku}".` });
    }

    // Agrupa por combinación producto+color (no solo por producto): el mismo
    // SKU puede repetirse dentro de un solo producto en tallas de distinto
    // color (ej. "By You" custom), y ahí también hay que preguntar a cuál
    // color va la foto, no solo a cuál producto.
    const opciones = new Map(); // `${productoId}::${color}` -> { productoId, productoNombre, color }
    for (const v of variantes) {
      const clave = `${v.productoId}::${v.color ?? ''}`;
      if (!opciones.has(clave)) {
        opciones.set(clave, { productoId: v.productoId, productoNombre: v.producto.nombre, color: v.color ?? null });
      }
    }

    if (opciones.size > 1) {
      const lista = Array.from(opciones.values());
      const descripcion = lista.map((o) => `${o.productoNombre}${o.color ? ` (${o.color})` : ''}`).join(', ');
      return res.status(409).json({
        error: `El SKU "${sku}" está repetido en más de una combinación de producto/color (${descripcion}), no se puede saber a cuál va la foto.`,
        opciones: lista,
      });
    }

    const { productoId, productoNombre, color } = [...opciones.values()][0];

    const { url, publicId } = await subirImagen(req.file.buffer);
    const esPrimera = (await prisma.productoImagen.count({ where: { productoId } })) === 0;
    const imagen = await prisma.productoImagen.create({
      data: { productoId, url, publicId, color, esPrincipal: esPrimera },
    });

    res.status(201).json({ ...imagen, productoId, productoNombre });
  })
);

// PUT /productos/:id/imagenes/:imagenId - editar el color al que pertenece
// una foto ya subida (por si se etiquetó mal). No toca nada más de la foto.
router.put(
  '/:id/imagenes/:imagenId',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const schema = z.object({ color: z.string().nullable() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    try {
      const imagen = await prisma.productoImagen.update({
        where: { id: Number(req.params.imagenId) },
        data: { color: parsed.data.color?.trim() || null },
      });
      res.json(imagen);
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Imagen no encontrada.' });
      throw err;
    }
  })
);

// PUT /productos/:id/imagenes/:imagenId/principal - marcarla como foto de portada
router.put(
  '/:id/imagenes/:imagenId/principal',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const productoId = Number(req.params.id);
    const imagenId = Number(req.params.imagenId);

    await prisma.$transaction([
      prisma.productoImagen.updateMany({ where: { productoId }, data: { esPrincipal: false } }),
      prisma.productoImagen.update({ where: { id: imagenId }, data: { esPrincipal: true } }),
    ]);

    res.json({ ok: true });
  })
);

// DELETE /productos/:id/imagenes/:imagenId - borra de Cloudinary y de la BD
router.delete(
  '/:id/imagenes/:imagenId',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const imagen = await prisma.productoImagen.findUnique({ where: { id: Number(req.params.imagenId) } });
    if (!imagen) return res.status(404).json({ error: 'Imagen no encontrada.' });

    await borrarImagen(imagen.publicId).catch((err) => {
      // Si Cloudinary ya no la tiene (borrada a mano, etc.) seguimos y
      // limpiamos igual el registro local en vez de dejarlo huérfano.
      console.error('No se pudo borrar de Cloudinary:', err.message);
    });

    await prisma.productoImagen.delete({ where: { id: imagen.id } });

    // Si era la principal, promovemos otra (si queda alguna) para que el
    // producto siempre tenga una portada mientras tenga fotos.
    if (imagen.esPrincipal) {
      const siguiente = await prisma.productoImagen.findFirst({
        where: { productoId: imagen.productoId },
        orderBy: { orden: 'asc' },
      });
      if (siguiente) {
        await prisma.productoImagen.update({ where: { id: siguiente.id }, data: { esPrincipal: true } });
      }
    }

    res.status(204).send();
  })
);

module.exports = router;
