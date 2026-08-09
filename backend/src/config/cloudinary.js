const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un buffer de imagen (ya validado por multer) a Cloudinary, dentro de
 * la carpeta "camino-al-deporte/productos". Devuelve { url, publicId }.
 */
function subirImagen(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'camino-al-deporte/productos',
        resource_type: 'image',
        // Redimensiona a un máximo razonable para catálogo (ahorra espacio
        // y hace que la app cargue más rápido) sin recortar la imagen.
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

module.exports = { cloudinary, subirImagen, borrarImagen };
