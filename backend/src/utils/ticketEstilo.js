// Helpers de diseño compartidos por ticketPdf.js (ticket de venta) y
// apartadoPdf.js (comprobante de apartado), para que ambos documentos se
// vean como el mismo "sistema visual": franja de color arriba, insignia con
// las iniciales del negocio, renglones de datos con línea punteada debajo
// (estilo formulario), caja redondeada para el monto importante, y pie con
// aviso de que no es un comprobante fiscal.
//
// TODO diseño: los colores de PALETA de abajo son un placeholder — cámbialos
// por los colores reales de la marca de Camino al Deporte cuando los
// definas. Si más adelante hay un logo en PNG/JPG, sustituye la insignia de
// dibujarEncabezado() por `doc.image('ruta/logo.png', ...)` (está señalado
// con un comentario ahí mismo).

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

// Ancho fijo de página (el mismo ancho que A5) y margen — el ALTO ya no es
// fijo: se calcula en cada documento con medirAltoContenido() para que el
// ticket quepa completo en una sola hoja sin importar cuántos artículos
// tenga (ver esa función más abajo).
const ANCHO_TICKET = 419.53;
const MARGEN_TICKET = 36;

const PALETA = {
  primario: '#1D4ED8', // franja superior, insignia y textos de marca
  primarioOscuro: '#1E3A8A', // nombre del negocio y monto grande de la caja de total
  acento: '#F97316', // color de relleno de la insignia (iniciales)
  fondoTotal: '#EFF6FF', // fondo de la caja de TOTAL / SALDO
  exito: '#15803D',
  fondoExito: '#F0FDF4',
  peligro: '#B91C1C',
  fondoPeligro: '#FEF2F2',
  texto: '#0F172A',
  textoMuted: '#64748B',
  borde: '#CBD5E1',
};

function moneda(valor) {
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Código de barras (Code128) del folio, para verificar el ticket/comprobante
// en tienda. Es best-effort: si falla, se regresa null y el documento se
// genera igual, solo sin el código de barras.
async function generarBarcodeBuffer(folio) {
  try {
    return await bwipjs.toBuffer({
      bcid: 'code128',
      text: folio,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
      textsize: 8,
    });
  } catch (err) {
    console.error('Error generando el código de barras:', err);
    return null;
  }
}

// Franja de color + insignia con iniciales + nombre del negocio + subtítulo
// (p. ej. "TICKET DE COMPRA") + una línea opcional de contacto (sucursal,
// teléfono). Deja doc.y listo para seguir dibujando debajo.
function dibujarEncabezado(doc, { left, right, subtitulo, lineaContacto, titulo = 'CAMINO AL DEPORTE' }) {
  const contentWidth = right - left;

  // Franja superior: se dibuja a lo ancho de TODA la página (no solo el
  // área de contenido), por eso usa doc.page.width en vez de "right".
  doc.rect(0, 0, doc.page.width, 10).fill(PALETA.primario);

  // Insignia con las iniciales del negocio. Para usar un logo real:
  //   doc.image('ruta/a/tu/logo.png', cx - 26, doc.y, { width: 52, height: 52 });
  const radio = 24;
  const cx = left + contentWidth / 2;
  const yInsignia = doc.y + 6;
  doc.fillColor(PALETA.acento);
  doc.circle(cx, yInsignia + radio, radio).fill();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17);
  doc.text('CD', cx - radio, yInsignia + radio - 8, { width: radio * 2, align: 'center' });
  doc.y = yInsignia + radio * 2 + 8;
  doc.x = left;

  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(17);
  doc.text(titulo, left, doc.y, { width: contentWidth, align: 'center' });

  if (subtitulo) {
    doc.moveDown(0.1);
    doc.fillColor(PALETA.textoMuted).font('Helvetica-Bold').fontSize(9);
    doc.text(subtitulo, left, doc.y, { width: contentWidth, align: 'center' });
  }
  if (lineaContacto) {
    doc.moveDown(0.1);
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(8);
    doc.text(lineaContacto, left, doc.y, { width: contentWidth, align: 'center' });
  }

  doc.fillColor(PALETA.texto);
  doc.x = left;
  doc.moveDown(0.4);
}

// Línea separadora horizontal, sólida o punteada.
function dibujarSeparador(doc, { left, right, punteado = false, color = PALETA.borde } = {}) {
  doc.moveDown(0.3);
  doc.strokeColor(color).lineWidth(punteado ? 0.6 : 0.75);
  if (punteado) doc.dash(1.2, { space: 1.6 });
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  if (punteado) doc.undash();
  doc.strokeColor('#000000');
  doc.moveDown(0.35);
  doc.x = left;
}

// Regresa una función dato(etiqueta, valor) que dibuja un renglón tipo
// formulario: etiqueta en mayúsculas/gris a la izquierda, valor en fuente
// "de recibo" (Courier) a continuación, y una línea punteada fina debajo —
// imitando los campos de FECHA/FOLIO/CLIENTE de un ticket físico.
function crearFilaDato(doc, { left, right }) {
  return function dato(etiqueta, valor) {
    doc.x = left;
    doc.fillColor(PALETA.textoMuted).font('Helvetica-Bold').fontSize(8).text(`${etiqueta.toUpperCase()} `, { continued: true });
    doc.fillColor(PALETA.texto).font('Courier-Bold').fontSize(9.5).text(String(valor));
    doc.fillColor(PALETA.texto);

    doc.strokeColor(PALETA.borde).lineWidth(0.5);
    doc.dash(1, { space: 1.5 });
    doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).stroke();
    doc.undash().strokeColor('#000000');

    doc.moveDown(0.55);
    doc.x = left;
  };
}

