const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { crearSolicitud } = require('../utils/solicitudes');
const { subirImagen, borrarImagen } = require('../config/cloudinary');

const router = express.Router();

// Multer guarda el archivo en memoria (no en disco: Render no persiste
// archivos entre despliegues) para subirlo directo a Cloudinary. Mismo
// criterio que routes/productos.js.
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

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// INVENTARIO puede crear y editar catálogos libremente, pero NO desactivarlos
// por su cuenta: desactivar oculta el catálogo de todo el sistema (por
// ejemplo, del selector al dar de alta un producto), así que requiere
// aprobación de ADMIN_PRINCIPAL/DESARROLLO. Reactivar (activo: true) sí se
// permite directo — es la acción "segura" en sentido contrario.
function esDesactivacion(rol, datos) {
  return rol === 'INVENTARIO' && datos.activo === false;
}

// ---- Marcas ----------------------------------------------------------

// ?todas=1 incluye marcas inactivas (dadas de baja); por defecto solo activas.
router.get('/marcas', requireAuth, asyncHandler(async (req, res) => {
  const marcas = await prisma.marca.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(marcas);
}));

router.post('/marcas', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  try {
    const marca = await prisma.marca.create({ data: { nombre: parsed.data.nombre } });
    res.status(201).json(marca);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una marca con ese nombre.' });
    throw err;
  }
}));

router.put('/marcas/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  if (esDesactivacion(req.usuario.rol, parsed.data)) {
    const marca = await prisma.marca.findUnique({ where: { id: Number(req.params.id) } });
    if (!marca) return res.status(404).json({ error: 'Marca no encontrada.' });
    const resultado = await crearSolicitud({
      tipo: 'MARCA',
      accion: 'DESACTIVAR',
      entidadId: marca.id,
      entidadNombre: marca.nombre,
      solicitadoPorId: req.usuario.id,
    });
    return res.status(202).json(resultado);
  }

  try {
    const marca = await prisma.marca.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(marca);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una marca con ese nombre.' });
    throw err;
  }
}));

// ---- Modelos -----------------------------------------------------------

router.get('/modelos', requireAuth, asyncHandler(async (req, res) => {
  const { marcaId } = req.query;
  const modelos = await prisma.modelo.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(marcaId ? { marcaId: Number(marcaId) } : {}),
    },
    orderBy: { nombre: 'asc' },
  });
  res.json(modelos);
}));

router.post('/modelos', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1), marcaId: z.number().int() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'nombre y marcaId son requeridos.' });

  try {
    const modelo = await prisma.modelo.create({ data: parsed.data });
    res.status(201).json(modelo);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe ese modelo para esta marca.' });
    throw err;
  }
}));

router.put('/modelos/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  if (esDesactivacion(req.usuario.rol, parsed.data)) {
    const modelo = await prisma.modelo.findUnique({ where: { id: Number(req.params.id) } });
    if (!modelo) return res.status(404).json({ error: 'Modelo no encontrado.' });
    const resultado = await crearSolicitud({
      tipo: 'MODELO',
      accion: 'DESACTIVAR',
      entidadId: modelo.id,
      entidadNombre: modelo.nombre,
      solicitadoPorId: req.usuario.id,
    });
    return res.status(202).json(resultado);
  }

  const modelo = await prisma.modelo.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(modelo);
}));

// ---- Categorías ----------------------------------------------------------

router.get('/categorias', requireAuth, asyncHandler(async (req, res) => {
  const categorias = await prisma.categoria.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(categorias);
}));

router.post('/categorias', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nombre requerido.' });

  try {
    const categoria = await prisma.categoria.create({ data: { nombre: parsed.data.nombre } });
    res.status(201).json(categoria);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

router.put('/categorias/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  if (esDesactivacion(req.usuario.rol, parsed.data)) {
    const categoria = await prisma.categoria.findUnique({ where: { id: Number(req.params.id) } });
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });
    const resultado = await crearSolicitud({
      tipo: 'CATEGORIA',
      accion: 'DESACTIVAR',
      entidadId: categoria.id,
      entidadNombre: categoria.nombre,
      solicitadoPorId: req.usuario.id,
    });
    return res.status(202).json(resultado);
  }

  try {
    const categoria = await prisma.categoria.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(categoria);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw err;
  }
}));

