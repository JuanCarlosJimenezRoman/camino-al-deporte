// Genera el PDF del ticket digital de una venta, con diseño de "ticket de
// tienda" (como el de una caja registradora): encabezado, tabla de
// artículos, total, y un código de barras real (Code128) con el folio al
// final, útil para cambios/devoluciones en tienda. Se manda como el
// "header" tipo documento de la plantilla de WhatsApp (ver
// config/whatsapp.js) y también se puede abrir/descargar a mano desde el
// dashboard como respaldo mientras la API de WhatsApp no esté configurada
// (ver routes/ventas.js).
//
// Importante: cambiar este diseño NO requiere volver a mandar la plantilla
// de WhatsApp a revisión de Meta. La plantilla aprobada solo define la
// estructura del mensaje (encabezado tipo documento + el folio como
// variable de texto en el cuerpo), nunca el contenido visual del PDF
// adjunto — ese lo generamos nosotros en cada venta y se puede cambiar
// libremente sin tocar nada del lado de Meta.

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const ETIQUETA_METODO_PAGO = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };

// Ancho de las columnas fijas de la tabla de artículos, en puntos. La
// columna de descripción toma el resto del ancho disponible.
const COL_CANT = 32;
const COL_IMPORTE = 90;

function moneda(valor) {
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, metodoPago: string, sucursal?: {nombre?: string}}} venta
 * @param {Array<{descripcion: string, cantidad: number, precioUnitario: number|string, subtotal: number|string}>} items
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas o cambios"
 * @returns {Promise<Buffer>}
 */
async function generarTicketPdf(venta, items, whatsappContacto) {
  // El código de barras se genera aparte (es async) antes de armar el PDF,
  // para insertarlo como cualquier otra imagen del documento. Si por lo que
  // sea falla, el ticket se genera igual, solo sin el código de barras —
  // nunca debe tumbar el ticket completo por esto.
  let barcodeBuffer = null;
  try {
    barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: venta.folio,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 8,
    });
  } catch (err) {
    console.error('Error generando el código de barras del ticket:', err);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const colDescWidth = contentWidth - COL_CANT - COL_IMPORTE;

    const lineaSeparadora = () => {
      doc.moveDown(0.5);
      doc.strokeColor('#000000').lineWidth(0.75).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.5);
      doc.x = left;
    };

    // Encabezado
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text('CAMINO AL DEPORTE', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10).text('TICKET DE COMPRA', { align: 'center' });
    doc.x = left;
    lineaSeparadora();

    // Datos de la venta (etiqueta en negritas + valor normal, en la misma línea)
    doc.fontSize(9);
    const dato = (etiqueta, valor) => {
      doc.x = left;
      doc.font('Helvetica-Bold').text(etiqueta, { continued: true });
      doc.font('Helvetica').text(` ${valor}`);
    };
    dato('Folio:', venta.folio);
    dato('Fecha:', new Date(venta.createdAt).toLocaleString('es-MX'));
    if (venta.sucursal?.nombre) dato('Sucursal:', venta.sucursal.nombre);
    lineaSeparadora();

    // Tabla de artículos
    doc.font('Helvetica-Bold').fontSize(10).text('ARTÍCULOS', left, doc.y);
    doc.moveDown(0.3);
    const yCabecera = doc.y;
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('CANT.', left, yCabecera, { width: COL_CANT });
    doc.text('DESCRIPCIÓN', left + COL_CANT, yCabecera, { width: colDescWidth });
    doc.text('IMPORTE', right - COL_IMPORTE, yCabecera, { width: COL_IMPORTE, align: 'right' });
    doc.y = yCabecera + doc.heightOfString('CANT.', { width: COL_CANT, fontSize: 8 }) + 4;
    doc.x = left;

    items.forEach((it) => {
      const precio = moneda(it.precioUnitario);
      const subtotal = moneda(it.subtotal);
      const yFila = doc.y;
      const alturaDescripcion = doc.heightOfString(it.descripcion, { width: colDescWidth, fontSize: 9 });

      doc.font('Helvetica').fontSize(9);
      doc.text(String(it.cantidad), left, yFila, { width: COL_CANT });
      doc.text(it.descripcion, left + COL_CANT, yFila, { width: colDescWidth });
      doc.font('Helvetica-Bold').text(`$${subtotal}`, right - COL_IMPORTE, yFila, { width: COL_IMPORTE, align: 'right' });

      const ySubnota = yFila + alturaDescripcion + 2;
      const subnotaTexto = `${it.cantidad} x $${precio}`;
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text(subnotaTexto, left + COL_CANT, ySubnota, { width: colDescWidth });
      doc.fillColor('#000000');

      doc.y = ySubnota + doc.heightOfString(subnotaTexto, { width: colDescWidth, fontSize: 8 }) + 6;
      doc.x = left;
    });

    lineaSeparadora();

    // Total y método de pago
    doc.font('Helvetica-Bold').fontSize(13);
    const yTotal = doc.y;
    doc.text('TOTAL', left, yTotal);
    doc.text(`$${moneda(venta.total)}`, right - COL_IMPORTE, yTotal, { width: COL_IMPORTE, align: 'right' });
    doc.y = yTotal + doc.heightOfString('TOTAL', { fontSize: 13 }) + 6;
    doc.x = left;

    doc.font('Helvetica-Bold').fontSize(9);
    const yPago = doc.y;
    doc.text('Método de pago:', left, yPago);
    doc.font('Helvetica').text(ETIQUETA_METODO_PAGO[venta.metodoPago] || venta.metodoPago, right - COL_IMPORTE, yPago, {
      width: COL_IMPORTE,
      align: 'right',
    });
    doc.y = yPago + doc.heightOfString('Método de pago:', { fontSize: 9 }) + 4;
    doc.x = left;

    lineaSeparadora();

    // Agradecimiento y contacto
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('¡GRACIAS POR TU COMPRA!', { align: 'center' });
    doc.moveDown(0.4);
    if (whatsappContacto) {
      doc.font('Helvetica').fontSize(9).text('Dudas o cambios:', { align: 'center' });
      doc.font('Helvetica-Bold').text(whatsappContacto, { align: 'center' });
    }
    doc.moveDown(0.8);

    // Código de barras del folio (para cambios/devoluciones en tienda).
    // Se centra a mano (calculando x explícito) porque la opción "align"
    // de doc.image() solo aplica cuando se usa "fit"/"cover" — sin eso, la
    // imagen se dibuja pegada al margen izquierdo.
    if (barcodeBuffer) {
      const imagenBarras = doc.openImage(barcodeBuffer);
      const anchoBarras = Math.min(220, contentWidth);
      const altoBarras = (imagenBarras.height / imagenBarras.width) * anchoBarras;
      const xBarras = left + (contentWidth - anchoBarras) / 2;
      doc.image(imagenBarras, xBarras, doc.y, { width: anchoBarras });
      doc.y += altoBarras + 6;
      doc.x = left;
    }

    doc.x = left;
    lineaSeparadora();
    doc.font('Helvetica').fontSize(7).fillColor('#555555').text('Conserve este ticket como comprobante.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generarTicketPdf };
