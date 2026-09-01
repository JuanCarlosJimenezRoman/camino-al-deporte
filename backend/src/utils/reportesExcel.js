const XLSX = require('xlsx');

// Genera el libro .xlsx que descarga GET /reportes/ventas/exportar. Cada
// desglose ya viene calculado (ver routes/reportes.js) — este módulo solo
// arma las hojas, igual patrón que utils/excel.js para el catálogo.
function generarReporteVentasExcel({ periodo, resumen, serie, porMetodoPago, porSucursal, desglose, estimacion, porProveedorRendimiento }) {
  const libro = XLSX.utils.book_new();

  const fmt = (n) => Math.round(Number(n) * 100) / 100;
  const pct = (n) => (n === null || n === undefined ? 'n/a' : `${fmt(n)}%`);

  const hojaResumen = XLSX.utils.aoa_to_sheet([
    ['Reporte de ventas'],
    [`Periodo: ${periodo.desde} a ${periodo.hasta}`],
    [],
    ['Métrica', 'Periodo actual', 'Periodo anterior (mismos días)', 'Variación'],
    ['Ventas completadas', resumen.actual.totalVentas, resumen.anterior.totalVentas, pct(resumen.variacion.ventas)],
    ['Monto total ($)', fmt(resumen.actual.totalMonto), fmt(resumen.anterior.totalMonto), pct(resumen.variacion.monto)],
    ['Ticket promedio ($)', fmt(resumen.actual.ticketPromedio), fmt(resumen.anterior.ticketPromedio), ''],
    ['Descuentos aplicados ($)', fmt(resumen.actual.totalDescuentos), fmt(resumen.anterior.totalDescuentos), ''],
  ]);
  hojaResumen['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 26 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(serie.map((d) => ({ fecha: d.fecha, ventas: d.ventas, monto: fmt(d.monto) }))),
    'Serie diaria'
  );

  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(porMetodoPago.map((m) => ({ metodo: m.etiqueta, ventas: m.ventas, monto: fmt(m.monto) }))),
    'Metodo de pago'
  );

  if (porSucursal.length > 1) {
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(porSucursal.map((s) => ({ sucursal: s.nombre, ventas: s.ventas, monto: fmt(s.monto) }))),
      'Por sucursal'
    );
  }

  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(desglose.topProductos.map((p) => ({ producto: p.nombre, cantidad: p.cantidad, monto: fmt(p.monto) }))),
    'Top productos'
  );
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(desglose.porMarca.map((m) => ({ marca: m.nombre, cantidad: m.cantidad, monto: fmt(m.monto) }))),
    'Por marca'
  );
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(desglose.porCategoria.map((c) => ({ categoria: c.nombre, cantidad: c.cantidad, monto: fmt(c.monto) }))),
    'Por categoria'
  );
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(desglose.porTalla.map((t) => ({ talla: t.valor, tipo: t.tipo, cantidad: t.cantidad, monto: fmt(t.monto) }))),
    'Por talla'
  );
  // Si se calculó el rendimiento por proveedor (entradas vs. ventas, ver
  // agruparPorProveedor en routes/reportes.js) se usa esa hoja más completa;
  // si no, se cae al desglose simple (solo lo vendido) por compatibilidad.
  const filasProveedor =
    porProveedorRendimiento ||
    desglose.porProveedor.map((p) => ({
      nombre: p.nombre,
      cantidadIngresada: null,
      cantidadVendida: p.cantidad,
      montoVendido: p.monto,
      tasaVenta: null,
    }));
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(
      filasProveedor.map((p) => ({
        proveedor: p.nombre,
        'ingresado (piezas)': p.cantidadIngresada,
        'vendido (piezas)': p.cantidadVendida,
        'vendido ($)': fmt(p.montoVendido),
        '% vendido de lo ingresado': p.tasaVenta === null || p.tasaVenta === undefined ? 'n/a' : `${p.tasaVenta}%`,
      }))
    ),
    'Por proveedor'
  );

  // Renglones "producto no registrado" (ver migración
  // 20260901100000_venta_items_libres): productos vendidos que nunca se
  // dieron de alta en el catálogo, para que el admin los vea aparte del
  // resto del inventario clasificado.
  const productosNoRegistrados = desglose.productosNoRegistrados || [];
  if (productosNoRegistrados.length > 0) {
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(
        productosNoRegistrados.map((p) => ({ descripcion: p.nombre, cantidad: p.cantidad, monto: fmt(p.monto) }))
      ),
      'No registrados'
    );
  }

  if (estimacion?.proyeccion?.length) {
    const hojaProy = XLSX.utils.aoa_to_sheet([
      ['Proyección de ventas (estimación)'],
      [estimacion.suficienteDatos ? '' : 'Aviso: hay poco histórico en este periodo, la proyección puede ser poco confiable.'],
      [`Tendencia: ${estimacion.tendencia.direccion} (${pct(estimacion.tendencia.cambioSemanalPct)} por semana)`],
      [`Total proyectado próximos ${estimacion.proyeccion.length} días: $${fmt(estimacion.totalProyectado)}`],
      [estimacion.nota],
      [],
      ['fecha', 'monto estimado'],
      ...estimacion.proyeccion.map((p) => [p.fecha, fmt(p.monto)]),
    ]);
    hojaProy['!cols'] = [{ wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(libro, hojaProy, 'Proyeccion');
  }

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generarReporteVentasExcel };
