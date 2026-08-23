'use client';

import { useEffect, useState } from 'react';
import { Receipt, DollarSign, Banknote, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import { formatearHora } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';

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

function etiquetaMetodoPago(v: VentaResumen['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
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
    <div className="space-y-5">
      <PageHeader
        title="Corte del día"
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/dashboard/ventas' },
          { label: 'Corte del día' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Fecha</span>
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" />
        {esAdmin && (
          <div className="w-48">
            <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Todas (global)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {cargando ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : corte ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard title="Ventas del día" value={String(corte.totalVentas)} icon={Receipt} />
            <MetricCard title="Total general" value={`$${corte.totalGeneral.toFixed(2)}`} icon={DollarSign} />
            <MetricCard title="Efectivo" value={`$${(corte.porMetodoPago.EFECTIVO || 0).toFixed(2)}`} icon={Banknote} />
            <MetricCard title="Tarjeta" value={`$${(corte.porMetodoPago.TARJETA || 0).toFixed(2)}`} icon={CreditCard} />
          </div>

          <div className="card">
            <h2 className="text-base font-semibold mb-3">
              Transferencias — ${(corte.porMetodoPago.TRANSFERENCIA || 0).toFixed(2)}
            </h2>
            {Object.keys(corte.porCuentaTransferencia).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin transferencias este día.</p>
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
                      <td className="tabular-nums font-medium">${monto.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {corte.canceladas.cantidad > 0 && (
            <p className="text-sm text-muted-foreground">
              {corte.canceladas.cantidad} venta(s) cancelada(s) este día por ${corte.canceladas.total.toFixed(2)} (no se incluyen en los totales de arriba).
            </p>
          )}

          {corte.ventas.length === 0 ? (
            <EmptyState icon={Receipt} title="Sin ventas completadas este día" />
          ) : (
            <div className="overflow-x-auto">
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
                    <td className="font-medium">{v.folio}</td>
                    <td>{v.sucursal?.nombre}</td>
                    <td>{v.cliente || '—'}</td>
                    <td className="tabular-nums font-medium">${v.total}</td>
                    <td className="text-xs">
                      {etiquetaMetodoPago(v.metodoPago)}
                      {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                    </td>
                    <td>{v.usuario?.nombre}</td>
                    <td className="text-xs text-muted-foreground">{formatearHora(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
