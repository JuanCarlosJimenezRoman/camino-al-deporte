// Genera el comprobante en PDF de un cambio de producto, con el mismo
// diseño de "ticket de tienda" que ticketPdf.js/apartadoPdf.js: encabezado
// con marca, tabla de lo que el cliente devuelve, tabla de lo que se lleva,
// totales, y una caja de énfasis con el resultado (lo que pagó, o el saldo
// a favor que le quedó) — para que el cliente tenga constancia impresa de
// que no hay reembolsos en efectivo, solo producto o saldo a favor. Ver
// docs/CAMBIOS_SALDO_A_FAVOR.md y routes/cambios.js (GET /cambios/:id/pdf).
//
// El estilo (colores, insignia, cajas redondeadas, línea punteada) vive en
// utils/ticketEstilo.js y se comparte con ticketPdf.js/apartadoPdf.js —
// mismo patrón de "medir dos veces, dibujar una" para que siempre quede en
// una sola hoja (ver medirAltoContenido en ese archivo).

const PDFDocument = require('pdfkit');
const {
  ANCHO_TICKET,
  MARGEN_TICKET,
  medirAltoContenido,
  PALETA,
  moneda,
  generarBarcodeBuffer,
  obtenerMarca,
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

const MOTIVO_LABEL = {
  DEFECTUOSO: 'Defectuoso',
  NO_LE_GUSTO: 'No le gustó',
  NO_QUEDO: 'No le quedó',
};

function descripcionItem(it) {
  if (it.varianteId) {
    const detalle = [it.variante?.talla?.valor, it.variante?.color].filter(Boolean).join(' / ');
    return `${it.variante?.producto?.nombre || 'Producto'}${detalle ? ` (${detalle})` : ''}`;
  }
  return `${it.descripcionLibre || 'Producto no registrado'} (no registrado en catálogo)`;
}

// Dibuja una tabla de renglones (devueltos o entregados) — misma mecánica
// que la tabla de artículos de apartadoPdf.js, con una subnota opcional
// (motivo, en la tabla de devueltos).
function dibujarTablaItems(doc, { left, right, contentWidth, titulo, items, conMotivo }) {
  const colDescWidth = contentWidth - COL_CANT - COL_IMPORTE;

  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(10).text(titulo, left, doc.y);
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
    const descripcion = descripcionItem(it);
    const precio = moneda(it.precioUnitario);
    const subtotal = moneda(it.subtotal);
    const yFila = doc.y;
    const alturaDescripcion = doc.heightOfString(descripcion, { width: colDescWidth, fontSize: 9 });

    doc.font('Helvetica').fontSize(9);
    doc.text(String(it.cantidad), left, yFila, { width: COL_CANT });
    doc.text(descripcion, left + COL_CANT, yFila, { width: colDescWidth });
    doc.font('Helvetica-Bold').text(`$${subtotal}`, right - COL_IMPORTE, yFila, { width: COL_IMPORTE, align: 'right' });

    let ySubnota = yFila + alturaDescripcion + 2;
    const subnotaTexto = conMotivo && it.motivo
      ? `${it.cantidad} x $${precio} · ${MOTIVO_LABEL[it.motivo] || it.motivo}`
      : `${it.cantidad} x $${precio}`;
    doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted).text(subnotaTexto, left + COL_CANT, ySubnota, { width: colDescWidth });
    doc.fillColor(PALETA.texto);

    doc.y = ySubnota + doc.heightOfString(subnotaTexto, { width: colDescWidth, fontSize: 8 }) + 6;
    doc.x = left;
  });
}

