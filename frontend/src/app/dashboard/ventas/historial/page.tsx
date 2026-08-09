'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
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
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
  cuentaTransferencia: { nombre: string } | null;
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
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl">Historial de ventas</h1>
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
                <th>Folio</th>
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
              {historial.ventas.map((v) => (
                <tr key={v.id}>
                  <td>{v.folio}</td>
                  <td>{v.sucursal?.nombre}</td>
                  <td>{v.cliente || '—'}</td>
                  <td>${v.total}</td>
                  <td>
                    {v.metodoPago === 'EFECTIVO' ? 'Efectivo' : v.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                    {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                  </td>
                  <td>
                    <Badge variant={ESTADO_VARIANT[v.estado] || 'secondary'}>{v.estado}</Badge>
                  </td>
                  <td>{v.usuario?.nombre}</td>
                  <td>{new Date(v.createdAt).toLocaleString('es-MX')}</td>
                </tr>
              ))}
              {historial.ventas.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--color-muted)' }}>
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
