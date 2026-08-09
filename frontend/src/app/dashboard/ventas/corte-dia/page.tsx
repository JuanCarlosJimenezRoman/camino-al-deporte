'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Sucursal {
  id: number;
  nombre: string;
}

interface VentaResumen {
  id: number;
  folio: string;
  total: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  cliente: string | null;
  createdAt: string;
  sucursal: { nombre: string };
  usuario: { nombre: string };
  cuentaTransferencia: { nombre: string } | null;
}

interface CorteDia {
  fecha: string;
  sucursalId: number | null;
  totalVentas: number;
  totalGeneral: number;
  porMetodoPago: Record<string, number>;
  porCuentaTransferencia: Record<string, number>;
  canceladas: { cantidad: number; total: number };
  ventas: VentaResumen[];
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CorteDelDiaPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [corte, setCorte] = useState<CorteDia | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (esAdmin) api<Sucursal[]>('/sucursales').then(setSucursales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ fecha });
      if (esAdmin && sucursalId) qs.set('sucursalId', sucursalId);
      const data = await api<CorteDia>(`/ventas/corte-dia?${qs.toString()}`);
      setCorte(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, sucursalId]);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl">Corte del día</h1>
        <Link href="/dashboard/ventas" className="btn-secondary btn">
          Volver a ventas
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>Fecha:</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ maxWidth: 160 }} />
        {esAdmin && (
          <>
            <label style={{ fontSize: 13 }}>Sucursal:</label>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Todas (global)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {cargando && <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>}

      {corte && !cargando && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Ventas del día</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{corte.totalVentas}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Total general</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>${corte.totalGeneral.toFixed(2)}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Efectivo</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>${(corte.porMetodoPago.EFECTIVO || 0).toFixed(2)}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Tarjeta</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>${(corte.porMetodoPago.TARJETA || 0).toFixed(2)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>
              Transferencias — ${(corte.porMetodoPago.TRANSFERENCIA || 0).toFixed(2)}
            </h2>
            {Object.keys(corte.porCuentaTransferencia).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Sin transferencias este día.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Total recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(corte.porCuentaTransferencia).map(([cuenta, monto]) => (
                    <tr key={cuenta}>
                      <td>{cuenta}</td>
                      <td>${monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {corte.canceladas.cantidad > 0 && (
            <p style={{ fontSize: 13, marginBottom: 20, color: 'var(--color-muted)' }}>
              {corte.canceladas.cantidad} venta(s) cancelada(s) este día por ${corte.canceladas.total.toFixed(2)}{' '}
              (no se incluyen en los totales de arriba).
            </p>
          )}

          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Sucursal</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Pago</th>
                <th>Vendedor</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {corte.ventas.map((v) => (
                <tr key={v.id}>
                  <td>{v.folio}</td>
                  <td>{v.sucursal?.nombre}</td>
                  <td>{v.cliente || '—'}</td>
                  <td>${v.total}</td>
                  <td>
                    {v.metodoPago === 'EFECTIVO' ? 'Efectivo' : v.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                    {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                  </td>
                  <td>{v.usuario?.nombre}</td>
                  <td>{new Date(v.createdAt).toLocaleTimeString('es-MX')}</td>
                </tr>
              ))}
              {corte.ventas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                    Sin ventas completadas este día.
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
