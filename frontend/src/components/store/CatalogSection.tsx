'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { EstadoFiltros, FiltrosPanel, Orden, contarFiltrosActivos, filtrosVacios } from './FiltrosPanel';
import { ProductCard } from './ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductoCatalogo } from '@/lib/catalogo';
import { claseBotonSecundario, claseOjo, claseTituloSeccion } from './ui';
import { PackageSearch } from 'lucide-react';

// Orden para tallas de ropa (no numéricas): el índice en este arreglo, no el
// alfabético — si no, "L" quedaría antes que "M".
const ORDEN_ROPA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function claveOrdenTalla(valor: string): number {
  const num = Number(valor);
  if (!Number.isNaN(num)) return num;
  const posicion = ORDEN_ROPA.indexOf(valor.toUpperCase());
  return posicion >= 0 ? 1000 + posicion : 9999;
}

const PAGINA = 12;

// Catálogo completo con búsqueda, filtros, orden y carga progresiva —
// sección "Grid de productos" del brief (sección 70), montada dentro de
// /tienda. Ya no hace su propio fetch: recibe el catálogo ya cargado por
// <CatalogoProvider/> (un solo fetch para toda la tienda, ver
// lib/catalogo.tsx) — así el header, la home y este grid nunca piden el
// catálogo dos veces.
export function CatalogSection({
  productos,
  cargando,
  error,
  nuevosIds,
  onQuickView,
  initialQ,
  initialCategoria,
  initialMarca,
}: {
  productos: ProductoCatalogo[] | null;
  cargando: boolean;
  error: string | null;
  nuevosIds: Set<number>;
  onQuickView: (producto: ProductoCatalogo) => void;
  initialQ?: string;
  initialCategoria?: string;
  initialMarca?: string;
}) {
  const [q, setQ] = useState(initialQ || '');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [filtros, setFiltros] = useState<EstadoFiltros>(() => {
    const base = filtrosVacios();
    if (initialCategoria) base.categorias.add(initialCategoria);
    if (initialMarca) base.marcas.add(initialMarca);
    return base;
  });
  const [orden, setOrden] = useState<Orden>('recientes');
  const [visibles, setVisibles] = useState(PAGINA);

  const facetas = useMemo(() => {
    const marcas = new Set<string>();
    const categorias = new Set<string>();
    const tallas = new Set<string>();
    const colores = new Set<string>();

    productos?.forEach((p) => {
      if (p.marca?.nombre) marcas.add(p.marca.nombre);
      if (p.categoria?.nombre) categorias.add(p.categoria.nombre);
      p.variantes?.forEach((v) => {
        if (v.talla?.valor) tallas.add(v.talla.valor);
        if (v.color) colores.add(v.color);
      });
    });

    return {
      marcas: [...marcas].sort(),
      categorias: [...categorias].sort(),
      tallas: [...tallas].sort((a, b) => claveOrdenTalla(a) - claveOrdenTalla(b) || a.localeCompare(b)),
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

  // Si el usuario llega (o navega) con un ?categoria=/?marca=/?q= distinto —
  // por ejemplo, hace clic en otra categoría desde el header estando ya en
  // /tienda, sin recargar la página — se adopta el nuevo filtro. No corre en
  // el primer render (ya se usó como valor inicial del useState de arriba).
  const [ultimoInicial, setUltimoInicial] = useState({ initialQ, initialCategoria, initialMarca });
  useEffect(() => {
    if (
      initialQ === ultimoInicial.initialQ &&
      initialCategoria === ultimoInicial.initialCategoria &&
      initialMarca === ultimoInicial.initialMarca
    ) {
      return;
    }
    setUltimoInicial({ initialQ, initialCategoria, initialMarca });
    setQ(initialQ || '');
    const base = filtrosVacios();
    if (initialCategoria) base.categorias.add(initialCategoria);
    if (initialMarca) base.marcas.add(initialMarca);
    setFiltros(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, initialCategoria, initialMarca]);

  // Cada vez que cambian filtros/búsqueda/orden, se reinicia cuántos
  // productos se muestran — evita mandar de golpe cientos de tarjetas al DOM
  // (sección 24 del brief) y que "ver más" arrastre resultados de un filtro
  // ya abandonado.
  useEffect(() => {
    setVisibles(PAGINA);
  }, [q, filtros, orden]);

  const filtrosActivos = contarFiltrosActivos(filtros);
  const mostrados = filtrados?.slice(0, visibles) ?? [];

  return (
    <section id="catalogo" className="scroll-mt-20 border-t border-border py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={claseOjo}>Catálogo completo</p>
          <h2 className={`mt-1 ${claseTituloSeccion}`}>Todos los productos</h2>
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
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
              {filtrosActivos}
            </span>
          )}
        </button>
        {filtrados && <p className="text-xs text-muted-foreground">{filtrados.length} productos</p>}
      </div>

      {error && (
        <EmptyState
          icon={PackageSearch}
          title="No pudimos cargar los productos."
          description={error}
          action={
            <button className={claseBotonSecundario} onClick={() => window.location.reload()}>
              Intentar nuevamente
            </button>
          }
        />
      )}

      {cargando && !error && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-3 aspect-square rounded-2xl" />
              <Skeleton className="mb-1.5 h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {filtrados && filtrados.length === 0 && !cargando && !error && (
        <EmptyState
          icon={PackageSearch}
          title="No encontramos lo que buscas."
          description="Prueba con otra marca, talla o categoría."
          action={
            <button
              className={claseBotonSecundario}
              onClick={() => {
                setQ('');
                setFiltros(filtrosVacios());
              }}
            >
              Limpiar filtros
            </button>
          }
        />
      )}

      {mostrados.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
            {mostrados.map((p) => (
              <ProductCard key={p.id} producto={p} nuevo={nuevosIds.has(p.id)} onQuickView={() => onQuickView(p)} />
            ))}
          </div>

          {filtrados && visibles < filtrados.length && (
            <div className="mt-8 flex justify-center">
              <button className={claseBotonSecundario} onClick={() => setVisibles((v) => v + PAGINA)}>
                Ver más productos ({filtrados.length - visibles} restantes)
              </button>
            </div>
          )}
        </>
      )}

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
    </section>
  );
}
