'use client';

import { Estrellas } from './Estrellas';

interface Props {
  promedioProducto: number;
  promedioEnvio: number;
}

export function ResenasResumen({ promedioProducto, promedioEnvio }: Props) {
  return (
    <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
      <div className="card" style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 }}>Producto (promedio)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{promedioProducto.toFixed(1)}</span>
          <Estrellas valor={Math.round(promedioProducto)} />
        </div>
      </div>
      <div className="card" style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 }}>Envío (promedio)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{promedioEnvio.toFixed(1)}</span>
          <Estrellas valor={Math.round(promedioEnvio)} />
        </div>
      </div>
    </div>
  );
}