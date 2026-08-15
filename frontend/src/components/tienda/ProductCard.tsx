'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { imagenCatalogo } from '@/lib/imagenCloudinary';
import { useFavoritos } from '@/lib/favoritos';

export interface ProductoTarjeta {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  stockTotal?: number;
}

// Tarjeta de producto compartida por el catálogo y por "también te puede
// interesar" en el detalle de producto, para que ambas se vean idénticas.
// Incluye el corazón de favoritos (arriba a la derecha, sobre la imagen) y
// el badge de "última pieza" (abajo a la izquierda) cuando solo queda una
// unidad en existencia.
export function ProductCard({ producto, className = '' }: { producto: ProductoTarjeta; className?: string }) {
  const { esFavorito, alternar } = useFavoritos();
  const favorito = esFavorito(producto.id);
  const ultimaPieza = producto.stockTotal === 1;

  return (
    <Link href={`/tienda/productos/${producto.id}`} className={`group block ${className}`}>
      <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl bg-secondary">
        {producto.imagenes?.[0]?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenCatalogo(producto.imagenes[0].url)}
            alt={producto.nombre}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            alternar(producto.id);
          }}
          aria-label={favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          aria-pressed={favorito}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition hover:scale-105"
        >
          <Heart
            className="h-4 w-4"
            strokeWidth={1.75}
            color={favorito ? '#e11d48' : '#111827'}
            fill={favorito ? '#e11d48' : 'none'}
          />
        </button>

        {ultimaPieza && (
          <span className="absolute bottom-2 left-2 rounded-md bg-destructive px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
            Última pieza
          </span>
        )}
      </div>

      <p className="truncate text-sm font-semibold leading-tight">{producto.nombre}</p>
      <p className="text-xs text-muted-foreground">{producto.marca?.nombre}</p>
      <p className="mt-1 text-sm font-bold">${producto.precioVenta}</p>
    </Link>
  );
}
