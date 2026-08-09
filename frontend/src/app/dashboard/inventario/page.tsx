'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Existencia {
  id: number;
  sku: string;
  color: string | null;
  stockActual: number;
  stockMinimo: number;
  talla: { valor: string } | null;
  producto: { nombre: string; marca: { nombre: string } };
}

export default function InventarioPage() {
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const data = await api<Existencia[]>(
      `/inventario/existencias${busqueda ? `?skuOProducto=${encodeURIComponent(busqueda)}` : ''}`
    );
    setExistencias(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function registrarMovimiento(varianteId: number, tipo: 'ENTRADA' | 'SALIDA') {
    const cantidadStr = window.prompt(`Cantidad a registrar (${tipo.toLowerCase()}):`, '1');
    if (!cantidadStr) return;
    const cantidad = Number(cantidadStr);
    if (!cantidad || cantidad <= 0) return;

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({ varianteId, tipo, cantidad }),
      });
      setMensaje('Movimiento registrado.');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el movimiento.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Inventario / Existencias</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Buscar por SKU o producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
        />
        <button className="btn" onClick={cargar}>
          Buscar
        </button>
      </div>

      {mensaje && <p style={{ marginBottom: 12, fontSize: 13 }}>{mensaje}</p>}

      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Talla</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {existencias.map((e) => (
            <tr key={e.id}>
              <td>{e.sku}</td>
              <td>{e.producto?.nombre}</td>
              <td>{e.producto?.marca?.nombre}</td>
              <td>{e.talla?.valor ?? '—'}</td>
              <td className={e.stockActual <= e.stockMinimo ? 'stock-bajo' : ''}>
                {e.stockActual}
              </td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.id, 'ENTRADA')}>
                  + Entrada
                </button>
                <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.id, 'SALIDA')}>
                  − Salida
                </button>
              </td>
            </tr>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
