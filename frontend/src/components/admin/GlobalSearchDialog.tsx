'use client';

/**
 * Buscador global del topbar (⌘K / Ctrl K). Alcance de esta fase: busca
 * productos por nombre/marca/categoría usando el mismo endpoint y parámetro
 * (`GET /productos?q=`) que ya usa la página de Productos — no se agrega
 * nada nuevo al backend. Buscar ventas/clientes en el mismo cuadro queda
 * para cuando se rediseñe Ventas (hoy no hay un endpoint de búsqueda
 * cruzada entre entidades).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { imagenPrincipal, ProductoThumb } from '@/components/admin/ProductoThumb';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';

interface ProductoResultado {
  id: number;
  nombre: string;
  precioVenta: string;
  marca: { nombre: string };
  categoria: { nombre: string };
  imagenes: { url: string; color?: string | null; esPrincipal?: boolean }[];
}

export function GlobalSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<ProductoResultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTermino('');
      setResultados(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!termino.trim()) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const handle = setTimeout(async () => {
      try {
        const data = await api<{ data: ProductoResultado[] }>(
          `/productos?q=${encodeURIComponent(termino.trim())}&limit=8`
        );
        setResultados(data.data);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [termino]);

  function irAProductos() {
    onOpenChange(false);
    router.push('/dashboard/productos');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0" showClose={false}>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder="Buscar productos, SKU, marca…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground border-0 p-0"
          />
          {buscando && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {!termino.trim() && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Escribe para buscar en el catálogo de productos.
            </p>
          )}

          {termino.trim() && resultados !== null && resultados.length === 0 && (
            <EmptyState
              icon={Package}
              title="Sin resultados"
              description={`No encontramos productos que coincidan con "${termino}".`}
            />
          )}

          {resultados?.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onOpenChange(false);
                router.push('/dashboard/productos');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-secondary transition-colors"
            >
              <ProductoThumb url={imagenPrincipal(p)} alt={p.nombre} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.marca?.nombre} · {p.categoria?.nombre}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">
                ${Number(p.precioVenta).toLocaleString('es-MX')}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={irAProductos}
          className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          Ver todos los productos
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
