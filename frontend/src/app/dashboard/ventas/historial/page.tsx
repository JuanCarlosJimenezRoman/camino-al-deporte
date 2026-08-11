'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

interface Sucursal {
  id: number;
  nombre: string;
}

interface VentaItem {
  variante: {
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
}

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  total: string;
  estado: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
  cuentaTransferencia: { nombre: string } | null;
  items: VentaItem[];
}

interface Historial {
  ventas: Venta[];
  resumen: {
    totalGeneral: number;
    porSucursal: Record<string, { cantidad: number; total: number }>;
  };
}

export default function HistorialVentasPage() {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [cargando, setCargando] = useState(false);

  const puedeVerHistorial = puedeVer('historialVentas', usuario?.rol);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (sucursalId) qs.set('sucursalId', sucursalId);
      if (fechaInicio) qs.set('fechaInicio', fechaInicio);
      if (fechaFin) qs.set('fechaFin', fechaFin);
      const data = await api<Historial>(`/ventas/historial?${qs.toString()}`);
      setHistorial(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (puedeVerHistorial) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerHistorial]);

  if (!puedeVerHistorial) {
    return <p style={{ fontSize: 14 }}>No tienes permiso para ver esta sección.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Historial de ventas</h1>
        <Link href="/dashboard/ventas" className="btn-secondary btn">
          Volver a ventas
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>Sucursal:</label>
        <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas (global)</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13 }}>Desde:</label>
        <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ maxWidth: 160 }} />
        <label style={{ fontSize: 13 }}>Hasta:</label>
        <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ maxWidth: 160 }} />
        <button className="btn" onClick={cargar}>
          Filtrar
        </button>
      </div>

      {cargando && <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>}

      {historial && !cargando && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>
              Total del periodo: ${historial.resumen.totalGeneral.toFixed(2)}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Sucursal</th>
                  <th>Ventas</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(historial.resumen.porSucursal).map(([nombre, r]) => (
                  <tr key={nombre}>
                    <td>{nombre}</td>
                    <td>{r.cantidad}</td>
                    <td>${r.total.toFixed(2)}</td>
                  </tr>
                ))}
                {Object.keys(historial.resumen.porSucursal).length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--color-muted)' }}>
                      Sin ventas en el periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <table>
            <thead>
              <tr>
                <th></th>
                <th>Folio</th>
                <th>Producto</th>
                <th>Sucursal</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Vendedor</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {historial.ventas.map((v) => {
                const primerItem = v.items?.[0];
                return (
                  <tr key={v.id}>
                    <td>
                      <ProductoThumb
                        url={imagenPrincipal(primerItem?.variante.producto, primerItem?.variante.color)}
                        alt={primerItem?.variante.producto.nombre || ''}
                      />
                    </td>
                    <td>{v.folio}</td>
                    <td>
                      {primerItem
                        ? `${primerItem.variante.producto.nombre}${primerItem.variante.talla ? ` (${primerItem.variante.talla.valor})` : ''}`
                        : '—'}
                      {v.items && v.items.length > 1 ? ` +${v.items.length - 1}` : ''}
                    </td>
                    <td>{v.sucursal?.nombre}</td>
                    <td>{v.cliente || '—'}</td>
                    <td>${v.total}</td>
                    <td>
                      {v.metodoPago === 'EFECTIVO' ? 'Efectivo' : v.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                      {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                    </td>
                    <td>{v.estado}</td>
                    <td>{v.usuario?.nombre}</td>
                    <td>{new Date(v.createdAt).toLocaleString('es-MX')}</td>
                  </tr>
                );
              })}
              {historial.ventas.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--color-muted)' }}>
                    Sin ventas en el periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
