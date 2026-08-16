const prisma = require('../db');
const { generarCodigoInterno } = require('./codigoInterno');

// Estos 4 campos son los únicos obligatorios para poder registrar un
// producto por Excel. Todo lo demás (modelo, descripción, precios, talla,
// color, stock) es opcional — la carga de stock/ajustes de inventario tiene
// su propio flujo dedicado (Inventario / Transferencias) y no depende de
// esto.
const CAMPOS_OBLIGATORIOS = ['nombre', 'marca', 'categoria', 'sku'];

function normalizarTexto(valor) {
  return String(valor ?? '').trim();
}

function normalizarNumero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function claveGrupo(nombre, marca) {
  return `${nombre.toLowerCase()}__${marca.toLowerCase()}`;
}

/**
 * Convierte las filas crudas del Excel (objetos con las claves de COLUMNAS)
 * en filas normalizadas y ya marca cuáles tienen campos obligatorios
 * faltantes.
 */
function normalizarFilas(filasCrudas) {
  return filasCrudas.map((raw, i) => {
    const fila = i + 2; // fila 1 = encabezado en el Excel
    const nombre = normalizarTexto(raw.nombre);
    const marca = normalizarTexto(raw.marca);
    const categoria = normalizarTexto(raw.categoria);
    const sku = normalizarTexto(raw.sku);

    const valores = { nombre, marca, categoria, sku };
    const faltantes = CAMPOS_OBLIGATORIOS.filter((c) => !valores[c]);

    return {
      fila,
      nombre,
      marca,
      categoria,
      modelo: normalizarTexto(raw.modelo),
      descripcion: normalizarTexto(raw.descripcion),
      precioCompra: normalizarNumero(raw.precio_compra),
      precioVenta: normalizarNumero(raw.precio_venta),
      talla: normalizarTexto(raw.talla),
      tipoTalla: normalizarTexto(raw.tipo_talla) || 'general',
      color: normalizarTexto(raw.color) || null,
      sku,
      proveedor: normalizarTexto(raw.proveedor) || null,
      stockInicial: normalizarNumero(raw.stock_inicial),
      stockMinimo: normalizarNumero(raw.stock_minimo),
      faltantes,
    };
  });
}

// Identifica una variante (talla/color dentro de un producto) para detectar
// duplicados. Ya NO se usa el SKU para esto: en calzado el SKU de fábrica
// viene por lote y se repite a propósito entre varias tallas del mismo
// producto (ver docs/ARQUITECTURA.md), así que dos filas con el mismo SKU
// pero distinta talla son dos variantes válidas, no un duplicado. Lo que sí
// identifica una variante de verdad es producto (nombre+marca) + talla +
// color, que es exactamente lo que exige el modelo de datos.
function claveVariante(claveProducto, talla, tipoTalla, color) {
  const tallaKey = talla ? `${talla.toLowerCase()}__${tipoTalla.toLowerCase()}` : '';
  const colorKey = (color || '').toLowerCase();
  return `${claveProducto}::${tallaKey}::${colorKey}`;
}

/**
 * Valida las filas sin escribir nada en la base de datos: para la vista
 * previa antes de confirmar la importación.
 */
