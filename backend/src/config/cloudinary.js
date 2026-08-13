const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un buffer de imagen (ya validado por multer) a Cloudinary. Devuelve
 * { url, publicId }.
 * @param {Buffer} buffer
 * @param {string} carpeta - subcarpeta dentro de "camino-al-deporte/", ej.
 *   "productos" (fotos de catálogo) o "comprobantes" (pagos/apartados).
 */
function subirImagen(buffer, carpeta = 'productos') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `camino-al-deporte/${carpeta}`,
        resource_type: 'image',
        // Redimensiona a un máximo razonable (ahorra espacio y hace que la
        // app cargue más rápido) sin recortar la imagen.
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

function borrarImagen(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

/**
 * Sube un buffer de PDF (ej. el ticket digital generado con pdfkit, ver
 * utils/ticketPdf.js) y devuelve { url, publicId } con una URL pública de
 * descarga directa.
 *
 * OJO: en cuentas Cloudinary "Free", la entrega pública de PDF/ZIP viene
 * desactivada por defecto por seguridad — si la URL regresa 401, hay que
 * activar "Allow delivery of PDF and ZIP files" en el dashboard de
 * Cloudinary, en Settings > Security.
 *
 * @param {Buffer} buffer
 * @param {string} carpeta - subcarpeta dentro de "camino-al-deporte/", ej. "tickets".
 */
function subirPdf(buffer, carpeta = 'tickets') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `camino-al-deporte/${carpeta}`,
        // Cloudinary trata los PDF como resource_type "image" (no "raw"):
        // así genera la URL de descarga directa en /image/upload/....pdf.
        resource_type: 'image',
        format: 'pdf',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, subirImagen, borrarImagen, subirPdf };