function dibujarComprobante(doc, { cambio, saldoGenerado, saldoAplicado, barcodeBuffer, marca }) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;

  const dato = crearFilaDato(doc, { left, right });
  const filaMonto = crearFilaMonto(doc, { left, right }, COL_IMPORTE);

  const itemsDevueltos = cambio.items.filter((it) => it.direccion === 'DEVUELTO');
  const itemsEntregados = cambio.items.filter((it) => it.direccion === 'ENTREGADO');

  dibujarEncabezado(doc, {
    left,
    right,
    subtitulo: 'COMPROBANTE DE CAMBIO',
    lineaContacto: cambio.sucursal?.nombre,
    titulo: marca.nombre,
    iniciales: marca.iniciales,
    logoBuffer: marca.logoBuffer,
  });
  dibujarSeparador(doc, { left, right });

  dato('Folio', cambio.folio);
  dato('Fecha', new Date(cambio.createdAt).toLocaleString('es-MX', { timeZone: ZONA_NEGOCIO }));
  if (cambio.sucursal?.nombre) dato('Sucursal', cambio.sucursal.nombre);
  if (cambio.usuario?.nombre) dato('Atendió', cambio.usuario.nombre);
  if (cambio.ventaOrigen?.folio) dato('Venta original', cambio.ventaOrigen.folio);
  dato('Cliente', cambio.cliente?.nombre || 'Sin registrar');
  if (cambio.cliente?.telefono) dato('Teléfono', cambio.cliente.telefono);
  dibujarSeparador(doc, { left, right });

  dibujarTablaItems(doc, {
    left,
    right,
    contentWidth,
    titulo: 'PRODUCTO(S) QUE DEVUELVE EL CLIENTE',
    items: itemsDevueltos,
    conMotivo: true,
  });
  dibujarSeparador(doc, { left, right });

  dibujarTablaItems(doc, {
    left,
    right,
    contentWidth,
    titulo: 'PRODUCTO(S) QUE SE LLEVA EL CLIENTE',
    items: itemsEntregados,
    conMotivo: false,
  });
  dibujarSeparador(doc, { left, right });

  filaMonto('Total devuelto', `$${moneda(cambio.totalDevuelto)}`);
  filaMonto('Total nuevo', `$${moneda(cambio.totalNuevo)}`, { boldEtiqueta: true, boldValor: true, fontSize: 11 });

  if (saldoAplicado > 0) {
    filaMonto('Saldo a favor aplicado', `-$${moneda(saldoAplicado)}`, { color: PALETA.exito });
  }

  if (cambio.metodoPago) {
    const etiquetaMetodo = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' }[cambio.metodoPago] || cambio.metodoPago;
    filaMonto('Diferencia pagada con', etiquetaMetodo);
    if (cambio.metodoPago === 'EFECTIVO' && cambio.efectivoRecibido != null) {
      filaMonto('Efectivo recibido', `$${moneda(cambio.efectivoRecibido)}`);
      const cambioDado = Number(cambio.efectivoRecibido) - (Number(cambio.diferencia) - saldoAplicado);
      if (cambioDado > 0.001) filaMonto('Cambio entregado', `$${moneda(cambioDado)}`);
    }
  }
  doc.moveDown(0.15);

  // Caja de énfasis con el resultado del cambio, igual de destacada que el
  // TOTAL de un ticket de venta o el SALDO PENDIENTE de un apartado.
  if (saldoGenerado > 0) {
    dibujarCajaMonto(doc, {
      left,
      right,
      etiqueta: 'Saldo a favor generado',
      valor: `$${moneda(saldoGenerado)}`,
      colorFondo: PALETA.fondoExito,
      colorTexto: PALETA.exito,
    });
  } else if (Number(cambio.diferencia) > 0) {
    const totalPagado = Number(cambio.diferencia) - saldoAplicado;
    dibujarCajaMonto(doc, {
      left,
      right,
      etiqueta: 'Total pagado por el cliente',
      valor: `$${moneda(Math.max(totalPagado, 0))}`,
    });
  } else {
    dibujarCajaMonto(doc, {
      left,
      right,
      etiqueta: 'Resultado',
      valor: 'Cambio exacto, sin diferencia',
    });
  }

  filaMonto('Saldo a favor del cliente (total disponible)', `$${moneda(cambio.cliente?.saldoFavor ?? 0)}`, {
    boldValor: true,
  });

  dibujarSeparador(doc, { left, right });

  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(11).text('CAMBIOS DE PRODUCTO, NUNCA REEMBOLSOS EN EFECTIVO', { align: 'center' });
  doc.fillColor(PALETA.texto);
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(9).fillColor(PALETA.textoMuted).text(
    'El saldo a favor no caduca y se puede usar en otro cambio o en una compra futura, presentando el teléfono registrado.',
    { align: 'center' }
  );
  doc.fillColor(PALETA.texto);
  doc.moveDown(0.7);

  dibujarBarcode(doc, { left, contentWidth, buffer: barcodeBuffer });

  doc.x = left;
  dibujarSeparador(doc, { left, right, punteado: true });
  dibujarPieLegal(doc, { left, right, mensajeExtra: 'Conserva este comprobante.', nombreNegocio: marca.nombre });
}

/**
 * @param {object} cambio - Cambio con items, cliente, usuario, sucursal,
 *   ventaOrigen y movimientosSaldo incluidos (ver CAMBIO_INCLUDE en
 *   routes/cambios.js).
 * @returns {Promise<Buffer>}
 */
async function generarComprobanteCambio(cambio) {
  const barcodeBuffer = await generarBarcodeBuffer(cambio.folio);
  const marca = await obtenerMarca();

  const movimientos = cambio.movimientosSaldo || [];
  const saldoGenerado = movimientos.filter((m) => m.tipo === 'ABONO').reduce((acc, m) => acc + Number(m.monto), 0);
  const saldoAplicado = movimientos.filter((m) => m.tipo === 'CONSUMO').reduce((acc, m) => acc + Number(m.monto), 0);

  const dibujar = (doc) => dibujarComprobante(doc, { cambio, saldoGenerado, saldoAplicado, barcodeBuffer, marca });

  const alto = await medirAltoContenido(dibujar);

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

module.exports = { generarComprobanteCambio };
