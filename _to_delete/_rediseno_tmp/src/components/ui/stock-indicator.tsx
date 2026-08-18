import { cn } from '@/lib/utils';

/**
 * Barra de progreso segmentada (disponible/bajo/agotado). Se usa en el
 * Dashboard y, en su fase correspondiente, en Inventario.
 */
export function StockIndicator({
  disponible,
  bajo,
  agotado,
  className,
}: {
  disponible: number;
  bajo: number;
  agotado: number;
  className?: string;
}) {
  const total = Math.max(disponible + bajo + agotado, 1);
  const segmentos = [
    { label: 'Disponible', valor: disponible, clase: 'bg-success' },
    { label: 'Stock bajo', valor: bajo, clase: 'bg-warning' },
    { label: 'Agotado', valor: agotado, clase: 'bg-destructive' },
  ];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
        {segmentos.map((s) => (
          <div
            key={s.label}
            className={cn('h-full transition-all', s.clase)}
            style={{ width: `${(s.valor / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {segmentos.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', s.clase)} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums">
              {s.valor} <span className="text-muted-foreground">· {Math.round((s.valor / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
