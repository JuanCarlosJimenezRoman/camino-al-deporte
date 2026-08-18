'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ShoppingCart,
  Undo2,
  ArrowRightLeft,
  CalendarClock,
  Globe,
  History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ActivityFeed, ActivityItem } from '@/components/ui/activity-feed';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

type TipoMovimiento =
  | 'ENTRADA'
  | 'SALIDA'
  | 'AJUSTE'
  | 'VENTA'
  | 'DEVOLUCION'
  | 'TRANSFERENCIA_SALIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'APARTADO'
  | 'PEDIDO_ONLINE';

interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string | null;
  createdAt: string;
  usuario: { nombre: string; email: string } | null;
  sucursal: { nombre: string };
  proveedor: { nombre: string } | null;
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string };
  };
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
  APARTADO: 'Apartado',
  PEDIDO_ONLINE: 'Pedido en línea',
};

// Ícono + tono por tipo de movimiento — para que el timeline se lea de un
// vistazo (verde = entra stock, rojo/gris = sale, neutral = solo se movió de
// lugar). Coincide con el criterio ya usado en Movimientos del detalle de
// producto (verde/rojo/gris para ENTRADA/SALIDA/AJUSTE).
const TIPO_VISUAL: Record<TipoMovimiento, { icon: ActivityItem['icon']; tone: NonNullable<ActivityItem['tone']> }> = {
  ENTRADA: { icon: TrendingUp, tone: 'success' },
  SALIDA: { icon: TrendingDown, tone: 'destructive' },
  AJUSTE: { icon: RefreshCw, tone: 'neutral' },
  VENTA: { icon: ShoppingCart, tone: 'destructive' },
  DEVOLUCION: { icon: Undo2, tone: 'success' },
  TRANSFERENCIA_SALIDA: { icon: ArrowRightLeft, tone: 'warning' },
  TRANSFERENCIA_ENTRADA: { icon: ArrowRightLeft, tone: 'success' },
  APARTADO: { icon: CalendarClock, tone: 'warning' },
  PEDIDO_ONLINE: { icon: Globe, tone: 'destructive' },
};

function formatearFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HistorialInventarioPage() {
  const { usuario } = useAuth();
  const puedeVerHistorial = puedeVer('inventarioHistorial', usuario?.rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [tipo, setTipo] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (sucursalId) qs.set('sucursalId', sucursalId);
      if (tipo) qs.set('tipo', tipo);
      if (proveedorId) qs.set('proveedorId', proveedorId);
      if (fechaInicio) qs.set('fechaInicio', fechaInicio);
      if (fechaFin) qs.set('fechaFin', fechaFin);
      if (busqueda) qs.set('skuOProducto', busqueda);
      const data = await api<Movimiento[]>(`/inventario/movimientos?${qs.toString()}`);
      setMovimientos(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (puedeVerHistorial) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerHistorial]);

  const hayFiltrosActivos = Boolean(sucursalId || tipo || proveedorId || fechaInicio || fechaFin || busqueda);

  function limpiarFiltros() {
    setSucursalId('');
    setTipo('');
    setProveedorId('');
    setFechaInicio('');
    setFechaFin('');
    setBusqueda('');
  }

  if (!puedeVerHistorial) {
    return <EmptyState icon={History} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historial de inventario"
        subtitle="Registro completo de entradas, salidas y ajustes de stock, con fecha y quién los hizo."
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Inventario', href: '/dashboard/inventario' },
          { label: 'Historial' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {(Object.keys(TIPO_LABEL) as TipoMovimiento[]).map((t) => (
              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Input
            placeholder="Buscar por SKU o producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargar()}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Desde</span>
        <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-40" />
        <span className="text-xs text-muted-foreground">Hasta</span>
        <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-40" />
        <Button size="sm" onClick={cargar}>Filtrar</Button>
        {hayFiltrosActivos && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {cargando ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : movimientos.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description={hayFiltrosActivos ? 'No hay movimientos que coincidan con estos filtros.' : 'Todavía no hay movimientos registrados en este periodo.'}
        />
      ) : (
        <ActivityFeed
          items={movimientos.map((m): ActivityItem => {
            const visual = TIPO_VISUAL[m.tipo] ?? { icon: RefreshCw, tone: 'neutral' as const };
            const producto = `${m.variante?.producto?.nombre ?? ''}${m.variante?.talla ? ` (${m.variante.talla.valor})` : ''}${m.variante?.color ? ` · ${m.variante.color}` : ''}`;
            return {
              id: String(m.id),
              icon: visual.icon,
              tone: visual.tone,
              title: `${TIPO_LABEL[m.tipo] ?? m.tipo} de ${Math.abs(m.cantidad)} · ${producto || m.variante?.sku}`,
              detail: [m.sucursal?.nombre, m.proveedor?.nombre, m.usuario?.nombre, m.motivo].filter(Boolean).join(' · ') || undefined,
              timestamp: formatearFechaHora(m.createdAt),
            };
          })}
        />
      )}
    </div>
  );
}
