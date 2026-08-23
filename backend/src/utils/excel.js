const XLSX = require('xlsx');
const {
  columnaAtributo,
  obtenerCamposExtraActivos,
  descripcionTipo,
  formatearValorAtributo,
} = require('./camposPersonalizados');

// Columnas fijas que reconoce el importador. El orden aquí es el orden en
// que aparecen en la plantilla descargable y en la exportación. IMPORTANTE:
// estas columnas deben ser exactamente las mismas (mismo nombre, mismo
// significado) que lee normalizarFilas en utils/importarProductos.js — es
// justo lo que hace que un Excel exportado se pueda volver a subir tal cual
// sin tener que reacomodar nada a mano. Las columnas de atributos extra
// (campos personalizados) se agregan aparte, después de estas — ver
// columnaAtributo en utils/camposPersonalizados.js.
const COLUMNAS = [
  'nombre',
  'marca',
  'categoria',
  'modelo',
  'descripcion',
  'precio_compra',
  'precio_venta',
  'talla',
  'tipo_talla',
  'color',
  'sku',
  'proveedor',
  'stock_inicial',
  'stock_minimo',
];

// Solo aparece cuando se exporta "todas las sucursales" (ver
// generarExportacion): es una columna de solo lectura, de referencia — el
// importador la ignora porque no está en COLUMNAS ni tiene el prefijo de
// atributo.
const COLUMNA_REFERENCIA_SUCURSALES = 'stock_por_sucursal';

/**
 * Lee la primera hoja de un archivo .xlsx (buffer) y devuelve un array de
 * objetos usando la primera fila como encabezados.
 */
function leerFilasExcel(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json(hoja, { defval: '' });
}

/**
 * Genera la plantilla .xlsx que el usuario descarga para llenar y luego
 * volver a subir. Incluye una hoja de instrucciones y una hoja con dos
 * filas de ejemplo (mismo producto, dos tallas) para que quede claro el
 * patrón de "una fila = una variante". Si en ese momento hay campos
 * personalizados activos (atributos extra de producto), se agregan como
 * columnas adicionales al final, con datos de ejemplo también.
 */
