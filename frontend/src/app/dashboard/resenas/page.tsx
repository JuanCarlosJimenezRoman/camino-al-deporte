'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Resena {
  id: number;
  calificacionProducto: number;
  calificacionEnvio: number;
  comentario: string | null;
  createdAt: string;
  visible: boolean;
  fotos: { id: number; url: string }[];
  pedido: {
    id: number;
    folio: string;
    cliente: { nombre: string } | null;
    items: { variante: { producto: { nombre: string } } }[];
  };
}

function Estrellas({ valor }: { valor: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= valor ? 'var(--color-warning, #d97706)' : 'none'}
          color={n <= valor ? 'var(--color-warning, #d97706)' : 'var(--color-border)'}
        />
      ))}
    </span>
  );
}

export default function ResenasPage() {
  const [resenas, setResenas] = useState<Resena[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);

  useEffect(() => {
    api<Resena[]>('/resenas')
      .then(setResenas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las reseñas.'));
  }, []);

  async function alternarVisibilidad(r: Resena) {
    try {
      await api(`/resenas/${r.id}/visibilidad`, { method: 'PUT', body: JSON.stringify({ visible: !r.visible }) });
      setResenas((prev) => prev && prev.map((x) => (x.id === r.id ? { ...x, visible: !r.visible } : x)));
    } catch {
      // sin acción especial: si falla, el estado local no cambia y el botón sigue reflejando lo real
    }
  }

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;

  const promedioProducto = resenas?.length
    ? resenas.reduce((acc, r) => acc + r.calificacionProducto, 0) / resenas.length
    : 0;
  const promedioEnvio = resenas?.length ? resenas.reduce((acc, r) => acc + r.calificacionEnvio, 0) / resenas.length : 0;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reseñas de clientes</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Calificaciones y fotos que los clientes dejan después de recibir su pedido en la tienda en línea. Por
        default se muestran como testimonio en la tienda (con solo el primer nombre del cliente, sin teléfono);
        puedes ocultar cualquiera puntual sin borrarla.
      </p>

      {resenas === null && !error && <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>}

      {resenas && resenas.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>Todavía no hay reseñas de clientes.</p>
      )}

      {resenas && resenas.length > 0 && (
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
          <div className="card" style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 }}>Total de reseñas</div>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{resenas.length}</span>
          </div>
        </div>
      )}

      {resenas?.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 12, opacity: r.visible ? 1 : 0.6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Link href={`/dashboard/pedidos-online/${r.pedido.id}`} style={{ fontWeight: 600 }}>
                {r.pedido.folio}
              </Link>
              {!r.visible && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--color-border)',
                    color: 'var(--color-muted)',
                  }}
                >
                  Oculta
                </span>
              )}
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {r.pedido.cliente?.nombre || 'Cliente'} ·{' '}
                {r.pedido.items.map((it) => it.variante.producto.nombre).join(', ')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {new Date(r.createdAt).toLocaleDateString('es-MX')}
              </span>
              <button className="btn-secondary btn" onClick={() => alternarVisibilidad(r)}>
                {r.visible ? 'Ocultar de la tienda' : 'Publicar en la tienda'}
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
                  onClick={() => setFotoAbierta(f.url)}
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {fotoAbierta && (
        <div
          onClick={() => setFotoAbierta(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            cursor: 'pointer',
          }}
        >
          <img src={fotoAbierta} alt="Foto del paquete recibido" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
