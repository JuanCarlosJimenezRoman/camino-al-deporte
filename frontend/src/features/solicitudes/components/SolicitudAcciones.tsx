'use client';

import type { Solicitud } from '../types';

interface Props {
  solicitud: Solicitud;
  nota: string;
  procesando: boolean;
  onNotaChange: (nota: string) => void;
  onAprobar: () => void;
  onRechazar: () => void;
}

export function SolicitudAcciones({
  solicitud,
  nota,
  procesando,
  onNotaChange,
  onAprobar,
  onRechazar,
}: Props) {
  if (solicitud.estado !== 'PENDIENTE') {
    return <>—</>;
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn" disabled={procesando} onClick={onAprobar}>
        Aprobar
      </button>
      <input
        placeholder="Motivo (si rechazas)"
        value={nota}
        onChange={(e) => onNotaChange(e.target.value)}
        style={{ maxWidth: 160 }}
      />
      <button className="btn-secondary btn" disabled={procesando} onClick={onRechazar}>
        Rechazar
      </button>
    </div>
  );
}