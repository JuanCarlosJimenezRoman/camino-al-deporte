'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { apiTienda } from '@/lib/apiTienda';

interface ProductoTienda {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  stockTotal: number;
}

export default function TiendaCatalogoPage() {
  const [productos, setProductos] = useState<ProductoTienda[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function cargar(busqueda?: string) {
    try {
      const query = busqueda ? `?q=${encodeURIComponent(busqueda)}` : '';
      const data = await apiTienda<ProductoTienda[]>(`/tienda/productos${query}`);
      setProductos(data);
    } catch {
      setError('No se pudo cargar el catálogo. Intenta de nuevo en un momento.');
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Camino al Deporte</p>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">Catálogo</h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            cargar(q);
          }}
          className="relative w-full sm:w-72"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar productos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-full border border-border bg-secondary/60 py-3 pl-10 pr-4 text-sm outline-none focus:border-foreground"
          />
        </form>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {productos === null && !error && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {productos && productos.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay productos disponibles por ahora.</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        {productos?.map((p) => (
          <Link key={p.id} href={`/tienda/productos/${p.id}`} className="group block">
            <div className="mb-3 aspect-square overflow-hidden rounded-2xl bg-secondary">
              {p.imagenes?.[0]?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imagenes[0].url}
                  alt={p.nombre}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <p className="truncate text-sm font-semibold leading-tight">{p.nombre}</p>
            <p className="text-xs text-muted-foreground">{p.marca?.nombre}</p>
            <p className="mt-1 text-sm font-bold">${p.precioVenta}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
