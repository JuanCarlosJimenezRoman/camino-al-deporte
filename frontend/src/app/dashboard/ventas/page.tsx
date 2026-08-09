'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

const ESTADO_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> = {
  COMPLETADA: 'success',
  CANCELADA: 'destructive',
};

interface Sucursal {
  id: number;
  nombre: string;
}

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  total: string;
  estado: string;
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
}

interface Existencia {
  id: number;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    talla: { valor: string } | null;
    producto: { nombre: string; precioVenta: string };
  };
}

export default function VentasPage() {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [cliente, setCliente] = useState('');
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
    const v = await api<Venta[]>('/ventas');
    setVentas(v);
    if (sucursalId) {
      const e = await api<Existencia[]>(`/inventario/existencias?sucursalId=${sucursalId}`);
      setExistencias(e);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  async function registrarVenta() {
    if (!varianteId || !sucursalId) return;
    const existencia = existencias.find((e) => String(e.variante.id) === varianteId);
    if (!existencia) return;

    try {
      await api('/ventas', {
        method: 'POST',
        body: JSON.stringify({
          sucursalId: Number(sucursalId),
          cliente: cliente || undefined,
          items: [
            {
              varianteId: Number(varianteId),
              cantidad,
              precioUnitario: Number(existencia.variante.producto.precioVenta),
            },
          ],
        }),
      });
      setMensaje('Venta registrada.');
      setCliente('');
      setCantidad(1);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar la venta.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Ventas</h1>

      <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Registrar venta rápida</h2>

        <label style={{ fontSize: 13 }}>Sucursal</label>
        <select
          value={sucursalId}
          onChange={(e) => {
            setSucursalId(e.target.value);
            setVarianteId('');
          }}
          style={{ marginBottom: 10 }}
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 13 }}>Producto / SKU</label>
        <select value={varianteId} onChange={(e) => setVarianteId(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {existencias.map((e) => (
            <option key={e.id} value={e.variante.id}>
              {e.variante.producto.nombre} {e.variante.talla ? `(${e.variante.talla.valor})` : ''} —{' '}
              {e.variante.sku} — stock: {e.stockActual}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 13 }}>Cantidad</label>
        <div style={{ marginBottom: 10 }}>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
          />
        </div>

        <label style={{ fontSize: 13 }}>Cliente (opcional)</label>
        <div style={{ marginBottom: 12 }}>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
        </div>

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

        <button className="btn" onClick={registrarVenta} disabled={!varianteId}>
          Registrar venta
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Sucursal</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Vendedor</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td>{v.folio}</td>
              <td>{v.sucursal?.nombre}</td>
              <td>{v.cliente || '—'}</td>
              <td>${v.total}</td>
              <td>
                <Badge variant={ESTADO_VARIANT[v.estado] || 'secondary'}>{v.estado}</Badge>
              </td>
              <td>{v.usuario?.nombre}</td>
              <td>{new Date(v.createdAt).toLocaleString('es-MX')}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                Sin ventas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