// POST /categorias/:id/imagen - sube (o reemplaza) la portada de la
// categoría para la tienda en línea (multipart/form-data, campo "imagen").
// Sin esto la tarjeta de categoría cae a una foto de un producto de esa
// categoría (ver GET /tienda/productos y CategoryGrid en el frontend).
router.post(
  '/categorias/:id/imagen',
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

    const categoria = await prisma.categoria.findUnique({ where: { id: Number(req.params.id) } });
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });

    const { url, publicId } = await subirImagen(req.file.buffer, 'categorias');

    // Si ya tenía una portada, se borra la anterior de Cloudinary para no
    // dejarla huérfana (misma lógica que reemplazar la foto principal de un
    // producto).
    if (categoria.imagenPortadaPublicId) {
      await borrarImagen(categoria.imagenPortadaPublicId).catch((err) => {
        console.error('No se pudo borrar la portada anterior de Cloudinary:', err.message);
      });
    }

    const actualizada = await prisma.categoria.update({
      where: { id: categoria.id },
      data: { imagenPortada: url, imagenPortadaPublicId: publicId },
    });

    res.json(actualizada);
  })
);

// DELETE /categorias/:id/imagen - quita la portada (vuelve al criterio
// automático: foto de un producto real de esa categoría).
router.delete(
  '/categorias/:id/imagen',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const categoria = await prisma.categoria.findUnique({ where: { id: Number(req.params.id) } });
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });

    if (categoria.imagenPortadaPublicId) {
      await borrarImagen(categoria.imagenPortadaPublicId).catch((err) => {
        console.error('No se pudo borrar la portada de Cloudinary:', err.message);
      });
    }

    const actualizada = await prisma.categoria.update({
      where: { id: categoria.id },
      data: { imagenPortada: null, imagenPortadaPublicId: null },
    });

    res.json(actualizada);
  })
);

// ---- Tallas ----------------------------------------------------------

// ?todas=1 incluye tallas desactivadas; por defecto solo activas (igual que
// marcas/categorías/modelos).
router.get('/tallas', requireAuth, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  const tallas = await prisma.talla.findMany({
    where: {
      ...(req.query.todas ? {} : { activo: true }),
      ...(tipo ? { tipo: String(tipo) } : {}),
    },
    orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
  });
  res.json(tallas);
}));

router.post('/tallas', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({
    valor: z.string().min(1),
    tipo: z.string().min(1),
    orden: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'valor y tipo son requeridos.' });

  try {
    const talla = await prisma.talla.create({ data: parsed.data });
    res.status(201).json(talla);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Esa talla ya existe para ese tipo.' });
    throw err;
  }
}));

router.put('/tallas/:id', requireAuth, requireRole(...ROLES_EDICION), asyncHandler(async (req, res) => {
  const schema = z.object({
    valor: z.string().min(1).optional(),
    tipo: z.string().min(1).optional(),
    orden: z.number().int().optional(),
    activo: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });

  if (esDesactivacion(req.usuario.rol, parsed.data)) {
    const talla = await prisma.talla.findUnique({ where: { id: Number(req.params.id) } });
    if (!talla) return res.status(404).json({ error: 'Talla no encontrada.' });
    const resultado = await crearSolicitud({
      tipo: 'TALLA',
      accion: 'DESACTIVAR',
      entidadId: talla.id,
      entidadNombre: `${talla.valor} (${talla.tipo})`,
      solicitadoPorId: req.usuario.id,
    });
    return res.status(202).json(resultado);
  }

  try {
    const talla = await prisma.talla.update({ where: { id: Number(req.params.id) }, data: parsed.data });
    res.json(talla);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Esa talla ya existe para ese tipo.' });
    throw err;
  }
}));

// ---- Cuentas de transferencia (dónde se reciben los pagos por transferencia) --

