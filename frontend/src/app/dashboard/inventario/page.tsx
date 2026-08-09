'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Existencia {
  id: number;
  sucursalId: number;
  stockActual: number;
  stockMinimo: number;
  sucursal: { id: number; nombre: string };
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; marca: { nombre: string } };
  };
}

export default function InventarioPage() {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<string>('');
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    if (!sucursalId) return;
    const qs = new URLSearchParams({ sucursalId });
    if (busqueda) qs.set('skuOProducto', busqueda);
    const data = await api<Existencia[]>(`/inventario/existencias?${qs.toString()}`);
    setExistencias(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  async function registrarMovimiento(varianteId: number, tipo: 'ENTRADA' | 'SALIDA') {
    const cantidadStr = window.prompt(`Cantidad a registrar (${tipo.toLowerCase()}):`, '1');
    if (!cantidadStr) return;
    const cantidad = Number(cantidadStr);
    if (!cantidad || cantidad <= 0) return;

    try {
      await api('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({ sucursalId: Number(sucursalId), varianteId, tipo, cantidad }),
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 220 }}>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <input
          placeholder="Buscar por SKU o producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          style={{ maxWidth: 260 }}
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
              <td>{e.variante.sku}</td>
              <td>{e.variante.producto?.nombre}</td>
              <td>{e.variante.producto?.marca?.nombre}</td>
              <td>{e.variante.talla?.valor ?? '—'}</td>
              <td className={e.stockActual <= e.stockMinimo ? 'stock-bajo' : ''}>{e.stockActual}</td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.variante.id, 'ENTRADA')}>
                  + Entrada
                </button>
                <button className="btn-secondary btn" onClick={() => registrarMovimiento(e.variante.id, 'SALIDA')}>
                  − Salida
                </button>
              </td>
            </tr>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas en esta sucursal.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
