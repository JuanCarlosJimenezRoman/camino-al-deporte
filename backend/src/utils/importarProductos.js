const prisma = require('../db');

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
      stockInicial: normalizarNumero(raw.stock_inicial),
      stockMinimo: normalizarNumero(raw.stock_minimo),
      faltantes,
    };
  });
}

/**
 * Valida las filas sin escribir nada en la base de datos: para la vista
 * previa antes de confirmar la importación.
 */
async function analizarImportacion(filasCrudas) {
  const filas = normalizarFilas(filasCrudas);

  const skusDelArchivo = filas.map((f) => f.sku).filter(Boolean);
  const existentes = skusDelArchivo.length
    ? await prisma.productoVariante.findMany({
        where: { sku: { in: skusDelArchivo } },
        select: { sku: true },
      })
    : [];
  const skusExistentesDB = new Set(existentes.map((v) => v.sku));

  const skusVistosEnArchivo = new Map(); // sku -> primera fila donde apareció
  const resultado = [];

  for (const f of filas) {
    if (f.faltantes.length > 0) {
      resultado.push({ ...f, estado: 'error', motivo: `Faltan campos obligatorios: ${f.faltantes.join(', ')}` });
      continue;
    }
    if (skusExistentesDB.has(f.sku)) {
      resultado.push({ ...f, estado: 'omitida', motivo: 'El SKU ya existe en el sistema' });
      continue;
    }
    if (skusVistosEnArchivo.has(f.sku)) {
      resultado.push({
        ...f,
        estado: 'omitida',
        motivo: `SKU repetido dentro del archivo (ya apareció en la fila ${skusVistosEnArchivo.get(f.sku)})`,
      });
      continue;
    }
    skusVistosEnArchivo.set(f.sku, f.fila);
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

        const variante = await tx.productoVariante.create({
          data: { productoId, tallaId, color: f.color, sku: f.sku },
        });
        stats.variantesCreadas++;

        if (f.stockInicial > 0 || f.stockMinimo > 0) {
          await tx.existencia.create({
            data: {
              sucursalId,
              varianteId: variante.id,
              stockActual: f.stockInicial,
              stockMinimo: f.stockMinimo,
            },
          });
        }
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

module.exports = { analizarImportacion, ejecutarImportacion };