async function generarPlantilla() {
  const camposExtra = await obtenerCamposExtraActivos();
  const columnas = [...COLUMNAS, ...camposExtra.map((c) => columnaAtributo(c.clave))];

  const ejemplosAtributos = {};
  for (const c of camposExtra) {
    if (c.tipo === 'BOOLEANO') ejemplosAtributos[columnaAtributo(c.clave)] = 'No';
    else if (c.tipo === 'SELECT') ejemplosAtributos[columnaAtributo(c.clave)] = (c.opciones || [])[0] || '';
    else ejemplosAtributos[columnaAtributo(c.clave)] = '';
  }

  const ejemploA = {
    nombre: 'Tenis Runner Pro',
    marca: 'Nike',
    categoria: 'Calzado',
    modelo: 'Air Max',
    descripcion: '',
    precio_compra: 450,
    precio_venta: 899,
    talla: '9',
    tipo_talla: 'MENS',
    color: 'Negro',
    sku: 'NIKE-AIRMAX-9-NEG',
    proveedor: 'Distribuidora Deportiva SA',
    stock_inicial: 10,
    stock_minimo: 2,
    ...ejemplosAtributos,
  };
  const ejemploB = {
    ...ejemploA,
    talla: '9.5',
    sku: 'NIKE-AIRMAX-9.5-NEG',
    stock_inicial: 8,
  };

  const hojaProductos = XLSX.utils.json_to_sheet([ejemploA, ejemploB], { header: columnas });

  const lineasAtributos =
    camposExtra.length === 0
      ? []
      : [
          [''],
          ['Atributos extra (columnas al final, definidas en Productos → Campos personalizados):'],
          ...camposExtra.map((c) => [
            `  ${columnaAtributo(c.clave)}  →  ${c.etiqueta}: ${descripcionTipo(c)}` +
              (c.requerido ? ' (obligatorio al dar de alta un producto nuevo)' : ' (opcional)'),
          ]),
          [''],
          ['Estas columnas solo se usan al crear un producto NUEVO por Excel. Si la fila extiende un'],
          ['producto que ya existe en el catálogo (mismo nombre+marca), estas columnas se ignoran: los'],
          ['atributos de un producto existente se editan desde la pantalla de Productos, no por Excel.'],
          ['Si dejas una columna de atributo en blanco, ese atributo simplemente no se guarda (o se'],
          ['puede llenar después desde Productos), salvo que esté marcada como obligatoria arriba.'],
        ];

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar esta plantilla'],
    [''],
    ['Obligatorio en cada fila: nombre, marca, categoria, sku.'],
    ['Todo lo demás es opcional.'],
    [''],
    ['Cada fila es UNA variante (una combinación de talla/color con su propio SKU).'],
    ['Si un producto tiene varias tallas o colores, repite "nombre" y "marca" en varias filas'],
    ['(una por variante), cada una con su propio sku. Mira el ejemplo en la hoja "Productos":'],
    ['son 2 filas del mismo producto (Tenis Runner Pro), una para la talla 9 y otra para la 9.5.'],
    [''],
    ['Si "categoria", "modelo" o "precio" cambian entre filas del mismo nombre+marca,'],
    ['se usan los valores de la PRIMERA fila donde aparece ese producto; las demás filas'],
    ['solo necesitan aportar la variante (talla/color/sku/stock).'],
    [''],
    ['Si la marca, categoría o talla no existen todavía en el sistema, se crean solas al importar.'],
    ['Si una fila trae la misma talla/color de un producto que ya existe (en el sistema o antes en'],
    ['este mismo archivo) Y el mismo proveedor, esa fila se omite (no se sobreescribe ningún dato'],
    ['existente). Pero si trae la misma talla/color con un proveedor DISTINTO, no se omite: se agrega'],
    ['como una tanda de stock nueva de ese otro proveedor para esa misma talla/color (una talla puede'],
    ['tener stock de más de un proveedor a la vez).'],
    [''],
    ['proveedor es opcional SOLO si la fila trae stock_inicial en 0 (o en blanco). Si escribes'],
    ['un nombre, esa variante/existencia queda asignada a ese proveedor (se crea solo si no existe'],
    ['todavía). Si dejas la celda vacía y no cargas stock inicial, la variante queda sin proveedor'],
    ['y puedes asignárselo después desde Productos.'],
    [''],
    ['Si la fila SÍ trae stock_inicial mayor a 0, el proveedor es OBLIGATORIO: todo el stock que'],
    ['se carga debe quedar clasificado por proveedor. Si falta, la fila se marca con error y no'],
    ['se importa.'],
    [''],
    ['tipo_talla: para calzado usa uno de estos códigos (según el público/edad):'],
    ['  TD = bebé (~1-4 años), PS = preescolar (~4-7), GS = escolar (~7-12),'],
    ['  WMNS = mujer adulto, MENS = hombre adulto. Para ropa usa "ropa".'],
    ['Si dejas tipo_talla en blanco, la talla se crea con tipo "general"; para calzado'],
    ['es mejor no dejarlo en blanco y usar el código correcto.'],
    [''],
    ['El stock inicial se carga en la sucursal que elijas en la pantalla de importación,'],
    ['no se especifica aquí en el Excel. Si dejas stock_inicial en blanco, se carga en 0'],
    ['y puedes ajustarlo después desde Inventario.'],
    ...lineasAtributos,
  ]);
  hojaInstrucciones['!cols'] = [{ wch: 90 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones');
  XLSX.utils.book_append_sheet(libro, hojaProductos, 'Productos');

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera un .xlsx con el catálogo actual (un renglón por variante+proveedor),
 * usando EXACTAMENTE las mismas columnas que espera el importador (más las
 * de atributos extra) — así el archivo se puede editar y volver a subir tal
 * cual.
 *
 * sucursalId es opcional y cambia el significado del archivo:
 *
 * - Con sucursalId: "stock_inicial"/"stock_minimo" son el stock real de esa
 *   sucursal para cada variante+proveedor. Reimportar este archivo a esa
 *   misma sucursal no duplica nada (las filas que ya coinciden con un bucket
 *   existente se omiten, ver analizarImportacion) y sirve para agregar
 *   variantes o proveedores nuevos a mano en el Excel.
 * - Sin sucursalId: es un resumen de referencia con el stock TOTAL sumado en
 *   todas las sucursales (más una columna extra "stock_por_sucursal" con el
 *   desglose, que el importador ignora por no ser una columna reconocida).
 *   No representa el stock de ninguna sucursal en particular, así que
 *   reimportarlo cargaría ese total completo a la sucursal que se elija en
 *   pantalla — útil como respaldo/lectura, no pensado para reimportarse tal
 *   cual.
 *
 * `productos` debe venir con variantes.talla, variantes.proveedor (el
 * proveedor "por defecto" de la variante) y variantes.existencias (filtradas
 * a la sucursal pedida cuando aplica), cada existencia con su proveedor y
 * sucursal — ver GET /productos/exportar-excel.
 */
async function generarExportacion(productos, { sucursalId } = {}) {
  const camposExtra = await obtenerCamposExtraActivos();
  const columnasAtributos = camposExtra.map((c) => columnaAtributo(c.clave));

  const filas = [];

  for (const p of productos) {
    const datosBase = {
      nombre: p.nombre,
      marca: p.marca?.nombre || '',
      categoria: p.categoria?.nombre || '',
      modelo: p.modelo?.nombre || '',
      descripcion: p.descripcion || '',
      precio_compra: Number(p.precioCompra),
      precio_venta: Number(p.precioVenta),
    };
    const datosAtributos = {};
    for (const campo of camposExtra) {
      const valor = (p.atributosExtra || {})[campo.clave];
      datosAtributos[columnaAtributo(campo.clave)] = formatearValorAtributo(valor, campo);
    }

    for (const v of p.variantes) {
      const datosVariante = {
        talla: v.talla?.valor || '',
        tipo_talla: v.talla?.tipo || '',
        color: v.color || '',
        sku: v.sku,
      };
      const existencias = v.existencias || [];

      if (sucursalId != null) {
        if (existencias.length === 0) {
          // Todavía sin stock en esta sucursal: se exporta la variante de
          // todos modos (para no perder talla/color/sku/atributos del
          // catálogo al reimportar), con el proveedor por defecto de la
          // variante y stock en 0.
          filas.push({
            ...datosBase,
            ...datosVariante,
            proveedor: v.proveedor?.nombre || '',
            stock_inicial: 0,
            stock_minimo: 0,
            ...datosAtributos,
          });
        } else {
          for (const ex of existencias) {
            filas.push({
              ...datosBase,
              ...datosVariante,
              proveedor: ex.proveedor?.nombre || '',
              stock_inicial: ex.stockActual,
              stock_minimo: ex.stockMinimo,
              ...datosAtributos,
            });
          }
        }
      } else {
        // "Todas las sucursales": un renglón por proveedor con el total
        // sumado, más el desglose por sucursal como texto de referencia.
        const porProveedor = new Map(); // proveedorId|'sin-proveedor' -> { nombre, total, detalle[] }
        for (const ex of existencias) {
          const key = ex.proveedorId ?? 'sin-proveedor';
          const entry = porProveedor.get(key) || { nombre: ex.proveedor?.nombre || '', total: 0, detalle: [] };
          entry.total += ex.stockActual;
          entry.detalle.push(`${ex.sucursal?.nombre || '?'}: ${ex.stockActual}`);
          porProveedor.set(key, entry);
        }

        if (porProveedor.size === 0) {
          filas.push({
            ...datosBase,
            ...datosVariante,
            proveedor: v.proveedor?.nombre || '',
            stock_inicial: 0,
            stock_minimo: '',
            [COLUMNA_REFERENCIA_SUCURSALES]: '',
            ...datosAtributos,
          });
        } else {
          for (const entry of porProveedor.values()) {
            filas.push({
              ...datosBase,
              ...datosVariante,
              proveedor: entry.nombre,
              stock_inicial: entry.total,
              // El mínimo se configura por sucursal, no tiene un total con
              // sentido cuando se suman varias — se deja en blanco a
              // propósito en vez de sumarlo también.
              stock_minimo: '',
              [COLUMNA_REFERENCIA_SUCURSALES]: entry.detalle.join(', '),
              ...datosAtributos,
            });
          }
        }
      }
    }
  }

  const columnas = [
    ...COLUMNAS,
    ...(sucursalId == null ? [COLUMNA_REFERENCIA_SUCURSALES] : []),
    ...columnasAtributos,
  ];

  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { COLUMNAS, leerFilasExcel, generarPlantilla, generarExportacion };
