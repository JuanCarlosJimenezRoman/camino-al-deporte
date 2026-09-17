// Barra de filtros del dashboard de reportes: presets de rango, fechas
// personalizadas y (para admin) selector de sucursal.
// Vista pura: emite cambios por callbacks, no llama al API.

'use client';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { PresetRango, Sucursal } from '../types';

const PRESETS: [PresetRango, string][] = [
  ['hoy', 'Hoy'],
  ['7d', '7 días'],
  ['30d', '30 días'],
  ['mes', 'Este mes'],
  ['mesPasado', 'Mes pasado'],
];

interface Props {
  preset: PresetRango;
  desde: string;
  hasta: string;
  sucursalId: string;
  sucursales: Sucursal[];
  esAdmin: boolean;
  onPreset: (p: PresetRango) => void;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  onSucursal: (v: string) => void;
}

export function SelectorPeriodo({
  preset,
  desde,
  hasta,
  sucursalId,
  sucursales,
  esAdmin,
  onPreset,
  onDesde,
  onHasta,
  onSucursal,
}: Props) {
  return (
    <div className="p-4 flex flex-wrap items-center gap-2">
      {PRESETS.map(([valor, etiqueta]) => (
        <Button key={valor} size="sm" variant={preset === valor ? 'default' : 'outline'} onClick={() => onPreset(valor)}>
          {etiqueta}
        </Button>
      ))}
      <div className="flex items-center gap-1.5 ml-1">
        <Input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} className="w-[150px]" />
        <span className="text-xs text-muted-foreground">a</span>
        <Input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} className="w-[150px]" />
      </div>
      {esAdmin && (
        <div className="w-48">
          <Select value={sucursalId} onChange={(e) => onSucursal(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