async function analizarImportacion(filasCrudas) {
  const filas = normalizarFilas(filasCrudas);

  // Antes esto armaba un WHERE con un OR de una condición por cada fila del
  // archivo (cada una comparando nombre + la marca relacionada, sin importar
  // mayúsculas). Con un archivo chico no se notaba, pero con ~600 filas esa
  // consulta se volvía tan pesada (600 ramas, cada una con un filtro sobre
  // una tabla relacionada) que tumbaba la base de datos en el plan básico de
  // Render. En vez de eso, se trae UNA sola vez todo el catálogo activo — es
  // un query barato y de tamaño fijo (depende del catálogo, no del archivo
  // que estás subiendo) — y el cruce nombre+marca se hace en memoria.
  const productosExistentes = await prisma.producto.findMany({
    where: { activo: true },
    include: { variantes: { include: { talla: true } }, marca: true },
  });

  const clavesVariantesDB = new Set();
  for (const p of productosExistentes) {
    const claveProducto = claveGrupo(p.nombre, p.marca.nombre);
    for (const v of p.variantes) {
      clavesVariantesDB.add(claveVariante(claveProducto, v.talla?.valor ?? null, v.talla?.tipo ?? '', v.color));
    }
  }

  const vistosEnArchivo = new Map(); // claveVariante -> primera fila donde apareció
  const resultado = [];

  for (const f of filas) {
    if (f.faltantes.length > 0) {
      resultado.push({ ...f, estado: 'error', motivo: `Faltan campos obligatorios: ${f.faltantes.join(', ')}` });
      continue;
    }
    const claveProducto = claveGrupo(f.nombre, f.marca);
    const clave = claveVariante(claveProducto, f.talla, f.tipoTalla, f.color);

    if (clavesVariantesDB.has(clave)) {
      resultado.push({ ...f, estado: 'omitida', motivo: 'Esa talla/color de este producto ya existe en el sistema' });
      continue;
    }
    if (vistosEnArchivo.has(clave)) {
      resultado.push({
        ...f,
        estado: 'omitida',
        motivo: `Talla/color repetido dentro del archivo para este producto (ya apareció en la fila ${vistosEnArchivo.get(clave)})`,
      });
      continue;
    }
    vistosEnArchivo.set(clave, f.fila);
    resultado.push({ ...f, estado: 'ok' });
  }

  const productosDistintos = new Set(
    resultado.filter((r) => r.estado === 'ok').map((r) => claveGrupo(r.nombre, r.marca))
  );

  return {
    filas: resultado,
    resumen: {
      totalFilas: filas.length,
      validas: resultado.filter((r) => r.estado === 'ok').length,
      omitidas: resultado.filter((r) => r.estado === 'omitida').length,
      conError: resultado.filter((r) => r.estado === 'error').length,
      productosDistintos: productosDistintos.size,
    },
  };
}

async function buscarOCrearMarca(tx, nombre) {
  const existente = await tx.marca.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
  if (existente) return existente;
  return tx.marca.create({ data: { nombre } });
}

async function buscarOCrearCategoria(tx, nombre) {
  const existente = await tx.categoria.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
  if (existente) return existente;
  return tx.categoria.create({ data: { nombre } });
}

async function buscarOCrearModelo(tx, nombre, marcaId) {
  const existente = await tx.modelo.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, marcaId },
  });
  if (existente) return existente;
  return tx.modelo.create({ data: { nombre, marcaId } });
}

async function buscarOCrearTalla(tx, valor, tipo) {
  const existente = await tx.talla.findFirst({
    where: { valor: { equals: valor, mode: 'insensitive' }, tipo: { equals: tipo, mode: 'insensitive' } },
  });
  if (existente) return existente;
  return tx.talla.create({ data: { valor, tipo } });
}

async function buscarProductoExistente(tx, nombre, marcaId) {
  return tx.producto.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, marcaId, activo: true },
  });
}

async function buscarOCrearProveedor(tx, nombre) {
  const existente = await tx.proveedor.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
  if (existente) return existente;
  return tx.proveedor.create({ data: { nombre } });
}

/**
 * Ejecuta la importación de verdad, dentro de una transacción. Vuelve a
 * correr la misma validación (analizarImportacion) por si algo cambió en la
 * base de datos entre la vista previa y la confirmación (por ejemplo, otro
 * usuario ya registró uno de esos SKUs mientras tanto).
 */
