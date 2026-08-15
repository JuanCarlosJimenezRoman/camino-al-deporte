'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { apiTienda } from '@/lib/apiTienda';
import { EstadoFiltros, FiltrosPanel, Orden, contarFiltrosActivos, filtrosVacios } from '@/components/tienda/FiltrosPanel';
import { Testimonios } from '@/components/tienda/Testimonios';
import { ProductCard } from '@/components/tienda/ProductCard';

interface VarianteTienda {
  talla: { valor: string; orden?: number } | null;
  color: string | null;
  stockTotal: number;
}

interface ProductoTienda {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  variantes: VarianteTienda[];
  stockTotal: number;
}

export default function TiendaCatalogoPage() {
  const [productos, setProductos] = useState<ProductoTienda[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [filtros, setFiltros] = useState<EstadoFiltros>(filtrosVacios());
  const [orden, setOrden] = useState<Orden>('recientes');

  useEffect(() => {
    apiTienda<ProductoTienda[]>('/tienda/productos')
      .then(setProductos)
      .catch(() => setError('No se pudo cargar el catálogo. Intenta de nuevo en un momento.'));
  }, []);

  // Opciones disponibles para cada filtro, calculadas a partir de lo que
  // realmente hay en el catálogo (así nunca se muestra una opción vacía).
  const facetas = useMemo(() => {
    const marcas = new Set<string>();
    const categorias = new Set<string>();
    const tallas = new Map<string, number>();
    const colores = new Set<string>();

    productos?.forEach((p) => {
      if (p.marca?.nombre) marcas.add(p.marca.nombre);
      if (p.categoria?.nombre) categorias.add(p.categoria.nombre);
      p.variantes?.forEach((v) => {
        if (v.talla?.valor) tallas.set(v.talla.valor, v.talla.orden ?? 0);
        if (v.color) colores.add(v.color);
      });
    });

    return {
      marcas: [...marcas].sort(),
      categorias: [...categorias].sort(),
      tallas: [...tallas.entries()].sort((a, b) => a[1] - b[1]).map(([valor]) => valor),
      colores: [...colores].sort(),
    };
  }, [productos]);

  const filtrados = useMemo(() => {
    if (!productos) return null;
    const texto = q.trim().toLowerCase();
    const precioMin = filtros.precioMin ? Number(filtros.precioMin) : null;
    const precioMax = filtros.precioMax ? Number(filtros.precioMax) : null;

    const resultado = productos.filter((p) => {
      if (texto && !p.nombre.toLowerCase().includes(texto)) return false;
      if (filtros.categorias.size && !(p.categoria?.nombre && filtros.categorias.has(p.categoria.nombre))) return false;
      if (filtros.marcas.size && !(p.marca?.nombre && filtros.marcas.has(p.marca.nombre))) return false;
      if (filtros.tallas.size && !p.variantes?.some((v) => v.talla?.valor && v.stockTotal > 0 && filtros.tallas.has(v.talla.valor)))
        return false;
      if (filtros.colores.size && !p.variantes?.some((v) => v.color && filtros.colores.has(v.color))) return false;
      const precio = Number(p.precioVenta);
      if (precioMin != null && !Number.isNaN(precioMin) && precio < precioMin) return false;
      if (precioMax != null && !Number.isNaN(precioMax) && precio > precioMax) return false;
      return true;
    });

    if (orden === 'precioAsc') resultado.sort((a, b) => Number(a.precioVenta) - Number(b.precioVenta));
    else if (orden === 'precioDesc') resultado.sort((a, b) => Number(b.precioVenta) - Number(a.precioVenta));

    return resultado;
  }, [productos, q, filtros, orden]);

  const filtrosActivos = contarFiltrosActivos(filtros);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Camino al Deporte</p>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">Catálogo</h1>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar productos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-10 pr-4 text-sm outline-none focus:border-foreground"
          />
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPanelAbierto(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:border-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
          Filtrar y ordenar
          {filtrosActivos > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-bold text-background">
              {filtrosActivos}
            </span>
          )}
        </button>
        {filtrados && <p className="text-xs text-muted-foreground">{filtrados.length} productos</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {productos === null && !error && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {filtrados && filtrados.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay productos que coincidan con tu búsqueda o filtros.</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        {filtrados?.map((p) => (
          <ProductCard key={p.id} producto={p} />
        ))}
      </div>

      <Testimonios />

      <FiltrosPanel
        abierto={panelAbierto}
        onClose={() => setPanelAbierto(false)}
        facetas={facetas}
        filtros={filtros}
        setFiltros={setFiltros}
        orden={orden}
        setOrden={setOrden}
        totalResultados={filtrados?.length ?? 0}
      />
    </div>
  );
}
