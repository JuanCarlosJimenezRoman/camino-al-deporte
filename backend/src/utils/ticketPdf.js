// Genera el PDF del ticket digital de una venta. Se manda como el "header"
// tipo documento de la plantilla de WhatsApp (ver config/whatsapp.js) y
// también se puede abrir/descargar a mano desde el dashboard como respaldo
// mientras la API de WhatsApp no esté configurada (ver routes/ventas.js).

const PDFDocument = require('pdfkit');

const ETIQUETA_METODO_PAGO = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, metodoPago: string, sucursal?: {nombre?: string}}} venta
 * @param {Array<{descripcion: string, cantidad: number, precioUnitario: number|string, subtotal: number|string}>} items
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas o cambios"
 * @returns {Promise<Buffer>}
 */
function generarTicketPdf(venta, items, whatsappContacto) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000').text('Camino al Deporte', { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('Ticket de compra', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.2);

    doc.fontSize(9);
    doc.text(`Folio: ${venta.folio}`);
    doc.text(`Fecha: ${new Date(venta.createdAt).toLocaleString('es-MX')}`);
    if (venta.sucursal?.nombre) doc.text(`Sucursal: ${venta.sucursal.nombre}`);
    doc.moveDown(0.8);

    doc
      .strokeColor('#cccccc')
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(9).text('Artículos');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    items.forEach((it) => {
      doc.fillColor('#000000').fontSize(9).text(it.descripcion);
      const precio = Number(it.precioUnitario).toFixed(2);
      const subtotal = Number(it.subtotal).toFixed(2);
      doc.fontSize(8).fillColor('#555555').text(`  ${it.cantidad} x $${precio} = $${subtotal}`);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.2);
    doc
      .strokeColor('#cccccc')
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.8);

    // Línea de descuento, solo si el vendedor aplicó uno (ver
    // Venta.descuentoMonto en routes/ventas.js) — así el ticket deja
    // constancia de cuánto se descontó, no solo el total ya rebajado.
    if (venta.descuentoMonto && Number(venta.descuentoMonto) > 0) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555555')
        .text(`Descuento: -$${Number(venta.descuentoMonto).toFixed(2)}`, { align: 'right' });
      doc.fillColor('#000000');
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text(`Total: $${venta.total}`, { align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Método de pago: ${ETIQUETA_METODO_PAGO[venta.metodoPago] || venta.metodoPago}`, { align: 'right' });

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor('#555555').text('¡Gracias por tu compra!', { align: 'center' });
    if (whatsappContacto) {
      doc.text(`Dudas o cambios, contáctanos: ${whatsappContacto}`, { align: 'center' });
    }

    doc.end();
  });
}

module.exports = { generarTicketPdf };
