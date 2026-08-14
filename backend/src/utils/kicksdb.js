// Cliente para la API de KicksDB (kicks.dev): permite buscar sneakers por
// nombre/SKU y traer su ficha (marca, modelo, colorway, imagen) para no
// tener que capturarla a mano cada vez que llega mercancía nueva — ver
// POST /productos/importar-externo y la sección "Catálogo externo
// (KicksDB)" en docs/ARQUITECTURA.md.
//
// Requiere la variable de entorno KICKSDB_API_KEY (se saca en
// https://kicks.dev/api-keys). Mientras no esté configurada, las rutas que
// la usan responden 503 en vez de tronar, para no tumbar el resto del
// sistema si todavía no se ha dado de alta la cuenta.
//
// OJO: la forma exacta de la respuesta de KicksDB (nombres de campos,
// sobre todo en "variantes"/tallas) se documentó aquí a partir de su
// documentación pública, sin poder probarla en vivo con una API key real
// durante el desarrollo. Antes de confiar en normalizarDetalle() en
// producción, pega GET /productos/buscar-externo/:idExterno con Postman/
// curl usando una API key real y compara el JSON que regresa contra lo que
// se arma abajo — puede que algún nombre de campo (ej. "variants[].size")
// necesite ajustarse. La búsqueda (buscarSneakers) sí se probó contra la
// documentación de forma más directa (query params confirmados).

const KICKSDB_BASE_URL = 'https://api.kicks.dev/v3';

function tieneApiKey() {
  return Boolean(process.env.KICKSDB_API_KEY);
}

async function llamarKicksDB(path, params = {}) {
  if (!tieneApiKey()) {
    const err = new Error('KICKSDB_NO_CONFIGURADO');
    err.code = 'KICKSDB_NO_CONFIGURADO';
    throw err;
  }

  const url = new URL(`${KICKSDB_BASE_URL}${path}`);
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(clave, valor);
    }
  }

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.KICKSDB_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    const err = new Error(`KicksDB respondió ${resp.status}: ${texto.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }

  return resp.json();
}

// Busca sneakers por texto libre (nombre o SKU) contra el índice de StockX
// vía KicksDB. v1 solo usa la fuente "stockx" (la más documentada); se
// podría sumar "goat" o "shopify" más adelante combinando resultados.
async function buscarSneakers(query, { limit = 20 } = {}) {
  const data = await llamarKicksDB('/stockx/products', { query, limit });
  return (data.data || []).map(normalizarResultadoBusqueda);
}

// Ficha de un producto (con tallas si KicksDB las trae) a partir del id o
// slug que regresó buscarSneakers().
async function obtenerDetalleSneaker(identificador) {
  const data = await llamarKicksDB(`/stockx/products/${encodeURIComponent(identificador)}`, {
    'display[variants]': 'true',
    'display[prices]': 'true',
  });
  // Según el endpoint, el producto puntual puede regresar envuelto en
  // "data" o directo — se soportan ambos casos.
  const producto = data?.data && !Array.isArray(data.data) ? data.data : data?.data?.[0] ?? data;
  return normalizarDetalle(producto);
}

function normalizarResultadoBusqueda(p) {
  return {
    idExterno: p.id,
    slug: p.slug,
    titulo: p.title,
    marca: p.brand,
    modelo: p.model,
    genero: p.gender,
    sku: p.sku,
    imagen: p.image,
    precioMin: p.min_price ?? null,
    precioMax: p.max_price ?? null,
    precioPromedio: p.avg_price ?? null,
  };
}

function normalizarDetalle(p) {
  if (!p) return null;
  return {
    idExterno: p.id,
    slug: p.slug,
    titulo: p.title,
    marca: p.brand,
    modelo: p.model,
    genero: p.gender,
    sku: p.sku,
    imagen: p.image,
    colorway: p.colorway ?? p.metadata?.colorway ?? null,
    descripcion: p.description ?? null,
    galeria: p.gallery ?? p.images ?? [],
    // Mejor esfuerzo: se intentan varios nombres de campo comunes para la
    // talla. Se incluye también "raw" con el objeto tal cual vino de
    // KicksDB por si hay que ajustar esto al probar con una key real (ver
    // comentario al inicio del archivo) sin tener que adivinar a ciegas.
    variantes: Array.isArray(p.variants)
      ? p.variants.map((v) => ({
          talla: v.size ?? v.us ?? v.size_us ?? v.sizeUS ?? null,
          precio: v.lowest_ask ?? v.price ?? null,
          raw: v,
        }))
      : [],
    raw: p,
  };
}

module.exports = { tieneApiKey, buscarSneakers, obtenerDetalleSneaker };
