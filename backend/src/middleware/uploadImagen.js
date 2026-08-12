const multer = require('multer');

// Multer guarda el archivo en memoria (no en disco: Render no persiste
// archivos entre despliegues) para subirlo directo a Cloudinary. Compartido
// por productos (fotos), ventas (comprobante de transferencia) y apartados
// (comprobante de abono).
const uploadImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('SOLO_IMAGENES'));
    }
    cb(null, true);
  },
});

/**
 * Middleware listo para usar en una ruta: maneja errores de multer con un
 * mensaje claro en vez de tumbar la request.
 */
function manejarSubidaImagen(campo) {
  return (req, res, next) => {
    uploadImagen.single(campo)(req, res, (err) => {
      if (err) {
        if (err.message === 'SOLO_IMAGENES') {
          return res.status(400).json({ error: 'El archivo debe ser una imagen.' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'La imagen no puede pesar más de 5 MB.' });
        }
        return res.status(400).json({ error: 'No se pudo procesar el archivo.' });
      }
      next();
    });
  };
}

/**
 * Igual que manejarSubidaImagen pero para varios archivos bajo el mismo
 * campo (ej. fotos del paquete recibido en una reseña). "max" limita cuántas
 * se aceptan en una sola solicitud.
 */
function manejarSubidaImagenes(campo, max = 6) {
  return (req, res, next) => {
    uploadImagen.array(campo, max)(req, res, (err) => {
      if (err) {
        if (err.message === 'SOLO_IMAGENES') {
          return res.status(400).json({ error: 'Los archivos deben ser imágenes.' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Cada imagen puede pesar máximo 5 MB.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: `Puedes subir máximo ${max} fotos.` });
        }
        return res.status(400).json({ error: 'No se pudo procesar los archivos.' });
      }
      next();
    });
  };
}

module.exports = { manejarSubidaImagen, manejarSubidaImagenes };
