'use client';

import { FILTROS_ESTADO, type EstadoSolicitud } from '../types';

interface Props {
  valor: EstadoSolicitud | '';
  onChange: (valor: EstadoSolicitud | '') => void;
}

export function SolicitudesFilters({ valor, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
      {FILTROS_ESTADO.map((f) => {
        const activo = f.valor === valor;
        return (
          <button
            key={f.etiqueta}
            type="button"
            className={activo ? 'btn' : 'btn-secondary btn'}
            onClick={() => onChange(f.valor)}
          >
            {f.etiqueta}
          </button>
        );
      })}
    </div>
  );
}