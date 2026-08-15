// Genera el comprobante en PDF de un apartado (al crearlo o al registrar un
// abono), con el mismo diseño de "ticket de tienda" que utils/ticketPdf.js:
// encabezado, tabla de artículos, y aquí además el desglose de cuánto se ha
// pagado, cuánto falta, y la fecha límite para recoger el pedido. Se manda
// como el "header" tipo documento de la plantilla de WhatsApp (ver
// config/whatsapp.js) y también se puede abrir/descargar a mano desde el
// dashboard mientras la API no esté configurada (ver routes/apartados.js).
//
// Igual que con el ticket de venta: cambiar este diseño NO requiere volver
// a mandar ninguna plantilla de WhatsApp a revisión de Meta — la plantilla
// solo define la estructura del mensaje, nunca el contenido visual del PDF
// adjunto.

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const COL_CANT = 32;
const COL_IMPORTE = 90;

function moneda(valor) {
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, fechaLimite: Date|string|null, cliente?: {nombre?: string}, sucursalVenta?: {nombre?: string}, creadoPor?: {nombre?: string}, items: Array<{cantidad: number, precioUnitario: number|string, subtotal: number|string, variante?: {color?: string|null, talla?: {valor?: string}|null, producto?: {nombre?: string}}}>}} apartado
 * @param {number} pagadoTotal - suma de todos los abonos/anticipos a la fecha (incluye el de este evento, si aplica)
 * @param {number|null} [montoEsteEvento] - anticipo/abono que generó este comprobante en particular; null si no aplica
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas"
 * @returns {Promise<Buffer>}
 */
async function generarComprobanteApartado(apartado, pagadoTotal, montoEsteEvento, whatsappContacto) {
  let barcodeBuffer = null;
  try {
    barcodeBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: apartado.folio,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 8,
    });
  } catch (err) {
    console.error('Error generando el código de barras del comprobante de apartado:', err);
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
    doc.font('Helvetica-Bold').fontSize(10).text('COMPROBANTE DE APARTADO', { align: 'center' });
    doc.x = left;
    lineaSeparadora();

    // Datos del apartado
    doc.fontSize(9);
    const dato = (etiqueta, valor) => {
      doc.x = left;
      doc.font('Helvetica-Bold').text(etiqueta, { continued: true });
      doc.font('Helvetica').text(` ${valor}`);
    };
    dato('Folio:', apartado.folio);
    dato('Fecha:', new Date(apartado.createdAt).toLocaleString('es-MX'));
    if (apartado.sucursalVenta?.nombre) dato('Sucursal:', apartado.sucursalVenta.nombre);
    if (apartado.creadoPor?.nombre) dato('Vendedor:', apartado.creadoPor.nombre);
    if (apartado.cliente?.nombre) dato('Cliente:', apartado.cliente.nombre);
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

    apartado.items.forEach((it) => {
      const detalle = [it.variante?.talla?.valor, it.variante?.color].filter(Boolean).join(' / ');
      const descripcion = `${it.variante?.producto?.nombre || 'Producto'}${detalle ? ` (${detalle})` : ''}`;
      const precio = moneda(it.precioUnitario);
      const subtotal = moneda(it.subtotal);
      const yFila = doc.y;
      const alturaDescripcion = doc.heightOfString(descripcion, { width: colDescWidth, fontSize: 9 });

      doc.font('Helvetica').fontSize(9);
      doc.text(String(it.cantidad), left, yFila, { width: COL_CANT });
      doc.text(descripcion, left + COL_CANT, yFila, { width: colDescWidth });
      doc.font('Helvetica-Bold').text(`$${subtotal}`, right - COL_IMPORTE, yFila, { width: COL_IMPORTE, align: 'right' });

      const ySubnota = yFila + alturaDescripcion + 2;
      const subnotaTexto = `${it.cantidad} x $${precio}`;
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text(subnotaTexto, left + COL_CANT, ySubnota, { width: colDescWidth });
      doc.fillColor('#000000');

      doc.y = ySubnota + doc.heightOfString(subnotaTexto, { width: colDescWidth, fontSize: 8 }) + 6;
      doc.x = left;
    });

    lineaSeparadora();

    // Fila de "etiqueta: valor" reutilizable para Total/Abono/Pagado/Saldo/Fecha límite.
    const filaMonto = (
      etiqueta,
      valor,
      { boldEtiqueta = false, boldValor = false, fontSize = 9, color = null } = {}
    ) => {
      doc.fontSize(fontSize);
      const yFila = doc.y;
      doc.font(boldEtiqueta ? 'Helvetica-Bold' : 'Helvetica').fillColor(color || '#000000').text(etiqueta, left, yFila);
      doc.font(boldValor ? 'Helvetica-Bold' : 'Helvetica').fillColor(color || '#000000').text(valor, right - COL_IMPORTE, yFila, {
        width: COL_IMPORTE,
        align: 'right',
      });
      doc.fillColor('#000000');
      doc.y = yFila + doc.heightOfString(etiqueta, { fontSize }) + 4;
      doc.x = left;
    };

    filaMonto('TOTAL', `$${moneda(apartado.total)}`, { boldEtiqueta: true, boldValor: true, fontSize: 13 });

    if (montoEsteEvento != null) {
      const esAnticipo = Math.abs(pagadoTotal - montoEsteEvento) < 0.01;
      filaMonto(esAnticipo ? 'Anticipo recibido hoy:' : 'Abono recibido hoy:', `$${moneda(montoEsteEvento)}`, {
        boldValor: true,
        color: '#1e7e34',
      });
    }

    filaMonto('Pagado a la fecha:', `$${moneda(pagadoTotal)}`);

    const saldoPendiente = Math.max(Number(apartado.total) - pagadoTotal, 0);
    filaMonto('Saldo pendiente:', `$${moneda(saldoPendiente)}`, {
      boldEtiqueta: true,
      boldValor: true,
      fontSize: 12,
      color: saldoPendiente > 0.01 ? '#c0392b' : '#1e7e34',
    });

    filaMonto(
      'Fecha límite para recoger:',
      apartado.fechaLimite ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX') : 'Sin fecha límite'
    );

    lineaSeparadora();

    // Agradecimiento y contacto
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000000')
      .text(saldoPendiente > 0.01 ? '¡Gracias por tu apartado!' : '¡Ya está liquidado, listo para recoger!', {
        align: 'center',
      });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9).text('Presenta este comprobante o tu folio para recoger tu pedido.', { align: 'center' });
    if (whatsappContacto) {
      doc.moveDown(0.2);
      doc.text('Dudas:', { align: 'center' });
      doc.font('Helvetica-Bold').text(whatsappContacto, { align: 'center' });
    }
    doc.moveDown(0.8);

    // Código de barras del folio (para verificar el apartado al recogerlo).
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
    doc.font('Helvetica').fontSize(7).fillColor('#555555').text('Conserva este comprobante.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generarComprobanteApartado };
