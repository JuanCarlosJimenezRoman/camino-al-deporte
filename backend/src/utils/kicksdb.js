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
// Se prueban DOS traductores gratuitos, en orden, sin necesitar cuenta ni
// API key propia (a diferencia de KICKSDB_API_KEY, no hay nada que
// configurar):
//   1. El endpoint no oficial de Google Translate — el más usado para este
//      truco, pero algunos proveedores de hosting (Render incluido, a
//      veces) caen en rangos de IP que Google bloquea para este endpoint
//      "prestado" (no es la API oficial), así que puede fallar en silencio
//      devolviendo un error o una respuesta vacía.
//   2. MyMemory (api.mymemory.translated.net) — esa sí es una API pública
//      pensada para consumirse por servidor, más confiable para este caso,
//      aunque limita cada consulta a ~500 caracteres en el plan gratuito
//      sin correo (por eso se parte en trozos más chicos que un párrafo).
// Si ambos fallan, se deja el texto en inglés (el campo sigue siendo
// editable a mano en el formulario) en vez de tronar la importación.
//
// Se traduce párrafo por párrafo (en vez del texto completo de una sola
// vez) para conservar los saltos de línea entre párrafos.
async function traducirAlEspanol(texto) {
  const parrafos = texto.split(/\n{2,}/);
  const traducidos = await Promise.all(parrafos.map(traducirParrafo));
  return traducidos.join('\n\n');
}

async function traducirParrafo(parrafo) {
  if (!parrafo.trim()) return parrafo;

  try {
    return await traducirConGoogle(parrafo);
  } catch (err) {
    console.error('Traducción con Google Translate falló, se intenta con MyMemory:', err.message);
  }

  try {
    return await traducirConMyMemory(parrafo);
  } catch (err) {
    console.error('Traducción con MyMemory también falló, se deja el texto en inglés:', err.message);
  }

  return parrafo;
}

async function traducirConGoogle(texto) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'es');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', texto);
  // Sin un User-Agent "de navegador" este endpoint no oficial a veces
  // responde 403 — Google lo sirve para el sitio translate.google.com, no
  // para llamadas de servidor a servidor.
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) throw new Error(`Google Translate respondió ${resp.status}`);
  const data = await resp.json();
  const traducido = (data?.[0] || []).map((segmento) => segmento[0]).join('');
  if (!traducido.trim()) throw new Error('Google Translate regresó una respuesta vacía');
  return traducido;
}

// MyMemory sí está pensada para uso por API, pero limita cada consulta a
// ~500 caracteres en el plan gratuito sin correo — se parte el párrafo en
// trozos por oración (no a la mitad de una palabra) antes de mandarlo.
async function traducirConMyMemory(texto) {
  const trozos = partirEnTrozos(texto, 480);
  const traducidos = [];
  for (const trozo of trozos) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', trozo);
    url.searchParams.set('langpair', 'en|es');
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`MyMemory respondió ${resp.status}`);
    // eslint-disable-next-line no-await-in-loop
    const data = await resp.json();
    const traducido = data?.responseData?.translatedText;
    if (!traducido) throw new Error('MyMemory regresó una respuesta vacía');
    traducidos.push(traducido);
  }
  return traducidos.join(' ');
}

function partirEnTrozos(texto, maxLargo) {
  const oraciones = texto.split(/(?<=[.!?])\s+/);
  const trozos = [];
  let actual = '';
  for (const oracion of oraciones) {
    const conOracion = actual ? `${actual} ${oracion}` : oracion;
    if (conOracion.length > maxLargo && actual) {
      trozos.push(actual.trim());
      actual = oracion;
    } else {
      actual = conOracion;
    }
  }
  if (actual.trim()) trozos.push(actual.trim());
  return trozos;
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
