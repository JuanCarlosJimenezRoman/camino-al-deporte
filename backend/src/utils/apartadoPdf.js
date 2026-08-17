// Genera el comprobante en PDF de un apartado (al crearlo o al registrar un
// abono), con el mismo diseño de "ticket de tienda" que utils/ticketPdf.js:
// encabezado con marca, tabla de artículos, y aquí además el desglose de
// cuánto se ha pagado, cuánto falta (en una caja de énfasis, como el TOTAL
// del ticket de venta), y la fecha límite para recoger el pedido. Se manda
// como el "header" tipo documento de la plantilla de WhatsApp (ver
// config/whatsapp.js) y también se puede abrir/descargar a mano desde el
// dashboard mientras la API no esté configurada (ver routes/apartados.js).
//
// Igual que con el ticket de venta: cambiar este diseño NO requiere volver
// a mandar ninguna plantilla de WhatsApp a revisión de Meta — la plantilla
// solo define la estructura del mensaje, nunca el contenido visual del PDF
// adjunto.
//
// El estilo (colores, insignia, cajas redondeadas, línea punteada) vive en
// utils/ticketEstilo.js y se comparte con ticketPdf.js.

const PDFDocument = require('pdfkit');
const {
  PALETA,
  moneda,
  generarBarcodeBuffer,
  dibujarEncabezado,
  dibujarSeparador,
  crearFilaDato,
  crearFilaMonto,
  dibujarCajaMonto,
  dibujarBarcode,
  dibujarPieLegal,
} = require('./ticketEstilo');

const COL_CANT = 32;
const COL_IMPORTE = 90;

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, fechaLimite: Date|string|null, cliente?: {nombre?: string}, sucursalVenta?: {nombre?: string, telefono?: string|null}, creadoPor?: {nombre?: string}, items: Array<{cantidad: number, precioUnitario: number|string, subtotal: number|string, variante?: {color?: string|null, talla?: {valor?: string}|null, producto?: {nombre?: string}}}>}} apartado
 * @param {number} pagadoTotal - suma de todos los abonos/anticipos a la fecha (incluye el de este evento, si aplica)
 * @param {number|null} [montoEsteEvento] - anticipo/abono que generó este comprobante en particular; null si no aplica
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas"
 * @returns {Promise<Buffer>}
 */
async function generarComprobanteApartado(apartado, pagadoTotal, montoEsteEvento, whatsappContacto) {
  const barcodeBuffer = await generarBarcodeBuffer(apartado.folio);

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

    const dato = crearFilaDato(doc, { left, right });
    const filaMonto = crearFilaMonto(doc, { left, right }, COL_IMPORTE);

    // Encabezado
    dibujarEncabezado(doc, {
      left,
      right,
      subtitulo: 'COMPROBANTE DE APARTADO',
      lineaContacto: apartado.sucursalVenta?.telefono
        ? `${apartado.sucursalVenta.nombre || ''}${apartado.sucursalVenta.nombre ? ' · ' : ''}Tel: ${apartado.sucursalVenta.telefono}`
        : apartado.sucursalVenta?.nombre,
    });
    dibujarSeparador(doc, { left, right });

    // Datos del apartado
    dato('Folio', apartado.folio);
    dato('Fecha', new Date(apartado.createdAt).toLocaleString('es-MX'));
    if (apartado.sucursalVenta?.nombre) dato('Sucursal', apartado.sucursalVenta.nombre);
    if (apartado.creadoPor?.nombre) dato('Vendedor', apartado.creadoPor.nombre);
    if (apartado.cliente?.nombre) dato('Cliente', apartado.cliente.nombre);
    dibujarSeparador(doc, { left, right });

    // Tabla de artículos
    doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(10).text('ARTÍCULOS', left, doc.y);
    doc.fillColor(PALETA.texto);
    doc.moveDown(0.3);
    const yCabecera = doc.y;
    doc.fillColor(PALETA.textoMuted).font('Helvetica-Bold').fontSize(8);
    doc.text('CANT.', left, yCabecera, { width: COL_CANT });
    doc.text('DESCRIPCIÓN', left + COL_CANT, yCabecera, { width: colDescWidth });
    doc.text('IMPORTE', right - COL_IMPORTE, yCabecera, { width: COL_IMPORTE, align: 'right' });
    doc.fillColor(PALETA.texto);
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
      doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted).text(subnotaTexto, left + COL_CANT, ySubnota, { width: colDescWidth });
      doc.fillColor(PALETA.texto);

      doc.y = ySubnota + doc.heightOfString(subnotaTexto, { width: colDescWidth, fontSize: 8 }) + 6;
      doc.x = left;
    });

    dibujarSeparador(doc, { left, right });

    filaMonto('Total', `$${moneda(apartado.total)}`, { boldEtiqueta: true, boldValor: true, fontSize: 11 });

    if (montoEsteEvento != null) {
      const esAnticipo = Math.abs(pagadoTotal - montoEsteEvento) < 0.01;
      filaMonto(esAnticipo ? 'Anticipo recibido hoy' : 'Abono recibido hoy', `$${moneda(montoEsteEvento)}`, {
        boldValor: true,
        color: PALETA.exito,
      });
    }

    filaMonto('Pagado a la fecha', `$${moneda(pagadoTotal)}`);
    doc.moveDown(0.15);

    // Caja de énfasis con lo más importante para el cliente: cuánto falta
    // (o que ya quedó liquidado), igual de destacada que el TOTAL del
    // ticket de venta.
    const saldoPendiente = Math.max(Number(apartado.total) - pagadoTotal, 0);
    const liquidado = saldoPendiente <= 0.01;
    dibujarCajaMonto(doc, {
      left,
      right,
      etiqueta: liquidado ? 'Liquidado' : 'Saldo pendiente',
      valor: `$${moneda(liquidado ? apartado.total : saldoPendiente)}`,
      colorFondo: liquidado ? PALETA.fondoExito : PALETA.fondoPeligro,
      colorTexto: liquidado ? PALETA.exito : PALETA.peligro,
    });

    filaMonto(
      'Fecha límite para recoger',
      apartado.fechaLimite ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX') : 'Sin fecha límite'
    );

    dibujarSeparador(doc, { left, right });

    // Agradecimiento y contacto
    doc
      .fillColor(PALETA.primarioOscuro)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(liquidado ? '¡YA ESTÁ LISTO PARA RECOGER!' : '¡GRACIAS POR TU APARTADO!', { align: 'center' });
    doc.fillColor(PALETA.texto);
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(9).fillColor(PALETA.textoMuted).text('Presenta este comprobante o tu folio para recoger tu pedido.', { align: 'center' });
    doc.fillColor(PALETA.texto);
    if (whatsappContacto) {
      doc.moveDown(0.15);
      doc.font('Helvetica').fontSize(9).fillColor(PALETA.textoMuted).text('Dudas:', { align: 'center' });
      doc.font('Helvetica-Bold').fillColor(PALETA.texto).text(whatsappContacto, { align: 'center' });
    }
    doc.moveDown(0.7);

    dibujarBarcode(doc, { left, contentWidth, buffer: barcodeBuffer });

    doc.x = left;
    dibujarSeparador(doc, { left, right, punteado: true });
    dibujarPieLegal(doc, { left, right, mensajeExtra: 'Conserva este comprobante.' });

    doc.end();
  });
}

module.exports = { generarComprobanteApartado };
