const XLSX = require('xlsx');

// Columnas que reconoce el importador. El orden aquí es el orden en que
// aparecen en la plantilla descargable.
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
  'stock_inicial',
  'stock_minimo',
];

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
 * patrón de "una fila = una variante".
 */
function generarPlantilla() {
  const ejemploA = {
    nombre: 'Tenis Runner Pro',
    marca: 'Nike',
    categoria: 'Calzado',
    modelo: 'Air Max',
    descripcion: '',
    precio_compra: 450,
    precio_venta: 899,
    talla: '9',
    tipo_talla: 'calzado',
    color: 'Negro',
    sku: 'NIKE-AIRMAX-9-NEG',
    stock_inicial: 10,
    stock_minimo: 2,
  };
  const ejemploB = {
    ...ejemploA,
    talla: '9.5',
    sku: 'NIKE-AIRMAX-9.5-NEG',
    stock_inicial: 8,
  };

  const hojaProductos = XLSX.utils.json_to_sheet([ejemploA, ejemploB], { header: COLUMNAS });

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
    ['Si un SKU ya existe, esa fila se omite (no se sobreescribe ningún dato existente).'],
    [''],
    ['El stock inicial se carga en la sucursal que elijas en la pantalla de importación,'],
    ['no se especifica aquí en el Excel. Si dejas stock_inicial en blanco, se carga en 0'],
    ['y puedes ajustarlo después desde Inventario.'],
  ]);
  hojaInstrucciones['!cols'] = [{ wch: 90 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones');
  XLSX.utils.book_append_sheet(libro, hojaProductos, 'Productos');

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera un .xlsx con el catálogo actual (un renglón por variante), para
 * respaldo o edición offline.
 */
function generarExportacion(productos) {
  const filas = [];

  for (const p of productos) {
    for (const v of p.variantes) {
      const porSucursal = (v.existencias || [])
        .map((ex) => `${ex.sucursal.nombre}: ${ex.stockActual}`)
        .join(', ');
      const stockTotal = (v.existencias || []).reduce((acc, ex) => acc + ex.stockActual, 0);

      filas.push({
        nombre: p.nombre,
        marca: p.marca?.nombre || '',
        categoria: p.categoria?.nombre || '',
        modelo: p.modelo?.nombre || '',
        descripcion: p.descripcion || '',
        precio_compra: Number(p.precioCompra),
        precio_venta: Number(p.precioVenta),
        talla: v.talla?.valor || '',
        tipo_talla: v.talla?.tipo || '',
        color: v.color || '',
        sku: v.sku,
        stock_total: stockTotal,
        stock_por_sucursal: porSucursal,
      });
    }
  }

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { COLUMNAS, leerFilasExcel, generarPlantilla, generarExportacion };
