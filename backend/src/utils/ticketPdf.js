// Genera el PDF del ticket digital de una venta, con diseño de "ticket de
// tienda" (como el de una caja registradora): franja de color e insignia de
// marca, tabla de artículos, caja de TOTAL, y un código de barras real
// (Code128) con el folio al final, útil para cambios/devoluciones en
// tienda. Se manda como el "header" tipo documento de la plantilla de
// WhatsApp (ver config/whatsapp.js) y también se puede abrir/descargar a
// mano desde el dashboard como respaldo mientras la API de WhatsApp no esté
// configurada (ver routes/ventas.js).
//
// Importante: cambiar este diseño NO requiere volver a mandar la plantilla
// de WhatsApp a revisión de Meta. La plantilla aprobada solo define la
// estructura del mensaje (encabezado tipo documento + el folio como
// variable de texto en el cuerpo), nunca el contenido visual del PDF
// adjunto — ese lo generamos nosotros en cada venta y se puede cambiar
// libremente sin tocar nada del lado de Meta.
//
// El estilo (colores, insignia, cajas redondeadas, línea punteada) vive en
// utils/ticketEstilo.js y se comparte con apartadoPdf.js, para que ambos
// documentos se vean como el mismo sistema visual.

const PDFDocument = require('pdfkit');
const {
  ANCHO_TICKET,
  MARGEN_TICKET,
  medirAltoContenido,
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
const { ZONA_NEGOCIO } = require('./fechas');

const ETIQUETA_METODO_PAGO = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };

// Ancho de las columnas fijas de la tabla de artículos, en puntos. La
// columna de descripción toma el resto del ancho disponible.
const COL_CANT = 32;
const COL_IMPORTE = 90;

