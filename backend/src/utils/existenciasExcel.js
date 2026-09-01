// Arma el .xlsx del reporte de existencias (GET /productos/reporte-
// existencias): una fila por talla/color con la CANTIDAD exacta en
// existencia — a diferencia del catálogo en PDF (utils/catalogoPdf.js),
// que por ser una cuadrícula de fotos solo alcanza a mostrar qué tallas
// hay disponibles, sin la cantidad de cada una.
//
// A propósito NO usa las mismas columnas que utils/excel.js (el
// exportar/importar del catálogo): este reporte es de SOLO LECTURA, no se
// puede volver a subir al importador. Es para mandarlo a alguien fuera del
// sistema — típicamente un proveedor preguntando "qué tienes de lo mío" —
// sin tener que darle acceso al panel.
const XLSX = require('xlsx');

/**
 * @param {Array} productos - productos con marca, modelo, categoria y
 *   variantes[] (con talla y existencias[] con sucursal), igual al include
 *   de GET /productos/reporte-existencias.
 * @param {{filtrosTexto?: string}} [opciones]
 * @returns {Buffer}
 */
function generarReporteExistencias(productos, { filtrosTexto = '' } = {}) {
  const filas = [];
  let totalPiezas = 0;

  for (const p of productos) {
    for (const v of p.variantes || []) {
      const cantidad = (v.existencias || []).reduce((acc, e) => acc + e.stockActual, 0);
      if (cantidad <= 0) continue; // el reporte es "lo que hay", no todo el catálogo

      const porSucursal = (v.existencias || [])
        .filter((e) => e.stockActual > 0)
        .map((e) => `${(e.sucursal && e.sucursal.nombre) || '?'}: ${e.stockActual}`)
        .join(', ');

      filas.push({
        producto: p.nombre,
        marca: (p.marca && p.marca.nombre) || '',
        modelo: (p.modelo && p.modelo.nombre) || '',
        categoria: (p.categoria && p.categoria.nombre) || '',
        sku: v.sku,
        talla: (v.talla && v.talla.valor) || '',
        color: v.color || '',
        cantidad,
        por_sucursal: porSucursal,
      });
      totalPiezas += cantidad;
    }
  }

  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const filasResumen = [['Reporte de existencias — Camino al Deporte'], [`Generado: ${fecha}`]];
  if (filtrosTexto) filasResumen.push([filtrosTexto]);
  filasResumen.push([]);
  filasResumen.push(['Productos con existencia', new Set(filas.map((f) => f.producto)).size]);
  filasResumen.push(['Renglones (talla/color)', filas.length]);
  filasResumen.push(['Total de piezas', totalPiezas]);

  const libro = XLSX.utils.book_new();

  const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
  hojaResumen['!cols'] = [{ wch: 34 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

  const columnas = ['producto', 'marca', 'modelo', 'categoria', 'sku', 'talla', 'color', 'cantidad', 'por_sucursal'];
  const hojaDetalle = XLSX.utils.json_to_sheet(filas, { header: columnas });
  hojaDetalle['!cols'] = [
    { wch: 34 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(libro, hojaDetalle, 'Existencias');

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generarReporteExistencias };
