const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { subirImagen, borrarImagen } = require('../config/cloudinary');

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
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { marcaId, categoriaId, q } = req.query;

  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
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
          existencias: { include: { sucursal: true } },
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
          existencias: { include: { sucursal: true } },
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
      const variante = await tx.productoVariante.create({
        data: { ...varianteData, productoId: creado.id },
      });
      for (const ex of existencias || []) {
        await tx.existencia.create({
          data: { ...ex, varianteId: variante.id },
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
      const creada = await tx.productoVariante.create({
        data: { ...varianteData, productoId: Number(req.params.id) },
      });
      for (const ex of existencias || []) {
        await tx.existencia.create({ data: { ...ex, varianteId: creada.id } });
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
          existencias: { include: { sucursal: true } },
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

    const { url, publicId } = await subirImagen(req.file.buffer);

    const esPrimera = (await prisma.productoImagen.count({ where: { productoId } })) === 0;

    const imagen = await prisma.productoImagen.create({
      data: { productoId, url, publicId, esPrincipal: esPrimera },
    });

    res.status(201).json(imagen);
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
