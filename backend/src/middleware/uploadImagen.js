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

module.exports = { manejarSubidaImagen };