// Regresa una función filaMonto(etiqueta, valor, opts) para renglones tipo
// "etiqueta ......... $monto" (Subtotal, Descuento, Total, Método de pago,
// Abono, Saldo pendiente, etc.), con la etiqueta a la izquierda y el valor
// alineado a la derecha dentro de una columna fija.
function crearFilaMonto(doc, { left, right }, colValor = 90) {
  return function filaMonto(etiqueta, valor, { boldEtiqueta = false, boldValor = false, fontSize = 9, color = null } = {}) {
    doc.fontSize(fontSize);
    const yFila = doc.y;
    const colorFinal = color || PALETA.texto;
    doc.font(boldEtiqueta ? 'Helvetica-Bold' : 'Helvetica').fillColor(colorFinal).text(etiqueta, left, yFila);
    doc.font(boldValor ? 'Helvetica-Bold' : 'Helvetica').fillColor(colorFinal).text(valor, right - colValor, yFila, {
      width: colValor,
      align: 'right',
    });
    doc.fillColor(PALETA.texto);
    doc.y = yFila + doc.heightOfString(etiqueta, { fontSize }) + 4;
    doc.x = left;
  };
}

// Caja redondeada de énfasis para el monto importante del documento (el
// TOTAL del ticket de venta, o el SALDO PENDIENTE del apartado): fondo claro,
// etiqueta pequeña arriba a la derecha y el monto grande debajo.
function dibujarCajaMonto(doc, { left, right, etiqueta, valor, colorFondo = PALETA.fondoTotal, colorTexto = PALETA.primarioOscuro }) {
  const width = right - left;
  const paddingX = 12;
  const paddingY = 9;

  doc.moveDown(0.25);
  const yBox = doc.y;

  doc.font('Helvetica-Bold').fontSize(9);
  const altoEtiqueta = doc.heightOfString(etiqueta, { width: width - paddingX * 2 });
  doc.font('Helvetica-Bold').fontSize(22);
  const altoValor = doc.heightOfString(valor, { width: width - paddingX * 2 });
  const alto = paddingY * 2 + altoEtiqueta + 3 + altoValor;

  doc.roundedRect(left, yBox, width, alto, 8).fill(colorFondo);

  doc.fillColor(PALETA.textoMuted).font('Helvetica-Bold').fontSize(9);
  doc.text(etiqueta.toUpperCase(), left + paddingX, yBox + paddingY, { width: width - paddingX * 2, align: 'right' });

  doc.fillColor(colorTexto).font('Helvetica-Bold').fontSize(22);
  doc.text(valor, left + paddingX, yBox + paddingY + altoEtiqueta + 3, { width: width - paddingX * 2, align: 'left' });

  doc.fillColor(PALETA.texto);
  doc.y = yBox + alto + 8;
  doc.x = left;
}

// Código de barras centrado (para cambios/devoluciones o para verificar el
// apartado al recogerlo). No hace nada si buffer es null (ver
// generarBarcodeBuffer).
function dibujarBarcode(doc, { left, contentWidth, buffer }) {
  if (!buffer) return;
  const imagen = doc.openImage(buffer);
  const ancho = Math.min(200, contentWidth);
  const alto = (imagen.height / imagen.width) * ancho;
  const x = left + (contentWidth - ancho) / 2;
  doc.image(imagen, x, doc.y, { width: ancho });
  doc.y += alto + 6;
  doc.x = left;
}

// Aviso legal (este documento no sustituye una factura/CFDI) + un mensaje
// extra opcional (p. ej. "Conserve este ticket como comprobante.").
function dibujarPieLegal(doc, { left, right, mensajeExtra } = {}) {
  const width = right - left;
  doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(7);
  doc.text('Este documento es un comprobante interno de Camino al Deporte — no es un CFDI ni un comprobante fiscal.', left, doc.y, {
    width,
    align: 'center',
  });
  if (mensajeExtra) {
    doc.moveDown(0.15);
    doc.text(mensajeExtra, left, doc.y, { width, align: 'center' });
  }
  doc.fillColor(PALETA.texto);
}

// Calcula el alto exacto que necesita un ticket ANTES de generarlo de
// verdad, dibujándolo una vez en una página "de prueba" muy alta (se
// descarta, nunca se manda a ningún lado) y viendo hasta dónde quedó el
// cursor (doc.y) al terminar. Con ese alto se crea después la página real,
// del tamaño justo — así el documento siempre sale en UNA sola hoja, sea
// un ticket de un artículo o de veinte.
//
// @param {(doc: PDFKit.PDFDocument) => void} dibujarFn - función que dibuja
//   todo el contenido del ticket/comprobante sobre el doc que recibe.
async function medirAltoContenido(dibujarFn, { ancho = ANCHO_TICKET, margen = MARGEN_TICKET } = {}) {
  return new Promise((resolve, reject) => {
    // alturaPrueba muy generosa (unas 20 páginas A5 de contenido) para que,
    // sea cual sea el ticket, nunca se dispare un salto de página
    // automático durante esta medición — eso arruinaría el cálculo, porque
    // doc.y se reiniciaría al pasar a una página nueva.
    const alturaPrueba = 6000;
    let doc;
    try {
      doc = new PDFDocument({ size: [ancho, alturaPrueba], margin: margen });
    } catch (err) {
      reject(err);
      return;
    }
    // Nadie va a leer este PDF de prueba — solo dejamos que el stream
    // fluya y se descarte, para no acumular el buffer en memoria de más.
    doc.on('data', () => {});
    doc.on('error', reject);
    try {
      dibujarFn(doc);
    } catch (err) {
      reject(err);
      return;
    }
    const alto = Math.ceil(doc.y + margen);
    doc.end();
    resolve(Math.max(alto, 250));
  });
}

module.exports = {
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
};
