// Genera el catálogo de productos en PDF, en cuadrícula tipo "hoja de
// catálogo impreso" (foto, nombre, precio y tallas disponibles), a partir
// de la misma lista de productos que ya arma GET /productos con sus
// filtros (marca, categoría, modelo, talla, texto).
//
// Hay dos formatos (ver opción `unaPagina`):
//   - Multipágina (por defecto): tamaño carta, con salto de página normal
//     y numeración "Página X de Y" — pensado para imprimir.
//   - Una sola página larga: todo el catálogo cabe en una única página
//     vertical, sin cortes — pensado para compartir digitalmente
//     (WhatsApp, etc.), donde el lector de PDF simplemente hace scroll.
//     Usa el mismo truco de "medir y luego dibujar" que ya usan
//     ticketPdf.js/apartadoPdf.js (ver medirAltoContenido en
//     ticketEstilo.js): primero se calcula cuánto va a medir el contenido
//     y luego se crea la página exacta de ese alto.
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
const RESERVA_PIE = 26; // espacio reservado al fondo de cada página (modo multipágina) para el pie ("Página X de Y")
const ANCHO_PAGINA = 612; // ancho carta (Letter) en los dos formatos, para que la cuadrícula se vea igual

// Normaliza puntuación "tipográfica" (guiones en/em, comillas curvas,
// puntos suspensivos) a su equivalente ASCII. Algunos nombres de producto
// traen un guion largo entre el modelo y el colorway (ej. llegó así de una
// importación de Excel/KicksDB) y la fuente estándar que usa este PDF
// (Helvetica) no lo soporta: en vez de un guion, dibuja "Ð". Se limpia
// aquí para que ese carácter roto nunca aparezca en el catálogo.
function limpiarTexto(texto) {
  if (!texto) return texto;
  return String(texto)
    .replace(/[‒–—―]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...');
}

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

// Alto que ocupa el encabezado (franja + título + subtítulo + línea de
// filtros opcional + separador), medido desde el borde superior de la
// página. Se usa TANTO para calcular el alto exacto de la página en el
// formato de una sola página, COMO dentro de dibujarEncabezadoPagina() al
// dibujarlo de verdad — una sola fórmula, para que nunca se desincronicen.
function alturaEncabezado(filtrosTexto) {
  const yTitulo = 26;
  let yLinea = yTitulo + 34;
  if (filtrosTexto) yLinea += 14;
  return yLinea + 16;
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
    doc.text(limpiarTexto(filtrosTexto), left, yLinea, { width: contentWidth });
    yLinea += 14;
  }

  doc.moveTo(left, yLinea + 4).lineTo(right, yLinea + 4).strokeColor(PALETA.borde).lineWidth(1).stroke();
  doc.fillColor(PALETA.texto);
  doc.y = alturaEncabezado(filtrosTexto);
  doc.x = left;
}

function dibujarPiePagina(doc, { left, right, pagina, totalPaginas }) {
  // OJO: debe quedar DENTRO de doc.page.maxY() (height - margins.bottom).
  // Si se dibuja más abajo, pdfkit entiende que el texto "no cabe" y
  // agrega una página nueva en blanco antes de escribirlo — de ahí salían
  // las páginas en blanco de más que se veían en la primera versión.
  const y = doc.page.height - doc.page.margins.bottom - RESERVA_PIE + 6;
  doc.font('Helvetica').fontSize(7.5).fillColor(PALETA.textoMuted);
  doc.text(`Página ${pagina} de ${totalPaginas}`, left, y, { width: right - left, align: 'center', height: 12 });
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
  doc.text(limpiarTexto(producto.nombre), x, cursorY, { width: ancho, height: 21, ellipsis: true });
  cursorY += 22;

  if (incluirPrecio) {
    const precio = Number(producto.precioVenta);
    // Un producto con precio en 0 (todavía no le capturaron precio de
    // venta) no debe salir como "$0.00" en un catálogo que se manda a un
    // cliente — se avisa en vez de eso.
    const hayPrecio = Number.isFinite(precio) && precio > 0;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hayPrecio ? PALETA.primarioOscuro : PALETA.textoMuted);
    doc.text(hayPrecio ? `$${moneda(producto.precioVenta)}` : 'Precio a consultar', x, cursorY, { width: ancho });
    cursorY += 13;
  }

  const { valores, agotado } = tallasDisponibles(producto);
  const textoTallas = agotado ? 'Agotado' : `Tallas: ${valores.join(', ')}`;
  doc.font('Helvetica').fontSize(7.5).fillColor(agotado ? PALETA.peligro : PALETA.textoMuted);
  doc.text(textoTallas, x, cursorY, { width: ancho, height: 18, ellipsis: true });
  doc.fillColor(PALETA.texto);
}

// Dibuja la cuadrícula completa SIN preocuparse por saltos de página (la
// página ya se creó con el alto exacto que necesita, ver
// generarPdfUnaPagina).
function dibujarCuadriculaUnaPagina(doc, productos, imagenes, { left, anchoCelda, incluirPrecio, yInicial }) {
  let col = 0;
  let y = yInicial;
  productos.forEach((producto) => {
    const x = left + col * (anchoCelda + GUTTER);
    dibujarCeldaProducto(doc, producto, imagenes.get(producto.id), { x, y, ancho: anchoCelda, incluirPrecio });
    col += 1;
    if (col >= COLUMNAS) {
      col = 0;
      y += ALTO_CELDA;
    }
  });
}

function generarPdfMultipagina(productos, imagenes, { incluirPrecio, filtrosTexto }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const anchoCelda = (right - left - GUTTER * (COLUMNAS - 1)) / COLUMNAS;
    const pageBottom = doc.page.height - doc.page.margins.bottom - RESERVA_PIE;

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

function generarPdfUnaPagina(productos, imagenes, { incluirPrecio, filtrosTexto }) {
  return new Promise((resolve, reject) => {
    const filas = Math.max(1, Math.ceil(productos.length / COLUMNAS));
    // Alto exacto: encabezado + todas las filas + un margen de respiro al
    // final. Se calcula ANTES de crear el documento porque el tamaño de
    // página se fija al construirlo (no se puede cambiar después).
    const alturaPagina = alturaEncabezado(filtrosTexto) + filas * ALTO_CELDA + MARGEN;

    const doc = new PDFDocument({ size: [ANCHO_PAGINA, alturaPagina], margin: MARGEN });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const anchoCelda = (right - left - GUTTER * (COLUMNAS - 1)) / COLUMNAS;

    dibujarEncabezadoPagina(doc, { left, right, filtrosTexto });
    dibujarCuadriculaUnaPagina(doc, productos, imagenes, { left, anchoCelda, incluirPrecio, yInicial: doc.y });

    doc.end();
  });
}

/**
 * @param {Array} productos - productos con marca, imagenes[] y variantes[]
 *   (con talla y existencias), igual al include de GET /productos.
 * @param {{incluirPrecio?: boolean, filtrosTexto?: string, unaPagina?: boolean}} [opciones]
 *   unaPagina: true genera una sola página larga sin cortes (pensada para
 *   compartir digitalmente) en vez del formato multipágina para imprimir.
 * @returns {Promise<Buffer>}
 */
async function generarCatalogoPdf(productos, { incluirPrecio = true, filtrosTexto = '', unaPagina = false } = {}) {
  const imagenes = await descargarImagenes(productos);
  return unaPagina
    ? generarPdfUnaPagina(productos, imagenes, { incluirPrecio, filtrosTexto })
    : generarPdfMultipagina(productos, imagenes, { incluirPrecio, filtrosTexto });
}

module.exports = { generarCatalogoPdf };
