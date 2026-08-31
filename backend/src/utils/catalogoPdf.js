// Genera el catálogo de productos en PDF, en cuadrícula tipo "hoja de
// catálogo impreso" (foto, nombre, precio y tallas disponibles), a partir
// de la misma lista de productos que ya arma GET /productos con sus
// filtros (marca, categoría, modelo, talla, texto).
//
// Pensado para reemplazar la práctica de mandarle al cliente una captura de
// pantalla de la tienda filtrada: la captura se ve pixeleada, trae
// encimados los botones/iconos de la página y no queda lista para
// imprimir. Este PDF toma las fotos directo de Cloudinary (en una
// resolución pensada para el documento, no la de 1200x1200 que se guarda
// para la tienda) y arma un documento con encabezado, cuadrícula y
// numeración de página, listo para mandar o imprimir.
//
// Reutiliza PALETA/moneda de ticketEstilo.js para que el documento se vea
// del mismo sistema visual que los tickets y comprobantes de venta.

const PDFDocument = require('pdfkit');
const { PALETA, moneda } = require('./ticketEstilo');

const COLUMNAS = 4;
const MARGEN = 28;
const GUTTER = 12;
const ALTO_IMAGEN = 118;
const ALTO_CELDA = 186;

// Inserta una transformación de Cloudinary en la URL (recorte cuadrado,
// calidad automática, formato jpg) para pedir una imagen del tamaño justo
// que necesita el PDF. Si la URL no es de Cloudinary (o no trae "/upload/"),
// se usa tal cual.
function urlCloudinaryParaPdf(url) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/w_400,h_400,c_fill,q_auto:good,f_jpg/');
}

// Descarga hasta `concurrencia` imágenes a la vez (en vez de las decenas
// de un catálogo completo todas de golpe) y regresa un Map
// productoId -> Buffer|null. Es best-effort: si una imagen en particular
// falla (URL caída, formato raro, etc.), esa celda se dibuja con un
// placeholder en vez de tronar el documento completo.
async function descargarImagenes(productos, concurrencia = 6) {
  const resultado = new Map();
  const cola = [...productos];

  async function trabajador() {
    while (cola.length) {
      const producto = cola.shift();
      const imagen = producto.imagenes && producto.imagenes[0];
      if (!imagen) {
        resultado.set(producto.id, null);
        continue;
      }
      try {
        const resp = await fetch(urlCloudinaryParaPdf(imagen.url));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        resultado.set(producto.id, Buffer.from(await resp.arrayBuffer()));
      } catch (err) {
        console.error(`Catálogo PDF: no se pudo descargar la imagen del producto ${producto.id}:`, err.message);
        resultado.set(producto.id, null);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, productos.length) }, trabajador));
  return resultado;
}

// Tallas a mostrar en la celda: primero se intenta solo con las que
// realmente tienen stock (sumando todas las sucursales, como en la tienda
// pública); si ninguna tiene stock, se listan todas las variantes activas
// del producto (para no dejar la celda vacía) y se marca "Agotado".
function tallasDisponibles(producto) {
  const activas = (producto.variantes || []).filter((v) => v.activo !== false);
  const conStock = activas.filter(
    (v) => (v.existencias || []).reduce((acc, e) => acc + e.stockActual, 0) > 0
  );
  const base = conStock.length ? conStock : activas;
  const valores = [...new Set(base.map((v) => v.talla && v.talla.valor).filter(Boolean))];
  valores.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
  return { valores, agotado: conStock.length === 0 };
}

function dibujarEncabezadoPagina(doc, { left, right, filtrosTexto }) {
  const contentWidth = right - left;
  doc.rect(0, 0, doc.page.width, 8).fill(PALETA.primario);

  const yTitulo = 26;
  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(16);
  doc.text('CAMINO AL DEPORTE', left, yTitulo, { width: contentWidth - 130 });

  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted);
  doc.text(fecha, right - 130, yTitulo + 4, { width: 130, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(PALETA.textoMuted);
  doc.text('CATÁLOGO DE PRODUCTOS', left, yTitulo + 20, { width: contentWidth });

  let yLinea = yTitulo + 34;
  if (filtrosTexto) {
    doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted);
    doc.text(filtrosTexto, left, yLinea, { width: contentWidth });
    yLinea += 14;
  }

  doc.moveTo(left, yLinea + 4).lineTo(right, yLinea + 4).strokeColor(PALETA.borde).lineWidth(1).stroke();
  doc.fillColor(PALETA.texto);
  doc.y = yLinea + 16;
  doc.x = left;
}

