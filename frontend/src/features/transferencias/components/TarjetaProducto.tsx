'use client';

import { Check } from 'lucide-react';
import { claveExistencia } from '../utils';
import type { Existencia, ProductoAgrupado } from '../types';

interface Props {
  producto: ProductoAgrupado;
  etiquetas: Map<string, string>;
  expandido: boolean;
  seleccionadas: Set<string>;
  onClic: () => void;
  onElegir: (e: Existencia) => void;
}

export function TarjetaProducto({
  producto,
  etiquetas,
  expandido,
  seleccionadas,
  onClic,
  onElegir,
}: Props) {
  const multiple = producto.variantes.length > 1;
  const agregado = producto.variantes.some((v) => seleccionadas.has(claveExistencia(v)));

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        agregado ? 'border-primary bg-accent/30' : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <button type="button" onClick={onClic} className="flex flex-1 flex-col gap-2 text-left">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-secondary/50 p-2">
          {producto.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagenUrl} alt={producto.nombre} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-full w-full rounded bg-secondary" />
          )}
          {agregado && (
            <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="w-3 h-3" />
            </span>
          )}
        </div>
        <div>
          <div className="line-clamp-2 text-sm font-medium leading-tight">{producto.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">{producto.marca ?? producto.skuRef}</div>
        </div>
      </button>

      <div className="text-xs text-muted-foreground">Stock en origen: {producto.stockTotal}</div>

      {multiple &&
        (expandido ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {producto.variantes.map((v) => {
              const key = claveExistencia(v);
              const yaAgregado = seleccionadas.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onElegir(v)}
                  disabled={v.stockActual <= 0}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                    yaAgregado
                      ? 'border-primary bg-accent text-primary'
                      : 'border-border hover:border-primary hover:text-primary'
                  }`}
                >
                  {etiquetas.get(key)} · {v.stockActual}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">{producto.variantes.length} variantes · toca para elegir</div>
        ))}
    </div>
  );
}