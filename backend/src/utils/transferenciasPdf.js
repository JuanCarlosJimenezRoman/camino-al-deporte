// Genera el reporte de transferencias entre sucursales en PDF (con foto de
// cada producto), pensado para mandarse fuera del sistema: a quien recibe la
// mercancía, a una paquetería, a un proveedor, etc.
//
// Se alimenta de la misma consulta que GET /transferencias (ver
// routes/transferencias.js → GET /reporte-pdf), ya sea de un LOTE
// (TransferenciaInventario.loteFolio: todo lo que salió en un mismo "Enviar
// N traspasos") o de un DÍA completo.
//
// Contenido: por cada renglón, foto del producto, nombre, marca/color/talla,
// SKU, cantidad, folio, fecha, estado (En camino / Recibida / Cancelada) y
// quién solicitó / recibió. NUNCA se imprimen costos ni precios: es un
// documento externo. Los renglones se agrupan por ruta (origen → destino).
//
// Reutiliza PALETA de ticketEstilo.js y el mismo criterio de imágenes que
// catalogoPdf.js (Cloudinary a 400x400 jpg, descarga con concurrencia
// limitada, best-effort: si una foto falla, el renglón sale con un
// placeholder en vez de tronar el documento).

const PDFDocument = require('pdfkit');
const { PALETA } = require('./ticketEstilo');
const { limpiarTexto, urlCloudinaryParaPdf } = require('./catalogoPdf');
const { ZONA_NEGOCIO } = require('./fechas');

const MARGEN = 36;
const THUMB = 64; // lado de la miniatura cuadrada
const GUTTER = 12; // espacio entre miniatura y texto
const ANCHO_COLUMNA_CANTIDAD = 92;
const ALTO_FILA = 84;
const ALTO_TITULO_GRUPO = 26;
const ALTO_ENCABEZADO_COMPACTO = 46;
const RESERVA_PIE = 26; // espacio al fondo de cada página para "Página X de Y"
const TIMEOUT_IMAGEN_MS = 10000;

