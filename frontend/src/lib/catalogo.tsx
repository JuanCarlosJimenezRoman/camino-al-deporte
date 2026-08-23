'use client';

// Catálogo compartido de la tienda en línea: un solo fetch de
// GET /tienda/productos, reutilizado por el header (nav de categorías,
// búsqueda), la home de /tienda (categorías, destacados, más vendidos*,
// recién llegados, últimas unidades, marcas) y el catálogo completo — en vez
// de que cada componente pida la lista por su cuenta. Vive en este
// provider (montado en TiendaLayout, junto a Carrito/Favoritos) para que
// sobreviva la navegación entre rutas de /tienda/* sin volver a pedirse.
//
// * "Más vendido" y "oferta" NO se calculan aquí: el endpoint público no
// expone ventas ni precio de comparación (ver GET /tienda/productos en el
// backend), y el brief de rediseño prohíbe inventar esos datos. Lo que sí es
// real y se puede derivar sin tocar el backend es el ORDEN en que el
// backend ya devuelve el catálogo (orderBy: createdAt desc) — por eso
// `nuevosIds` usa la posición en ese arreglo, no una fecha inventada.

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { apiTienda } from './apiTienda';

export interface VarianteCatalogo {
  id: number;
  sku: string;
  color: string | null;
  talla: { valor: string; orden?: number; tipo?: string } | null;
  stockTotal: number;
}

export interface ProductoCatalogo {
  id: number;
  nombre: string;
  descripcion: string | null;
  marca: { id: number; nombre: string } | null;
  modelo: { id: number; nombre: string } | null;
  // imagenPortada: portada elegida a mano para la categoría desde el panel
  // (Catálogo → Categorías). null/undefined = todavía no se subió ninguna —
  // ver categoriasConImagen en app/(store)/tienda/(shop)/page.tsx para el
  // criterio de respaldo.
  categoria: { id: number; nombre: string; imagenPortada?: string | null } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  variantes: VarianteCatalogo[];
  stockTotal: number;
  // Campos personalizados del producto (definidos en el panel admin, ver
  // dashboard/campos-personalizados) — mismo formato clave→string que ya usa
  // el panel. Ej: atributosExtra?.destacado === 'true'.
  atributosExtra?: Record<string, string> | null;
}

export interface ConteoNombre {
  nombre: string;
  cantidad: number;
}

interface CatalogoContextValue {
  productos: ProductoCatalogo[] | null;
  cargando: boolean;
  error: string | null;
  categorias: ConteoNombre[];
  marcas: ConteoNombre[];
  /** IDs de los productos más recientes según el orden real del backend
   * (createdAt desc) — usado para el badge "Nuevo" y "Recién llegados". */
  nuevosIds: Set<number>;
  /** Productos con stock bajo (1 a 5 unidades) — para "Últimas unidades". */
  ultimasUnidades: ProductoCatalogo[];
  recargar: () => void;
}

const CANTIDAD_NUEVOS = 12;
const UMBRAL_ULTIMAS_UNIDADES = 5;

const CatalogoContext = createContext<CatalogoContextValue | undefined>(undefined);

function contarPor(productos: ProductoCatalogo[], obtenerNombre: (p: ProductoCatalogo) => string | undefined): ConteoNombre[] {
  const mapa = new Map<string, number>();
  for (const p of productos) {
    const nombre = obtenerNombre(p);
    if (!nombre) continue;
    mapa.set(nombre, (mapa.get(nombre) || 0) + 1);
  }
  return [...mapa.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
}

export function CatalogoProvider({ children }: { children: ReactNode }) {
  const [productos, setProductos] = useState<ProductoCatalogo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    apiTienda<ProductoCatalogo[]>('/tienda/productos')
      .then((data) => {
        if (activo) setProductos(data);
      })
      .catch(() => {
        if (activo) setError('No se pudo cargar el catálogo. Intenta de nuevo en un momento.');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [intento]);

  const categorias = useMemo(() => contarPor(productos || [], (p) => p.categoria?.nombre), [productos]);
  const marcas = useMemo(() => contarPor(productos || [], (p) => p.marca?.nombre), [productos]);

  const nuevosIds = useMemo(() => {
    if (!productos) return new Set<number>();
    return new Set(productos.slice(0, CANTIDAD_NUEVOS).map((p) => p.id));
  }, [productos]);

  const ultimasUnidades = useMemo(() => {
    if (!productos) return [];
    return productos.filter((p) => p.stockTotal > 0 && p.stockTotal <= UMBRAL_ULTIMAS_UNIDADES);
  }, [productos]);

  return (
    <CatalogoContext.Provider
      value={{
        productos,
        cargando,
        error,
        categorias,
        marcas,
        nuevosIds,
        ultimasUnidades,
        recargar: () => setIntento((i) => i + 1),
      }}
    >
      {children}
    </CatalogoContext.Provider>
  );
}

export function useCatalogo() {
  const ctx = useContext(CatalogoContext);
  if (!ctx) throw new Error('useCatalogo debe usarse dentro de <CatalogoProvider>');
  return ctx;
}
