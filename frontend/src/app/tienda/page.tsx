'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiTienda } from '@/lib/apiTienda';

interface ProductoTienda {
  id: number;
  nombre: string;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  stockTotal: number;
}

export default function TiendaCatalogoPage() {
  const [productos, setProductos] = useState<ProductoTienda[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function cargar(busqueda?: string) {
    try {
      const query = busqueda ? `?q=${encodeURIComponent(busqueda)}` : '';
      const data = await apiTienda<ProductoTienda[]>(`/tienda/productos${query}`);
      setProductos(data);
    } catch {
      setError('No se pudo cargar el catálogo. Intenta de nuevo en un momento.');
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <h1 style={{ fontSize: 24 }}>Catálogo</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            cargar(q);
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input placeholder="Buscar producto..." value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <button type="submit" className="btn-secondary btn">
            Buscar
          </button>
        </form>
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {productos === null && !error && <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>}

      {productos && productos.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>No hay productos disponibles por ahora.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {productos?.map((p) => (
          <Link
            key={p.id}
            href={`/tienda/productos/${p.id}`}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 8,
                background: 'var(--color-border)',
                marginBottom: 10,
                overflow: 'hidden',
              }}
            >
              {p.imagenes?.[0]?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagenes[0].url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.marca?.nombre}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.nombre}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>${p.precioVenta}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