const ESTADO_TEXTO = { SOLICITADA: 'En camino', RECIBIDA: 'Recibida', CANCELADA: 'Cancelada' };
const ESTADO_COLOR = { SOLICITADA: '#B45309', RECIBIDA: PALETA.exito, CANCELADA: PALETA.peligro };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatoFechaHora(fecha) {
  return new Date(fecha).toLocaleString('es-MX', {
    timeZone: ZONA_NEGOCIO,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Misma regla que imagenPrincipal() del frontend (components/admin/
// ProductoThumb.tsx): primero una foto etiquetada con el color de la
// variante; si no hay, la portada general del producto (o la primera).
function urlImagenDeVariante(variante) {
  const imagenes = (variante.producto && variante.producto.imagenes) || [];
  if (!imagenes.length) return null;
  const color = variante.color ? String(variante.color).toLowerCase() : null;
  if (color) {
    const deEseColor = imagenes.find((img) => img.color && String(img.color).toLowerCase() === color);
    if (deEseColor) return deEseColor.url;
  }
  const general = imagenes.find((img) => !img.color && img.esPrincipal) || imagenes.find((img) => !img.color);
  return (general || imagenes[0]).url;
}

// Descarga las fotos únicas (una por producto+color, aunque haya varias
// tallas del mismo modelo en el reporte) con concurrencia limitada.
// Regresa Map url -> Buffer|null.
async function descargarImagenes(transferencias, concurrencia = 6) {
  const urls = [...new Set(transferencias.map((t) => urlImagenDeVariante(t.variante)).filter(Boolean))];
  const resultado = new Map();
  const cola = [...urls];

  async function trabajador() {
    while (cola.length) {
      const url = cola.shift();
      try {
        const resp = await fetch(urlCloudinaryParaPdf(url), { signal: AbortSignal.timeout(TIMEOUT_IMAGEN_MS) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        resultado.set(url, Buffer.from(await resp.arrayBuffer()));
      } catch (err) {
        console.error(`Reporte de transferencias: no se pudo descargar la imagen ${url}:`, err.message);
        resultado.set(url, null);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, urls.length) }, trabajador));
  return resultado;
}

// Agrupa por ruta (origen → destino), ordenada por nombre de sucursal, y
// dentro de cada ruta por fecha de creación. Los subtotales de piezas no
// cuentan las canceladas (esa mercancía nunca salió).
function agruparPorRuta(transferencias) {
  const mapa = new Map();
  for (const t of transferencias) {
    const clave = `${t.sucursalOrigen.id}->${t.sucursalDestino.id}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, { origen: t.sucursalOrigen.nombre, destino: t.sucursalDestino.nombre, filas: [] });
    }
    mapa.get(clave).filas.push(t);
  }
  const grupos = [...mapa.values()];
  grupos.sort((a, b) => a.origen.localeCompare(b.origen) || a.destino.localeCompare(b.destino));
  for (const g of grupos) {
    g.filas.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id);
    g.piezas = g.filas.filter((t) => t.estado !== 'CANCELADA').reduce((acc, t) => acc + t.cantidad, 0);
  }
  return grupos;
}

function calcularResumen(transferencias) {
  const porEstado = { SOLICITADA: 0, RECIBIDA: 0, CANCELADA: 0 };
  let piezas = 0;
  for (const t of transferencias) {
    porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
    if (t.estado !== 'CANCELADA') piezas += t.cantidad;
  }
  return { renglones: transferencias.length, piezas, porEstado };
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

function dibujarEncabezadoCompleto(doc, { left, right, marca, filtrosTexto, resumen }) {
  const ancho = right - left;
  doc.rect(0, 0, doc.page.width, 8).fill(PALETA.primario);

  const y0 = 24;
  const tam = 40;
  if (marca.logoBuffer) {
    try {
      doc.image(marca.logoBuffer, left, y0, { fit: [tam, tam], align: 'center', valign: 'center' });
    } catch (err) {
      console.error('Reporte de transferencias: no se pudo dibujar el logo:', err.message);
    }
  } else {
    doc.circle(left + tam / 2, y0 + tam / 2, tam / 2).fill(PALETA.acento);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14);
    doc.text(String(marca.iniciales || 'CD').toUpperCase(), left, y0 + tam / 2 - 6, { width: tam, align: 'center' });
  }

  const xTexto = left + tam + 12;
  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(16);
  doc.text(limpiarTexto(String(marca.nombre).toUpperCase()), xTexto, y0 + 2, { width: ancho - tam - 12 - 170, height: 20, ellipsis: true });
  doc.fillColor(PALETA.textoMuted).font('Helvetica-Bold').fontSize(9);
  doc.text('REPORTE DE TRANSFERENCIAS', xTexto, y0 + 23, { width: ancho - tam - 12 - 170 });

  doc.font('Helvetica').fontSize(7.5).fillColor(PALETA.textoMuted);
  doc.text(`Generado: ${formatoFechaHora(new Date())}`, right - 170, y0 + 4, { width: 170, align: 'right', lineBreak: false });

  let y = y0 + tam + 12;
  if (filtrosTexto) {
    doc.font('Helvetica').fontSize(9).fillColor(PALETA.texto);
    const alto = doc.heightOfString(limpiarTexto(filtrosTexto), { width: ancho });
    doc.text(limpiarTexto(filtrosTexto), left, y, { width: ancho });
    y += alto + 6;
  }

  // Franja de resumen: una casilla por dato, repartidas a lo ancho.
  const stats = [
    { valor: resumen.renglones, etiqueta: resumen.renglones === 1 ? 'Traspaso' : 'Traspasos' },
    { valor: resumen.piezas, etiqueta: resumen.piezas === 1 ? 'Pieza' : 'Piezas' },
    { valor: resumen.porEstado.SOLICITADA, etiqueta: 'En camino' },
    { valor: resumen.porEstado.RECIBIDA, etiqueta: 'Recibidas' },
  ];
  if (resumen.porEstado.CANCELADA > 0) stats.push({ valor: resumen.porEstado.CANCELADA, etiqueta: 'Canceladas' });

  const altoCaja = 40;
  doc.roundedRect(left, y, ancho, altoCaja, 6).fill(PALETA.fondoTotal);
  const anchoStat = ancho / stats.length;
  stats.forEach((s, i) => {
    const x = left + i * anchoStat;
    doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(16);
    doc.text(String(s.valor), x, y + 6, { width: anchoStat, align: 'center' });
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(7.5);
    doc.text(s.etiqueta, x, y + 26, { width: anchoStat, align: 'center' });
  });
  y += altoCaja + 14;

  doc.fillColor(PALETA.texto);
  return y;
}

function dibujarEncabezadoCompacto(doc, { left, right, marca, filtrosTexto }) {
  doc.rect(0, 0, doc.page.width, 8).fill(PALETA.primario);
  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(9);
  doc.text(`${limpiarTexto(String(marca.nombre).toUpperCase())} · REPORTE DE TRANSFERENCIAS`, left, 20, { width: right - left });
  if (filtrosTexto) {
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(7.5);
    doc.text(limpiarTexto(filtrosTexto), left, 32, { width: right - left, height: 10, ellipsis: true });
  }
  doc.moveTo(left, ALTO_ENCABEZADO_COMPACTO - 6).lineTo(right, ALTO_ENCABEZADO_COMPACTO - 6).strokeColor(PALETA.borde).lineWidth(0.75).stroke();
  doc.fillColor(PALETA.texto);
  return ALTO_ENCABEZADO_COMPACTO;
}

// Barra de título de cada ruta: "Origen  →  Destino" (la flecha se dibuja
// con vectores porque la fuente estándar Helvetica no tiene el carácter) y,
// a la derecha, el subtotal de piezas de ese grupo.
function dibujarTituloGrupo(doc, grupo, { left, right, y, continuacion }) {
  const ancho = right - left;
  doc.roundedRect(left, y, ancho, ALTO_TITULO_GRUPO - 4, 4).fill(PALETA.fondoTotal);

  const yTexto = y + 5;
  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(10);
  const origen = limpiarTexto(grupo.origen);
  const destino = limpiarTexto(grupo.destino);
  const wOrigen = doc.widthOfString(origen);
  let x = left + 10;
  doc.text(origen, x, yTexto, { lineBreak: false });
  x += wOrigen + 8;

  // Flecha
  const yFlecha = y + (ALTO_TITULO_GRUPO - 4) / 2;
  doc.moveTo(x, yFlecha).lineTo(x + 14, yFlecha).strokeColor(PALETA.primarioOscuro).lineWidth(1.2).stroke();
  doc.polygon([x + 14, yFlecha - 3.5], [x + 19, yFlecha], [x + 14, yFlecha + 3.5]).fill(PALETA.primarioOscuro);
  x += 27;

  doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(10);
  doc.text(destino, x, yTexto, { lineBreak: false });
  if (continuacion) {
    x += doc.widthOfString(destino) + 8;
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(8);
    doc.text('(continuación)', x, yTexto + 1.5, { lineBreak: false });
  }

  doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(8.5);
  const textoTotal = `${grupo.piezas} ${grupo.piezas === 1 ? 'pieza' : 'piezas'}`;
  doc.text(textoTotal, right - 110, yTexto + 1, { width: 100, align: 'right', lineBreak: false });
  doc.fillColor(PALETA.texto);
}

function dibujarFila(doc, t, imagenBuffer, { left, right, y }) {
  const ancho = right - left;
  const xTexto = left + THUMB + GUTTER;
  const anchoTexto = ancho - THUMB - GUTTER - ANCHO_COLUMNA_CANTIDAD - GUTTER;
  const cancelada = t.estado === 'CANCELADA';

  // Miniatura (con placeholder si no hay foto o falla)
  doc.roundedRect(left, y, THUMB, THUMB, 4).fill('#F1F5F9');
  if (imagenBuffer) {
    try {
      doc.save();
      doc.roundedRect(left, y, THUMB, THUMB, 4).clip();
      doc.image(imagenBuffer, left, y, { fit: [THUMB, THUMB], align: 'center', valign: 'center' });
      doc.restore();
    } catch (err) {
      doc.restore();
      console.error(`Reporte de transferencias: no se pudo dibujar la imagen de ${t.folio}:`, err.message);
    }
  } else {
    doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(6.5);
    doc.text('Sin foto', left, y + THUMB / 2 - 4, { width: THUMB, align: 'center' });
  }

  const v = t.variante;
  const colorTexto = cancelada ? PALETA.textoMuted : PALETA.texto;

  // Las líneas de abajo se pegan al nombre: si cabe en una sola línea no
  // debe quedar un hueco donde iría la segunda.
  const nombre = limpiarTexto(v.producto.nombre);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colorTexto);
  const altoNombre = Math.min(doc.heightOfString(nombre, { width: anchoTexto }), 24);
  doc.text(nombre, xTexto, y, { width: anchoTexto, height: 24, ellipsis: true });
  let cy = y + altoNombre + 3;

  const meta = [v.producto.marca && v.producto.marca.nombre, v.color, v.talla && `Talla ${v.talla.valor}`]
    .filter(Boolean)
    .join(' · ');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colorTexto);
  doc.text(limpiarTexto(meta) || '—', xTexto, cy, { width: anchoTexto, height: 11, ellipsis: true });
  cy += 14;

  doc.font('Helvetica').fontSize(8).fillColor(PALETA.textoMuted);
  doc.text(`SKU ${limpiarTexto(v.sku)}`, xTexto, cy, { width: anchoTexto, height: 10, ellipsis: true });
  cy += 12;
  doc.text(`${t.folio} · ${formatoFechaHora(t.createdAt)}`, xTexto, cy, { width: anchoTexto, height: 10, ellipsis: true });
  cy += 12;

  const personas = [`Solicitó: ${(t.solicitadoPor && t.solicitadoPor.nombre) || '—'}`];
  if (t.estado === 'RECIBIDA') {
    personas.push(`Recibió: ${(t.recibidoPor && t.recibidoPor.nombre) || '—'}${t.recibidoAt ? ` (${formatoFechaHora(t.recibidoAt)})` : ''}`);
  }
  doc.text(limpiarTexto(personas.join(' · ')), xTexto, cy, { width: anchoTexto, height: 10, ellipsis: true });

  // Columna derecha: cantidad + estado
  const xCant = right - ANCHO_COLUMNA_CANTIDAD;
  doc.fillColor(cancelada ? PALETA.textoMuted : PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(22);
  doc.text(String(t.cantidad), xCant, y + 4, { width: ANCHO_COLUMNA_CANTIDAD, align: 'right', lineBreak: false });
  doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(8);
  doc.text(t.cantidad === 1 ? 'pieza' : 'piezas', xCant, y + 32, { width: ANCHO_COLUMNA_CANTIDAD, align: 'right', lineBreak: false });
  doc.fillColor(ESTADO_COLOR[t.estado] || PALETA.texto).font('Helvetica-Bold').fontSize(8.5);
  doc.text((ESTADO_TEXTO[t.estado] || t.estado).toUpperCase(), xCant, y + 47, { width: ANCHO_COLUMNA_CANTIDAD, align: 'right', lineBreak: false });

  // Separador tenue debajo de la fila
  doc.moveTo(left, y + ALTO_FILA - 6).lineTo(right, y + ALTO_FILA - 6).strokeColor(PALETA.borde).lineWidth(0.5).stroke();
  doc.fillColor(PALETA.texto);
}

function dibujarPiePagina(doc, { left, right, pagina, totalPaginas }) {
  // OJO: debe quedar DENTRO de doc.page.maxY(); si no, pdfkit agrega una
  // página en blanco antes de escribirlo (ver el mismo comentario en
  // catalogoPdf.js → dibujarPiePagina).
  const y = doc.page.height - doc.page.margins.bottom - RESERVA_PIE + 6;
  doc.font('Helvetica').fontSize(7.5).fillColor(PALETA.textoMuted);
  doc.text(`Página ${pagina} de ${totalPaginas}`, left, y, { width: right - left, align: 'center', height: 12 });
  doc.fillColor(PALETA.texto);
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

function construirPdf(transferencias, imagenes, { marca, filtrosTexto }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom - RESERVA_PIE;

    const resumen = calcularResumen(transferencias);
    const grupos = agruparPorRuta(transferencias);

    let y = dibujarEncabezadoCompleto(doc, { left, right, marca, filtrosTexto, resumen });

    function nuevaPagina() {
      doc.addPage();
      y = dibujarEncabezadoCompacto(doc, { left, right, marca, filtrosTexto });
    }

    for (const grupo of grupos) {
      // El título de ruta nunca queda solo al fondo de una página: debe
      // caber junto con al menos una fila.
      if (y + ALTO_TITULO_GRUPO + ALTO_FILA > pageBottom) nuevaPagina();
      dibujarTituloGrupo(doc, grupo, { left, right, y, continuacion: false });
      y += ALTO_TITULO_GRUPO;

      for (const t of grupo.filas) {
        if (y + ALTO_FILA > pageBottom) {
          nuevaPagina();
          dibujarTituloGrupo(doc, grupo, { left, right, y, continuacion: true });
          y += ALTO_TITULO_GRUPO;
        }
        dibujarFila(doc, t, imagenes.get(urlImagenDeVariante(t.variante)), { left, right, y });
        y += ALTO_FILA;
      }
      y += 8;
    }

    // Total general
    const altoTotal = 34;
    if (y + altoTotal > pageBottom) nuevaPagina();
    doc.roundedRect(left, y, right - left, altoTotal, 6).fill(PALETA.fondoTotal);
    doc.fillColor(PALETA.primarioOscuro).font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL', left + 12, y + 11, { lineBreak: false });
    const textoTotal = `${resumen.renglones} ${resumen.renglones === 1 ? 'traspaso' : 'traspasos'}  ·  ${resumen.piezas} ${resumen.piezas === 1 ? 'pieza' : 'piezas'}`;
    doc.text(textoTotal, right - 260, y + 11, { width: 248, align: 'right', lineBreak: false });
    if (resumen.porEstado.CANCELADA > 0) {
      doc.fillColor(PALETA.textoMuted).font('Helvetica').fontSize(7.5);
      doc.text('Las piezas canceladas no se suman al total.', left + 60, y + 13, { lineBreak: false });
    }
    doc.fillColor(PALETA.texto);

    const totalPaginas = doc.bufferedPageRange().count;
    for (let p = 0; p < totalPaginas; p += 1) {
      doc.switchToPage(p);
      dibujarPiePagina(doc, { left, right, pagina: p + 1, totalPaginas });
    }

    doc.end();
  });
}

/**
 * @param {Array} transferencias - TransferenciaInventario con
 *   variante { producto { nombre, marca, imagenes[] }, talla, color, sku },
 *   sucursalOrigen, sucursalDestino, solicitadoPor y recibidoPor.
 * @param {{marca: {nombre: string, iniciales?: string, logoBuffer?: Buffer|null}, filtrosTexto?: string}} opciones
 *   marca: la de obtenerMarca() (ticketEstilo.js).
 * @returns {Promise<Buffer>}
 */
async function generarTransferenciasPdf(transferencias, { marca, filtrosTexto = '' }) {
  const imagenes = await descargarImagenes(transferencias);
  return construirPdf(transferencias, imagenes, { marca, filtrosTexto });
}

module.exports = { generarTransferenciasPdf };