// Es información sensible/financiera: solo ADMIN_PRINCIPAL/DESARROLLO la
// editan. Cualquier rol autenticado puede listarla (VENTAS la necesita para
// elegir la cuenta al registrar un pago por transferencia).
router.get('/cuentas-transferencia', requireAuth, asyncHandler(async (req, res) => {
  const cuentas = await prisma.cuentaTransferencia.findMany({
    where: req.query.todas ? undefined : { activo: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(cuentas);
}));

const cuentaTransferenciaSchema = z.object({
  nombre: z.string().min(1),
  banco: z.string().optional(),
  titular: z.string().optional(),
  numeroCuenta: z.string().optional(),
  // Si es true, esta cuenta (y su CLABE) se le muestra al cliente al pagar
  // un pedido en la tienda en línea (ver routes/tienda/pedidos.js).
  paraVentasOnline: z.boolean().optional(),
});

router.post(
  '/cuentas-transferencia',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const parsed = cuentaTransferenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const cuenta = await prisma.cuentaTransferencia.create({ data: parsed.data });
    res.status(201).json(cuenta);
  })
);

router.put(
  '/cuentas-transferencia/:id',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const parsed = cuentaTransferenciaSchema
      .partial()
      .extend({ activo: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const cuenta = await prisma.cuentaTransferencia.update({
      where: { id: Number(req.params.id) },
      data: parsed.data,
    });
    res.json(cuenta);
  })
);

// ---- Campos personalizados (rol DESARROLLO) ---------------------------

router.get('/campos-personalizados', requireAuth, asyncHandler(async (req, res) => {
  const { entidad } = req.query;
  // Los formularios (ej. Productos) solo quieren campos activos. La pantalla
  // de administración (ADMIN_PRINCIPAL/DESARROLLO) también necesita ver los
  // desactivados, para poder reactivarlos — por eso ?todos=1 solo aplica el
  // filtro activo:true cuando NO viene, y solo esos roles pueden pedirlo.
  const esAdmin = ['ADMIN_PRINCIPAL', 'DESARROLLO'].includes(req.usuario.rol);
  const verTodos = esAdmin && String(req.query.todos) === '1';
  const campos = await prisma.campoPersonalizado.findMany({
    where: { ...(verTodos ? {} : { activo: true }), ...(entidad ? { entidad: String(entidad) } : {}) },
    orderBy: [{ entidad: 'asc' }, { etiqueta: 'asc' }],
  });
  res.json(campos);
}));

router.post(
  '/campos-personalizados',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      entidad: z.string().min(1),
      clave: z.string().min(1),
      etiqueta: z.string().min(1),
      tipo: z.enum(['TEXTO', 'NUMERO', 'BOOLEANO', 'FECHA', 'SELECT']),
      opciones: z.array(z.string()).optional(),
      requerido: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const campo = await prisma.campoPersonalizado.create({ data: parsed.data });
    res.status(201).json(campo);
  })
);

router.put(
  '/campos-personalizados/:id',
  requireAuth,
  requireRole('ADMIN_PRINCIPAL', 'DESARROLLO'),
  asyncHandler(async (req, res) => {
    // `entidad` y `clave` NO se pueden editar aquí a propósito: son la
    // referencia que ya quedó guardada dentro de `atributosExtra` (JSON) de
    // cada producto existente — cambiarlas desincronizaría esos datos ya
    // guardados del campo que ahora se estaría definiendo. Si de verdad se
    // necesita otra clave, lo correcto es desactivar este campo y crear uno
    // nuevo.
    const schema = z.object({
      etiqueta: z.string().min(1).optional(),
      tipo: z.enum(['TEXTO', 'NUMERO', 'BOOLEANO', 'FECHA', 'SELECT']).optional(),
      opciones: z.array(z.string()).optional(),
      requerido: z.boolean().optional(),
      activo: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const campo = await prisma.campoPersonalizado.update({
      where: { id: Number(req.params.id) },
      data: parsed.data,
    });
    res.json(campo);
  })
);

module.exports = router;
