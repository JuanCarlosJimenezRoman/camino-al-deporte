'use client';

import { formatearFecha } from '@/lib/utils';
import type { Resena } from '../types';
import { etiquetaBotonVisibilidad, nombreCliente, nombresProductos } from '../utils';
import { Estrellas } from './Estrellas';

interface Props {
  resena: Resena;
  onAlternarVisibilidad: (resena: Resena) => void;
  onAbrirFoto: (url: string) => void;
}

export function ResenaCard({ resena: r, onAlternarVisibilidad, onAbrirFoto }: Props) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          {r.pedido.folio && (
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>
              Pedido {r.pedido.folio}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {nombreCliente(r.pedido)} · {nombresProductos(r.pedido)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {formatearFecha(r.createdAt)}
          </span>
          <button className="btn-secondary btn" onClick={() => onAlternarVisibilidad(r)}>
            {etiquetaBotonVisibilidad(r.visible)}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 10, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, color: 'var(--color-muted)', marginRight: 6 }}>Producto</span>
          <Estrellas valor={r.calificacionProducto} />
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--color-muted)', marginRight: 6 }}>Envío</span>
          <Estrellas valor={r.calificacionEnvio} />
        </div>
      </div>

      {r.comentario && <p style={{ fontSize: 14, marginBottom: 8 }}>{r.comentario}</p>}

      {r.fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {r.fotos.map((f) => (
            <img
              key={f.id}
              src={f.url}
              alt="Foto del paquete recibido"
              onClick={() => onAbrirFoto(f.url)}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}