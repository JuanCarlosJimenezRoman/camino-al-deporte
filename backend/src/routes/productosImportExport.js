const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { leerFilasExcel, generarPlantilla, generarExportacion } = require('../utils/excel');
const { analizarImportacion, ejecutarImportacion } = require('../utils/importarProductos');

// Este router se monta DENTRO de productos.js, antes de la ruta genérica
// GET /:id, para que rutas como /plantilla-excel no se interpreten como un
// id de producto.
const router = express.Router();

const ROLES_EDICION = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const tiposValidos = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (!tiposValidos.includes(file.mimetype) && !file.originalname.match(/\.xlsx?$/i)) {
      return cb(new Error('SOLO_EXCEL'));
    }
    cb(null, true);
  },
});

function manejarSubidaExcel(req, res, next) {
  uploadExcel.single('archivo')(req, res, (err) => {
    if (err) {
      if (err.message === 'SOLO_EXCEL') return res.status(400).json({ error: 'El archivo debe ser .xlsx o .xls.' });
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo no puede pesar más de 10 MB.' });
      return res.status(400).json({ error: 'No se pudo procesar el archivo.' });
    }
    next();
  });
}

// GET /productos/plantilla-excel - descarga la plantilla en blanco (con ejemplo)
router.get(
  '/plantilla-excel',
  requireAuth,
  requireRole(...ROLES_EDICION),
  asyncHandler(async (req, res) => {
    const buffer = generarPlantilla();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"');
    res.send(buffer);
  })
);

// GET /productos/exportar-excel - exporta el catálogo actual completo
router.get(
  '/exportar-excel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      include: {
        marca: true,
        modelo: true,
        categoria: true,
        variantes: { include: { talla: true, existencias: { include: { sucursal: true } } } },
      },
      orderBy: { nombre: 'asc' },
    });

    const buffer = generarExportacion(productos);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="catalogo-${Date.now()}.xlsx"`);
    res.send(buffer);
  })
);

const vistaPreviaQuery = z.object({ sucursalId: z.coerce.number().int().optional() });

// POST /productos/importar-excel/vista-previa?sucursalId= - valida sin
// escribir nada en la BD. sucursalId es opcional: el frontend ya la manda
// (usa la que esté seleccionada en ese momento) para que la vista previa sea
// exacta sobre qué proveedores ya tienen stock ahí; si no se manda, la
// validación de "proveedor repetido" se aproxima mirando todas las
// sucursales (ver analizarImportacion).
router.post(
  '/importar-excel/vista-previa',
  requireAuth,
  requireRole(...ROLES_EDICION),
  manejarSubidaExcel,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "archivo").' });

    let filasCrudas;
    try {
      filasCrudas = leerFilasExcel(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' });
    }
    if (filasCrudas.length === 0) {
      return res.status(400).json({ error: 'El archivo no tiene filas de datos.' });
    }

    const parsedQuery = vistaPreviaQuery.safeParse(req.query);
    const sucursalId = parsedQuery.success ? parsedQuery.data.sucursalId : undefined;

    const analisis = await analizarImportacion(filasCrudas, { sucursalId });
    res.json(analisis);
  })
);

const confirmarQuery = z.object({ sucursalId: z.coerce.number().int() });

// POST /productos/importar-excel/confirmar?sucursalId=1 - ejecuta la importación real
router.post(
  '/importar-excel/confirmar',
  requireAuth,
  requireRole(...ROLES_EDICION),
  manejarSubidaExcel,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "archivo").' });

    const parsedQuery = confirmarQuery.safeParse(req.query);
    if (!parsedQuery.success) return res.status(400).json({ error: 'Falta indicar la sucursal (sucursalId).' });

    const sucursal = await prisma.sucursal.findUnique({ where: { id: parsedQuery.data.sucursalId } });
    if (!sucursal) return res.status(400).json({ error: 'La sucursal indicada no existe.' });

    let filasCrudas;
    try {
      filasCrudas = leerFilasExcel(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' });
    }

    const resultado = await ejecutarImportacion(filasCrudas, {
      sucursalId: sucursal.id,
      usuarioId: req.usuario.id,
    });

    res.json(resultado);
  })
);

module.exports = router;
