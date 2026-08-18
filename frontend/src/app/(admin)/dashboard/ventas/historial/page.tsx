'use client';

import { useEffect, useState } from 'react';
import { DollarSign, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { MetricCard } from '@/components/ui/metric-card';

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

const ESTADO_TONO: Record<string, 'success' | 'destructive' | 'neutral'> = {
  COMPLETADA: 'success',
  CANCELADA: 'destructive',
};

function etiquetaMetodoPago(v: Venta['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
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
    return <EmptyState icon={History} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historial de ventas"
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/dashboard/ventas' },
          { label: 'Historial' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-48">
          <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Todas (global)</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">Desde</span>
        <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-40" />
        <span className="text-xs text-muted-foreground">Hasta</span>
        <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-40" />
        <Button size="sm" onClick={cargar}>Filtrar</Button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : historial ? (
        <>
          <MetricCard title="Total del periodo" value={`$${historial.resumen.totalGeneral.toFixed(2)}`} icon={DollarSign} />

          {Object.keys(historial.resumen.porSucursal).length > 0 && (
            <div className="overflow-x-auto">
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
                    <td className="font-medium">{nombre}</td>
                    <td className="tabular-nums">{r.cantidad}</td>
                    <td className="tabular-nums font-medium">${r.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {historial.ventas.length === 0 ? (
            <EmptyState icon={History} title="Sin ventas en el periodo" description="Ajusta los filtros de fecha o sucursal para ver resultados." />
          ) : (
            <div className="overflow-x-auto">
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
                        <ProductoThumb url={imagenPrincipal(primerItem?.variante.producto, primerItem?.variante.color)} alt={primerItem?.variante.producto.nombre || ''} />
                      </td>
                      <td className="font-medium">{v.folio}</td>
                      <td>
                        {primerItem
                          ? `${primerItem.variante.producto.nombre}${primerItem.variante.talla ? ` (${primerItem.variante.talla.valor})` : ''}`
                          : '—'}
                        {v.items && v.items.length > 1 ? ` +${v.items.length - 1}` : ''}
                      </td>
                      <td>{v.sucursal?.nombre}</td>
                      <td>{v.cliente || '—'}</td>
                      <td className="font-medium tabular-nums">${v.total}</td>
                      <td className="text-xs">
                        {etiquetaMetodoPago(v.metodoPago)}
                        {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                      </td>
                      <td>
                        <StatusBadge tono={ESTADO_TONO[v.estado] ?? 'neutral'}>{v.estado}</StatusBadge>
                      </td>
                      <td>{v.usuario?.nombre}</td>
                      <td className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString('es-MX')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
