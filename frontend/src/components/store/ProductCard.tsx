'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Heart, Eye } from 'lucide-react';
import { imagenCatalogo } from '@/lib/imagenCloudinary';
import { useFavoritos } from '@/lib/favoritos';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { claseBadgeNuevo, claseBadgeUltimas, claseBadgeAgotado, claseBotonFantasma, PriceTag, estadoStockTienda } from './ui';

export interface ProductoTarjeta {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  stockTotal?: number;
}

// Tarjeta de producto compartida por el catálogo, la home y "también te
// puede interesar". La imagen ocupa la mayor parte de la tarjeta (~70% del
// peso visual, ver sección 13 del brief); debajo solo lo esencial: marca,
// nombre, precio y estado. `nuevo` y `onQuickView` son opcionales para que
// esta misma tarjeta siga funcionando en contextos donde no hay esos datos
// (favoritos, relacionados) sin tener que duplicar el componente.
export function ProductCard({
  producto,
  nuevo = false,
  onQuickView,
  className = '',
}: {
  producto: ProductoTarjeta;
  nuevo?: boolean;
  onQuickView?: () => void;
  className?: string;
}) {
  const { esFavorito, alternar } = useFavoritos();
  const favorito = esFavorito(producto.id);
  const stockTotal = producto.stockTotal ?? 0;
  const estado = estadoStockTienda(stockTotal);
  const agotado = stockTotal <= 0;

  function alternarFavorito(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const eraFavorito = favorito;
    alternar(producto.id);
    if (!eraFavorito) toast({ title: '♥ Agregado a favoritos', description: producto.nombre });
  }

  return (
    <Link href={`/tienda/productos/${producto.id}`} className={`group block ${className}`}>
      <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl bg-secondary">
        {producto.imagenes?.[0]?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenCatalogo(producto.imagenes[0].url)}
            alt={producto.nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Sin foto</div>
        )}

        {agotado && <div className="absolute inset-0 bg-background/50" aria-hidden="true" />}

        {/* Badges reales únicamente: nuevo (por orden real del catálogo) y
            últimas unidades/agotado (por stock real). Nada de "más vendido"
            ni "oferta" sin datos que los respalden. */}
        <div className="absolute left-2 top-2 flex flex-col gap-1.5">
          {nuevo && !agotado && <span className={claseBadgeNuevo}>Nuevo</span>}
          {estado.tono === 'warning' && <span className={claseBadgeUltimas}>{estado.texto}</span>}
          {agotado && <span className={claseBadgeAgotado}>Agotado</span>}
        </div>

        <button
          type="button"
          onClick={alternarFavorito}
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

        {/* Vista rápida: aparece al pasar el mouse en escritorio, siempre
            presente en táctil (no hay hover real en móvil). */}
        {onQuickView && !agotado && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView();
            }}
            className={cn(
              claseBotonFantasma,
              'absolute inset-x-2 bottom-2 opacity-100 duration-150 sm:opacity-0 sm:group-hover:opacity-100'
            )}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            Vista rápida
          </button>
        )}
      </div>

      <p className="truncate text-sm font-semibold leading-tight">{producto.nombre}</p>
      <p className="text-xs text-muted-foreground">{producto.marca?.nombre}</p>
      <div className="mt-1 flex items-center gap-2">
        <PriceTag precio={producto.precioVenta} tamano="sm" />
        {estado.tono !== 'success' && (
          <span className={`text-[11px] font-semibold ${estado.tono === 'warning' ? 'text-warning' : 'text-destructive'}`}>
            {estado.texto}
          </span>
        )}
      </div>
    </Link>
  );
}