// Dibuja el ticket completo sobre "doc" (que ya trae su tamaño de página
// definido). Es la MISMA función la que se usa para medir cuánto mide el
// contenido (ver medirAltoContenido en ticketEstilo.js) y para generar el
// PDF real — así el alto calculado siempre coincide exactamente con lo que
// se dibuja después.
function dibujarTicket(doc, { venta, items, whatsappContacto, barcodeBuffer }) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  const colDescWidth = contentWidth - COL_CANT - COL_IMPORTE;

  const dato = crearFilaDato(doc, { left, right });
  const filaMonto = crearFilaMonto(doc, { left, right }, COL_IMPORTE);

  // Encabezado: franja de color, insignia y datos de la sucursal.
  dibujarEncabezado(doc, {
    left,
    right,
    subtitulo: 'TICKET DE COMPRA',
    lineaContacto: venta.sucursal?.telefono ? `${venta.sucursal.nombre || ''}${venta.sucursal.nombre ? ' · ' : ''}Tel: ${venta.sucursal.telefono}` : venta.sucursal?.nombre,
  });
  dibujarSeparador(doc, { left, right });

  // Datos de la venta, estilo "campo de formulario" (con línea punteada
  // debajo de cada uno).
  dato('Folio', venta.folio);
  // timeZone explícito: el servidor corre en UTC (Render), así que sin esto
  // la hora impresa en el ticket sale adelantada (la hora UTC, no la de
  // México) — ver ZONA_NEGOCIO en utils/fechas.js.
  dato('Fecha', new Date(venta.createdAt).toLocaleString('es-MX', { timeZone: ZONA_NEGOCIO }));
  if (venta.sucursal?.nombre) dato('Sucursal', venta.sucursal.nombre);
  if (venta.usuario?.nombre) dato('Vendedor', venta.usuario.nombre);
  if (venta.cliente) dato('Cliente', venta.cliente);
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
    doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted).text(subnotaTexto, left + COL_CANT, ySubnota, { width: colDescWidth });
    doc.fillColor(PALETA.texto);

    doc.y = ySubnota + doc.heightOfString(subnotaTexto, { width: colDescWidth, fontSize: 8 }) + 6;
    doc.x = left;
  });

  dibujarSeparador(doc, { left, right });

  // Subtotal y descuento (solo si el cajero aplicó uno) — el subtotal se
  // recalcula sumando los renglones, ya que venta.total viene con el
  // descuento ya aplicado.
  const descuentoMonto = Number(venta.descuentoMonto || 0);
  if (descuentoMonto > 0) {
    const subtotalItems = items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    filaMonto('Subtotal', `$${moneda(subtotalItems)}`);
    const etiquetaDescuento =
      venta.descuentoTipo === 'PORCENTAJE' ? `Descuento (${Number(venta.descuentoValor)}%)` : 'Descuento';
    filaMonto(etiquetaDescuento, `-$${moneda(descuentoMonto)}`, { color: PALETA.exito });
    if (venta.descuentoMotivo) {
      doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted).text(`Motivo: ${venta.descuentoMotivo}`, left, doc.y, { width: contentWidth });
      doc.fillColor(PALETA.texto);
      doc.moveDown(0.2);
      doc.x = left;
    }
    doc.moveDown(0.15);
  }

  // Caja de énfasis con el TOTAL.
  dibujarCajaMonto(doc, { left, right, etiqueta: 'Total', valor: `$${moneda(venta.total)}` });

  // Método de pago y, si fue en efectivo, cuánto se recibió y el cambio
  // que se dio.
  filaMonto('Método de pago', ETIQUETA_METODO_PAGO[venta.metodoPago] || venta.metodoPago);
  if (venta.metodoPago === 'EFECTIVO' && venta.efectivoRecibido != null) {
    const cambio = Number(venta.efectivoRecibido) - Number(venta.total);
    filaMonto('Efectivo recibido', `$${moneda(venta.efectivoRecibido)}`);
    filaMonto('Cambio', `$${moneda(cambio)}`, { boldValor: true });
  }

  dibujarSeparador(doc, { left, right });

  // Agradecimiento y contacto
  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(12).text('¡GRACIAS POR TU COMPRA!', { align: 'center' });
  doc.fillColor(PALETA.texto);
  doc.moveDown(0.35);
  if (whatsappContacto) {
    doc.font('Helvetica').fontSize(9).fillColor(PALETA.textoMuted).text('Dudas o cambios:', { align: 'center' });
    doc.font('Helvetica-Bold').fillColor(PALETA.texto).text(whatsappContacto, { align: 'center' });
  }
  doc.moveDown(0.7);

  dibujarBarcode(doc, { left, contentWidth, buffer: barcodeBuffer });

  doc.x = left;
  dibujarSeparador(doc, { left, right, punteado: true });
  dibujarPieLegal(doc, { left, right, mensajeExtra: 'Conserve este ticket como comprobante.' });
}

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, metodoPago: string, cliente?: string|null, sucursal?: {nombre?: string, telefono?: string|null}, usuario?: {nombre?: string}, descuentoTipo?: string|null, descuentoValor?: number|string|null, descuentoMonto?: number|string, descuentoMotivo?: string|null, efectivoRecibido?: number|string|null}} venta
 * @param {Array<{descripcion: string, cantidad: number, precioUnitario: number|string, subtotal: number|string}>} items
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas o cambios"
 * @returns {Promise<Buffer>}
 */
async function generarTicketPdf(venta, items, whatsappContacto) {
  // El código de barras se genera aparte (es async) antes de armar el PDF,
  // para insertarlo como cualquier otra imagen del documento. Si por lo que
  // sea falla, el ticket se genera igual, solo sin el código de barras.
  const barcodeBuffer = await generarBarcodeBuffer(venta.folio);

  const dibujar = (doc) => dibujarTicket(doc, { venta, items, whatsappContacto, barcodeBuffer });

  // Paso 1: se dibuja una vez en una página de prueba muy alta, solo para
  // medir hasta dónde llega el contenido (depende de cuántos artículos
  // tenga la venta, si hay descuento, etc. — no se sabe de antemano).
  const alto = await medirAltoContenido(dibujar);

  // Paso 2: se dibuja otra vez, ahora en la página real, ya del alto
  // exacto que se necesitó — así el ticket siempre sale en una sola hoja.
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [ANCHO_TICKET, alto], margin: MARGEN_TICKET });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    dibujar(doc);

    doc.end();
  });
}

module.exports = { generarTicketPdf };
