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
  const detalle = normalizarDetalle(producto);
  if (detalle?.descripcion) {
    detalle.descripcion = await traducirAlEspanol(detalle.descripcion);
  }
  return detalle;
}

// La descripción de KicksDB viene en inglés (copy de marketing de StockX).
// Se traduce con el endpoint no oficial y gratuito de Google Translate (no
// requiere cuenta ni API key propia — a diferencia de KICKSDB_API_KEY, no
// hay nada que configurar). Si algún día deja de responder o Juan prefiere
// una traducción con más calidad, se puede cambiar por la API oficial de
// Google Cloud Translation o DeepL (esas sí piden cuenta y API key).
//
// Se traduce párrafo por párrafo (en vez del texto completo de una sola
// vez) para conservar los saltos de línea entre párrafos, que el traductor
// no siempre respeta si se le manda todo junto.
async function traducirAlEspanol(texto) {
  const parrafos = texto.split(/\n{2,}/);
  const traducidos = await Promise.all(parrafos.map(traducirParrafo));
  return traducidos.join('\n\n');
}

async function traducirParrafo(parrafo) {
  if (!parrafo.trim()) return parrafo;
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'en');
    url.searchParams.set('tl', 'es');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', parrafo);
    const resp = await fetch(url);
    if (!resp.ok) return parrafo;
    const data = await resp.json();
    const traducido = (data?.[0] || []).map((segmento) => segmento[0]).join('');
    return traducido || parrafo;
  } catch (err) {
    // Si falla la traducción (endpoint caído, sin red saliente, etc.) se
    // deja el párrafo en inglés en vez de tronar toda la importación — el
    // campo sigue siendo editable a mano en el formulario.
    console.error('No se pudo traducir un párrafo de la descripción:', err.message);
    return parrafo;
  }
}

// La descripción que trae KicksDB es copy de marketing en inglés con HTML
// crudo (ej. "...<br><br>The Nike Ja 3..."), pensado para un sitio que sí
// interpreta HTML. En el catálogo (tienda en línea y admin) la descripción
// se muestra como texto plano — mostrarla tal cual dejaba los "<br>"
// literales en pantalla. Aquí se convierten los saltos de línea a saltos
// de verdad y se quita cualquier otra etiqueta, para que lo que llegue al
// formulario de alta (campo editable "Descripción") ya sea texto limpio
// que se pueda usar tal cual, recortar o borrar antes de guardar.
function limpiarDescripcion(html) {
  if (!html) return null;
  const texto = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return texto || null;
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
    descripcion: limpiarDescripcion(p.description),
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
