'use client';

import type { Sucursal } from '../types';

interface Props {
  sucursales: Sucursal[];
  seleccionada: number | null;
  onSeleccionar: (id: number) => void;
}

export function SucursalesTabs({ sucursales, seleccionada, onSeleccionar }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {sucursales.map((s) => (
        <button
          key={s.id}
          className={s.id === seleccionada ? 'btn' : 'btn-secondary btn'}
          onClick={() => onSeleccionar(s.id)}
        >
          {s.nombre}
          {s.esBodegaCentral ? ' ⭐' : ''}
        </button>
      ))}
    </div>
  );
}