function dibujarPiePagina(doc, { left, right, pagina, totalPaginas }) {
  const y = doc.page.height - doc.page.margins.bottom + 8;
  doc.font('Helvetica').fontSize(7.5).fillColor(PALETA.textoMuted);
  doc.text(`Página ${pagina} de ${totalPaginas}`, left, y, { width: right - left, align: 'center' });
  doc.fillColor(PALETA.texto);
}

function dibujarCeldaProducto(doc, producto, imagenBuffer, { x, y, ancho, incluirPrecio }) {
  // Marco/placeholder de la foto (queda visible si la imagen falla o el
  // producto no tiene ninguna).
  doc.roundedRect(x, y, ancho, ALTO_IMAGEN, 4).fill('#F1F5F9');

  if (imagenBuffer) {
    try {
      doc.save();
      doc.roundedRect(x, y, ancho, ALTO_IMAGEN, 4).clip();
      doc.image(imagenBuffer, x, y, { fit: [ancho, ALTO_IMAGEN], align: 'center', valign: 'center' });
      doc.restore();
    } catch (err) {
      // Buffer corrupto o formato que pdfkit no soporta: se queda el
      // placeholder que ya se dibujó arriba.
      console.error(`Catálogo PDF: no se pudo dibujar la imagen del producto ${producto.id}:`, err.message);
    }
  } else {
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(8);
    doc.text('Sin foto', x, y + ALTO_IMAGEN / 2 - 4, { width: ancho, align: 'center' });
  }
  doc.fillColor(PALETA.texto);

  let cursorY = y + ALTO_IMAGEN + 6;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PALETA.texto);
  doc.text(producto.nombre, x, cursorY, { width: ancho, height: 21, ellipsis: true });
  cursorY += 22;

  if (incluirPrecio) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PALETA.primarioOscuro);
    doc.text(`$${moneda(producto.precioVenta)}`, x, cursorY, { width: ancho });
    cursorY += 13;
  }

  const { valores, agotado } = tallasDisponibles(producto);
  const textoTallas = agotado ? 'Agotado' : `Tallas: ${valores.join(', ')}`;
  doc.font('Helvetica').fontSize(7.5).fillColor(agotado ? PALETA.peligro : PALETA.textoMuted);
  doc.text(textoTallas, x, cursorY, { width: ancho, height: 18, ellipsis: true });
  doc.fillColor(PALETA.texto);
}

/**
 * @param {Array} productos - productos con marca, imagenes[] y variantes[]
 *   (con talla y existencias), igual al include de GET /productos.
 * @param {{incluirPrecio?: boolean, filtrosTexto?: string}} [opciones]
 * @returns {Promise<Buffer>}
 */
async function generarCatalogoPdf(productos, { incluirPrecio = true, filtrosTexto = '' } = {}) {
  const imagenes = await descargarImagenes(productos);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const anchoCelda = (right - left - GUTTER * (COLUMNAS - 1)) / COLUMNAS;
    const pageBottom = doc.page.height - doc.page.margins.bottom - 20;

    let col = 0;
    let y;

    function nuevaPagina() {
      doc.addPage();
      dibujarEncabezadoPagina(doc, { left, right, filtrosTexto });
      y = doc.y;
      col = 0;
    }

    dibujarEncabezadoPagina(doc, { left, right, filtrosTexto });
    y = doc.y;

    productos.forEach((producto) => {
      // Solo se revisa el espacio al iniciar una fila nueva (col === 0):
      // así nunca se corta una fila a la mitad entre una página y la
      // siguiente.
      if (col === 0 && y + ALTO_CELDA > pageBottom) {
        nuevaPagina();
      }
      const x = left + col * (anchoCelda + GUTTER);
      dibujarCeldaProducto(doc, producto, imagenes.get(producto.id), { x, y, ancho: anchoCelda, incluirPrecio });

      col += 1;
      if (col >= COLUMNAS) {
        col = 0;
        y += ALTO_CELDA;
      }
    });

    // Numeración de páginas: se hace al final (bufferPages permite volver
    // a páginas ya dibujadas) porque hasta aquí no se sabe cuántas hubo.
    const totalPaginas = doc.bufferedPageRange().count;
    for (let p = 0; p < totalPaginas; p += 1) {
      doc.switchToPage(p);
      dibujarPiePagina(doc, { left, right, pagina: p + 1, totalPaginas });
    }

    doc.end();
  });
}

module.exports = { generarCatalogoPdf };