async function ejecutarImportacion(filasCrudas, { sucursalId, usuarioId }) {
  const { filas } = await analizarImportacion(filasCrudas);
  const filasValidas = filas.filter((f) => f.estado === 'ok');

  const stats = { productosCreados: 0, productosExtendidos: 0, variantesCreadas: 0 };

  await prisma.$transaction(
    async (tx) => {
      const cacheProducto = new Map(); // clave nombre+marca -> productoId
      const proveedoresPorNombre = new Map(); // nombre en minúsculas -> proveedorId

      for (const f of filasValidas) {
        const marca = await buscarOCrearMarca(tx, f.marca);
        const clave = claveGrupo(f.nombre, f.marca);

        let productoId = cacheProducto.get(clave);

        if (!productoId) {
          const existente = await buscarProductoExistente(tx, f.nombre, marca.id);
          if (existente) {
            productoId = existente.id;
            stats.productosExtendidos++;
          } else {
            const categoria = await buscarOCrearCategoria(tx, f.categoria);
            let modeloId;
            if (f.modelo) {
              const modelo = await buscarOCrearModelo(tx, f.modelo, marca.id);
              modeloId = modelo.id;
            }
            const nuevo = await tx.producto.create({
              data: {
                nombre: f.nombre,
                marcaId: marca.id,
                categoriaId: categoria.id,
                modeloId,
                descripcion: f.descripcion || undefined,
                precioCompra: f.precioCompra,
                precioVenta: f.precioVenta,
              },
            });
            productoId = nuevo.id;
            stats.productosCreados++;
          }
          cacheProducto.set(clave, productoId);
        }

        let tallaId;
        if (f.talla) {
          const talla = await buscarOCrearTalla(tx, f.talla, f.tipoTalla);
          tallaId = talla.id;
        }

        // proveedor es opcional: si se llenó esa celda, se busca/crea y se
        // asigna tanto a la variante (proveedor por defecto) como a la
        // existencia (proveedor real de ese bulto de stock); si se dejó en
        // blanco queda null y se asigna después desde Productos, igual que
        // en el alta manual y en la importación por KicksDB.
        let proveedorId;
        if (f.proveedor) {
          const proveedorCache = proveedoresPorNombre.get(f.proveedor.toLowerCase());
          if (proveedorCache) {
            proveedorId = proveedorCache;
          } else {
            const proveedor = await buscarOCrearProveedor(tx, f.proveedor);
            proveedoresPorNombre.set(f.proveedor.toLowerCase(), proveedor.id);
            proveedorId = proveedor.id;
          }
        }

        const codigoInterno = await generarCodigoInterno(tx, { sku: f.sku, tallaValor: f.talla || null, color: f.color });
        const variante = await tx.productoVariante.create({
          data: { productoId, tallaId, color: f.color, sku: f.sku, codigoInterno, proveedorId },
        });
        stats.variantesCreadas++;

        // Siempre se crea la fila de existencia en la sucursal elegida, aunque
        // el stock inicial sea 0 — si no, la variante no aparecería en
        // Inventario (que lista existencias) y no habría forma de cargarle
        // stock después.
        await tx.existencia.create({
          data: {
            sucursalId,
            varianteId: variante.id,
            stockActual: f.stockInicial,
            stockMinimo: f.stockMinimo,
            proveedorId,
          },
        });
        if (f.stockInicial > 0) {
          await tx.movimientoInventario.create({
            data: {
              sucursalId,
              varianteId: variante.id,
              tipo: 'ENTRADA',
              cantidad: f.stockInicial,
              motivo: 'Importación de productos desde Excel',
              usuarioId,
            },
          });
        }
      }
    },
    { timeout: 60000 }
  );

  return {
    ...stats,
    filasOmitidas: filas.filter((f) => f.estado === 'omitida').length,
    filasConError: filas.filter((f) => f.estado === 'error').length,
  };
}

// buscarOCrear* y buscarProductoExistente también se exportan para
// reutilizarse desde routes/catalogoExterno.js (alta de productos vía
// KicksDB): es el mismo patrón "buscar o crear" catálogo que ya usaba la
// importación por Excel, no tiene sentido duplicarlo.
module.exports = {
  analizarImportacion,
  ejecutarImportacion,
  buscarOCrearMarca,
  buscarOCrearCategoria,
  buscarOCrearModelo,
  buscarOCrearTalla,
  buscarOCrearProveedor,
  buscarProductoExistente,
};
