'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { useFavoritos } from '@/lib/favoritos';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { ProductCard, ProductoTarjeta } from '@/components/tienda/ProductCard';
import { claseBotonPrimario } from '@/components/tienda/ui';

export default function FavoritosPage() {
  const { cliente, cargando } = useAuthCliente();
  const { ids } = useFavoritos();
  const router = useRouter();

  const [favoritos, setFavoritos] = useState<ProductoTarjeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Se filtra por los IDs del contexto (no solo por lo que trajo el fetch
  // inicial) para que, al quitar un corazón desde esta misma página, el
  // producto desaparezca de la lista al instante sin recargar.
  const visibles = favoritos?.filter((p) => ids.has(p.id)) ?? null;

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/favoritos');
      return;
    }
    apiTienda<ProductoTarjeta[]>('/tienda/favoritos')
      .then(setFavoritos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus favoritos.'));
  }, [cargando, cliente, router]);

  if (cargando || !cliente) return null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">Favoritos</h1>
      <p className="mb-8 text-sm text-muted-foreground">Los productos que guardaste con el corazón.</p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {visibles === null && !error && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {visibles && visibles.length === 0 && (
        <div className="flex flex-col items-start gap-4 py-8">
          <p className="text-sm text-muted-foreground">Todavía no has guardado ningún producto.</p>
          <Link href="/tienda" className={claseBotonPrimario}>
            Ver catálogo
          </Link>
        </div>
      )}

      {visibles && visibles.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
          {visibles.map((p) => (
            <ProductCard key={p.id} producto={p} />
          ))}
        </div>
      )}
    </div>
  );
}
