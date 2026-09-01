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
// utils/ticketEstilo.js y se comparte con ticketPdf.js. Igual que en ese
// archivo, el documento se dibuja dos veces (una de prueba para medir el
// alto que necesita, otra ya real con ese alto exacto) para que siempre
// salga en una sola hoja — ver medirAltoContenido en ticketEstilo.js.

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

const COL_CANT = 32;
const COL_IMPORTE = 90;

// Dibuja el comprobante completo sobre "doc" (que ya trae su tamaño de
// página definido) — se usa tanto para medir el alto necesario como para
// generar el PDF real (ver generarComprobanteApartado más abajo).
function dibujarComprobante(doc, { apartado, pagadoTotal, montoEsteEvento, whatsappContacto, barcodeBuffer }) {
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
  // timeZone explícito: el servidor corre en UTC (Render), así que sin esto
  // la hora sale adelantada — ver ZONA_NEGOCIO en utils/fechas.js.
  dato('Fecha', new Date(apartado.createdAt).toLocaleString('es-MX', { timeZone: ZONA_NEGOCIO }));
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

  // Si hubo descuento, se desglosa Subtotal - Descuento = Total (igual que
  // en el ticket de venta, ver utils/ticketPdf.js) — apartado.total ya es
  // neto, así que el subtotal se reconstruye sumando los artículos.
  const descuentoMonto = Number(apartado.descuentoMonto || 0);
  if (descuentoMonto > 0) {
    const subtotalItems = apartado.items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    filaMonto('Subtotal', `$${moneda(subtotalItems)}`);
    const etiquetaDescuento =
      apartado.descuentoTipo === 'PORCENTAJE' ? `Descuento (${Number(apartado.descuentoValor)}%)` : 'Descuento';
    filaMonto(etiquetaDescuento, `-$${moneda(descuentoMonto)}`, { color: PALETA.exito });
    if (apartado.descuentoMotivo) {
      doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted).text(`Motivo: ${apartado.descuentoMotivo}`, left, doc.y, { width: contentWidth });
      doc.fillColor(PALETA.texto);
    }
  }

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
    apartado.fechaLimite
      ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX', { timeZone: ZONA_NEGOCIO })
      : 'Sin fecha límite'
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
}

/**
 * @param {{folio: string, createdAt: Date|string, total: number|string, fechaLimite: Date|string|null, cliente?: {nombre?: string}, sucursalVenta?: {nombre?: string, telefono?: string|null}, creadoPor?: {nombre?: string}, items: Array<{cantidad: number, precioUnitario: number|string, subtotal: number|string, variante?: {color?: string|null, talla?: {valor?: string}|null, producto?: {nombre?: string}}}>}} apartado
 * @param {number} pagadoTotal - suma de todos los abonos/anticipos a la fecha (incluye el de este evento, si aplica)
 * @param {number|null} [montoEsteEvento] - anticipo/abono que generó este comprobante en particular; null si no aplica
 * @param {string|null} [whatsappContacto] - número a mostrar como "dudas"
 * @returns {Promise<Buffer>}
 */
async function generarComprobanteApartado(apartado, pagadoTotal, montoEsteEvento, whatsappContacto) {
  const barcodeBuffer = await generarBarcodeBuffer(apartado.folio);

  const dibujar = (doc) =>
    dibujarComprobante(doc, { apartado, pagadoTotal, montoEsteEvento, whatsappContacto, barcodeBuffer });

  // Paso 1: medir cuánto contenido hay (número de artículos, si hay
  // abonos previos, etc. varía en cada apartado y no se sabe de antemano).
  const alto = await medirAltoContenido(dibujar);

  // Paso 2: dibujar el documento real ya con el alto exacto, para que
  // siempre quede en una sola hoja.
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

module.exports = { generarComprobanteApartado };
