// Recuerda, en sessionStorage, la lista de productos (mismos filtros/orden
// que se tenían activos en /dashboard/productos, una página del listado a
// la vez) para que la vista de un producto individual
// (/dashboard/productos/[id]) pueda ofrecer "anterior/siguiente" sin volver
// a la lista — ver los botones </> junto al título en esa página.
//
// Vive en sessionStorage (no localStorage) a propósito: es contexto de la
// sesión de navegación actual (esta pestaña, ahora mismo), no algo que deba
// sobrevivir entre pestañas nuevas o entre visitas de otro día.

const CLAVE = 'productos_nav_lista';

export interface ListaNavegacionProductos {
  ids: number[];
  pagina: number;
  totalPaginas: number;
  total: number;
  // Filtros/orden ya armados como querystring (q, marcaId, categoriaId,
  // modeloId, tallaId, ordenarPor, orden) — SIN "page" ni "limit", para
  // poder pedir cualquier página vecina reutilizando el mismo criterio.
  qsBase: string;
  limit: number;
}

export function guardarListaNavegacion(datos: ListaNavegacionProductos) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // sessionStorage puede fallar (modo privado, cuota llena) — no es
    // crítico, simplemente no habrá anterior/siguiente en la vista del
    // producto.
  }
}

export function leerListaNavegacion(): ListaNavegacionProductos | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    if (!datos || !Array.isArray(datos.ids)) return null;
    return datos as ListaNavegacionProductos;
  } catch {
    return null;
  }
}
