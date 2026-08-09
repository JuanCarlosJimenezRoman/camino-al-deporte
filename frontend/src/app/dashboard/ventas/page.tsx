'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  total: string;
  estado: string;
  createdAt: string;
  usuario: { nombre: string };
}

interface Existencia {
  id: number;
  sku: string;
  stockActual: number;
  talla: { valor: string } | null;
  producto: { nombre: string; precioVenta: string };
}

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [cliente, setCliente] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [v, e] = await Promise.all([
      api<Venta[]>('/ventas'),
      api<Existencia[]>('/inventario/existencias'),
    ]);
    setVentas(v);
    setExistencias(e);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function registrarVenta() {
    if (!varianteId) return;
    const variante = existencias.find((e) => String(e.id) === varianteId);
    if (!variante) return;

    try {
      await api('/ventas', {
        method: 'POST',
        body: JSON.stringify({
          cliente: cliente || undefined,
          items: [
            {
              varianteId: Number(varianteId),
              cantidad,
              precioUnitario: Number(variante.producto.precioVenta),
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

        <label style={{ fontSize: 13 }}>Producto / SKU</label>
        <select value={varianteId} onChange={(e) => setVarianteId(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {existencias.map((e) => (
            <option key={e.id} value={e.id}>
              {e.producto.nombre} {e.talla ? `(${e.talla.valor})` : ''} — {e.sku} — stock: {e.stockActual}
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

        <button className="btn" onClick={registrarVenta}>
          Registrar venta
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
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
              <td>{v.cliente || '—'}</td>
              <td>${v.total}</td>
              <td>{v.estado}</td>
              <td>{v.usuario?.nombre}</td>
              <td>{new Date(v.createdAt).toLocaleString('es-MX')}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin ventas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
