'use client';

// Búsqueda global de la tienda (sección 22-23 del brief): overlay que se
// abre desde el header, con resultados mientras se escribe. No hay un
// endpoint de búsqueda en el backend — se filtra en memoria sobre el mismo
// catálogo que ya carga <CatalogoProvider> (idéntico criterio al que ya usa
// hoy /tienda para su buscador), así que no hay llamadas de red por cada
// tecla y no se inventa ningún backend nuevo.

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { cn, useDelayedUnmount, useMounted } from '@/lib/utils';
import { useCatalogo, ProductoCatalogo } from '@/lib/catalogo';
import { imagenMiniatura } from '@/lib/imagenCloudinary';
import { PriceTag, estadoStockTienda } from './ui';

const LIMITE_RESULTADOS = 6;
const LIMITE_SUGERENCIAS = 4;

function coincide(producto: ProductoCatalogo, texto: string): boolean {
  const t = texto.toLowerCase();
  if (producto.nombre.toLowerCase().includes(t)) return true;
  if (producto.marca?.nombre.toLowerCase().includes(t)) return true;
  if (producto.categoria?.nombre.toLowerCase().includes(t)) return true;
  if (producto.variantes?.some((v) => v.sku.toLowerCase().includes(t))) return true;
  return false;
}

function ResultadoFila({ producto, onClick }: { producto: ProductoCatalogo; onClick: () => void }) {
  const estado = estadoStockTienda(producto.stockTotal);
  return (
    <Link
      href={`/tienda/productos/${producto.id}`}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-secondary"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
        {producto.imagenes?.[0]?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenMiniatura(producto.imagenes[0].url)}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{producto.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{producto.marca?.nombre}</p>
      </div>
      <div className="shrink-0 text-right">
        <PriceTag precio={producto.precioVenta} tamano="sm" />
        {estado.tono !== 'success' && (
          <p className={cn('mt-0.5 text-[11px] font-semibold', estado.tono === 'warning' ? 'text-warning' : 'text-destructive')}>
            {estado.texto}
          </p>
        )}
      </div>
    </Link>
  );
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { productos } = useCatalogo();
  const mounted = useMounted();
  const shouldRender = useDelayedUnmount(open, 180);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      // Pequeño delay: el input todavía no está montado en el mismo tick en
      // que "open" pasa a true (useDelayedUnmount).
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const texto = q.trim();
  const resultados = useMemo(() => {
    if (!texto || !productos) return [];
    return productos.filter((p) => coincide(p, texto)).slice(0, LIMITE_RESULTADOS);
  }, [productos, texto]);

  const totalCoincidencias = useMemo(() => {
    if (!texto || !productos) return 0;
    return productos.filter((p) => coincide(p, texto)).length;
  }, [productos, texto]);

  const sugerencias = useMemo(() => (productos || []).slice(0, LIMITE_SUGERENCIAS), [productos]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110]">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn('fixed inset-0 bg-black/40 transition-opacity duration-180', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en la tienda"
        className={cn(
          'fixed inset-x-0 top-0 flex max-h-[85vh] flex-col overflow-hidden bg-background shadow-elevated transition-all duration-180 sm:inset-x-auto sm:left-1/2 sm:top-6 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl',
          open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        )}
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar tenis, marcas, SKU..."
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button onClick={onClose} aria-label="Cerrar búsqueda" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!texto && (
            <div className="p-3">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quizás te interese</p>
              <div className="space-y-1">
                {sugerencias.map((p) => (
                  <ResultadoFila key={p.id} producto={p} onClick={onClose} />
                ))}
              </div>
            </div>
          )}

          {texto && resultados.length > 0 && (
            <div className="space-y-1">
              {resultados.map((p) => (
                <ResultadoFila key={p.id} producto={p} onClick={onClose} />
              ))}
            </div>
          )}

          {texto && productos && resultados.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-semibold">No encontramos lo que buscas.</p>
              <p className="mt-1 text-sm text-muted-foreground">Prueba con otra marca, talla o categoría.</p>
              {sugerencias.length > 0 && (
                <div className="mt-6 space-y-1 text-left">
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos destacados</p>
                  {sugerencias.map((p) => (
                    <ResultadoFila key={p.id} producto={p} onClick={onClose} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {texto && totalCoincidencias > resultados.length && (
          <Link
            href={`/tienda/productos?q=${encodeURIComponent(texto)}`}
            onClick={onClose}
            className="block border-t border-border p-4 text-center text-sm font-semibold uppercase tracking-wide hover:bg-secondary"
          >
            Ver los {totalCoincidencias} resultados
          </Link>
        )}
      </div>
    </div>,
    document.body
  );
}
