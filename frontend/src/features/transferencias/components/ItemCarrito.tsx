'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { SelectorCantidad } from './SelectorCantidad';
import type { ItemTraspaso } from '../types';

interface Props {
  item: ItemTraspaso;
  onCambiarCantidad: (key: string, nueva: number) => void;
  onQuitar: (key: string) => void;
}

export function ItemCarrito({ item, onCambiarCantidad, onQuitar }: Props) {
  const p = item.existencia.variante.producto;
  const detalle = [item.existencia.variante.talla?.valor, item.existencia.variante.color]
    .filter(Boolean)
    .join(' / ');

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
      <ProductoThumb url={imagenPrincipal(p, item.existencia.variante.color)} alt="" size={44} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{p.nombre}</div>
        <div className="text-xs text-muted-foreground truncate">
          {detalle || 'Único'} · {item.existencia.proveedor?.nombre ?? 'sin proveedor'}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <SelectorCantidad
            cantidad={item.cantidad}
            onCambiar={(n) => onCambiarCantidad(item.key, n)}
            max={item.existencia.stockActual}
          />
          <span className="text-xs text-muted-foreground">disp. {item.existencia.stockActual}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onQuitar(item.key)}
        aria-label="Quitar del traspaso"
        className="shrink-0 text-destructive"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}