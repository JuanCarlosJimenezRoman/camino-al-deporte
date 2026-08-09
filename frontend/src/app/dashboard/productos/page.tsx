'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Variante {
  id: number;
  sku: string;
  color: string | null;
  stockActual: number;
  talla: { valor: string } | null;
}

interface Producto {
  id: number;
  nombre: string;
  precioVenta: string;
  marca: { nombre: string };
  categoria: { nombre: string };
  variantes: Variante[];
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const data = await api<Producto[]>(`/productos${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`);
    setProductos(data);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Productos</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <button className="btn" onClick={cargar}>
          Buscar
        </button>
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Marca</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Variantes (talla / SKU / stock)</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.marca?.nombre}</td>
                <td>{p.categoria?.nombre}</td>
                <td>${p.precioVenta}</td>
                <td>
                  {p.variantes.map((v) => (
                    <div key={v.id} style={{ fontSize: 12 }}>
                      {v.talla?.valor ?? '—'} · {v.sku} · stock: {v.stockActual}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--color-muted)' }}>
                  Sin productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
