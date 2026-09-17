// Tooltip reutilizable para las gráficas de reportes que muestran montos.
// Componente de vista puro: solo formatea y pinta.

'use client';

import type { TooltipProps } from 'recharts';
import { money } from '../utils';

export function TooltipMoneda({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-card text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{money(Number(p.value) || 0)}</span>
        </div>
      ))}
    </div>
  );
}
