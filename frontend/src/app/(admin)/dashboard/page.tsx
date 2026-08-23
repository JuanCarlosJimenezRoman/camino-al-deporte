'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Package,
  ShoppingCart,
  CalendarClock,
  ArrowLeftRight,
  ArrowRight,
  Warehouse,
  Bell,
  TrendingUp,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis } from 'recharts';
import { api } from '@/lib/api';
import { formatearFecha } from '@/lib/utils';
import { useAuth, puedeVer } from '@/lib/auth';
import { useBranch } from '@/lib/branchContext';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { StockIndicator } from '@/components/ui/stock-indicator';
import { ActivityFeed, ActivityItem } from '@/components/ui/activity-feed';

type Periodo = 'hoy' | '7d' | '30d';

const OPCIONES_PERIODO: { value: Periodo; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
];

const MS_DIA = 24 * 60 * 60 * 1000;

// --- Tipos mínimos de lo que consume esta pantalla (mismos endpoints que ya
// usaban productos/ventas/apartados/inventario) ---------------------------

interface ProductoResumen {
  nombre: string;
  imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
}

interface VentaItemResumen {
  cantidad: number;
  subtotal: string;
  variante: { producto: ProductoResumen };
}

interface VentaResumen {
  id: number;
  folio: string;
  total: string;
  estado: string;
  createdAt: string;
  items: VentaItemResumen[];
}

interface ApartadoResumen {
  id: number;
  folio: string;
  cliente: { nombre: string } | null;
  total: string;
  saldoPendiente: number;
  fechaLimite: string | null;
  createdAt: string;
}

interface BajoStockResumen {
  stockActual: number;
  stockMinimo: number;
  variante: { producto: ProductoResumen; talla: { valor: string } | null };
}

interface ExistenciaResumen {
  stockActual: number;
  stockMinimo: number;
  variante: { id: number };
}

interface NotificacionResumen {
  id: number;
  titulo: string;
  mensaje: string;
  createdAt: string;
}

// --- Helpers de fecha/periodo, todo calculado en el cliente a partir de lo
// que ya traen los endpoints existentes (no se agrega nada al backend) ----

function inicioDeDia(d: Date) {
  const copia = new Date(d);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function calcularVentana(periodo: Periodo) {
  const hoy0 = inicioDeDia(new Date());
  if (periodo === 'hoy') {
    return {
      desde: hoy0,
      hasta: new Date(hoy0.getTime() + MS_DIA),
      anteriorDesde: new Date(hoy0.getTime() - MS_DIA),
      anteriorHasta: hoy0,
    };
  }
  const dias = periodo === '7d' ? 7 : 30;
  const desde = new Date(hoy0.getTime() - (dias - 1) * MS_DIA);
  const hasta = new Date(hoy0.getTime() + MS_DIA);
  return {
    desde,
    hasta,
    anteriorDesde: new Date(desde.getTime() - dias * MS_DIA),
    anteriorHasta: desde,
  };
}

function calcularDelta(actual: number, anterior: number): number | undefined {
  if (anterior === 0) return actual === 0 ? undefined : 100;
  return ((actual - anterior) / anterior) * 100;
}

function agruparParaGrafica(ventas: VentaResumen[], periodo: Periodo, desde: Date) {
  if (periodo === 'hoy') {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, total: 0 }));
    ventas.forEach((v) => {
      const d = new Date(v.createdAt);
      buckets[d.getHours()].total += Number(v.total);
    });
    return buckets;
  }
  const dias = periodo === '7d' ? 7 : 30;
  const buckets = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde.getTime() + i * MS_DIA);
    return { key: d.toDateString(), label: formatearFecha(d, { day: '2-digit', month: 'short' }), total: 0 };
  });
  ventas.forEach((v) => {
    const clave = new Date(v.createdAt).toDateString();
    const bucket = buckets.find((b) => b.key === clave);
    if (bucket) bucket.total += Number(v.total);
  });
  return buckets;
}

function calcularTopProductos(ventas: VentaResumen[]) {
  const mapa = new Map<string, { nombre: string; imagen: string | null; cantidad: number; ingresos: number }>();
  ventas.forEach((v) =>
    v.items.forEach((it) => {
      const nombre = it.variante.producto.nombre;
      const actual = mapa.get(nombre) ?? {
        nombre,
        imagen: imagenPrincipal(it.variante.producto),
        cantidad: 0,
        ingresos: 0,
      };
      actual.cantidad += it.cantidad;
      actual.ingresos += Number(it.subtotal);
      mapa.set(nombre, actual);
    })
  );
  return Array.from(mapa.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 3);
}

function formatoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

function construirActividad(ventas: VentaResumen[], apartados: ApartadoResumen[], notificaciones: NotificacionResumen[]) {
  const eventos: (ActivityItem & { fechaOrden: number })[] = [];

  ventas.slice(0, 8).forEach((v) => {
    const primerItem = v.items[0]?.variante.producto.nombre;
    eventos.push({
      id: `venta-${v.id}`,
      icon: ShoppingCart,
      tone: 'primary',
      title: `Venta ${v.folio}`,
      detail: `${primerItem ?? 'Producto'}${v.items.length > 1 ? ` y ${v.items.length - 1} más` : ''} · $${Number(
        v.total
      ).toLocaleString('es-MX')}`,
      timestamp: formatoRelativo(v.createdAt),
      fechaOrden: new Date(v.createdAt).getTime(),
    });
  });

  apartados.slice(0, 8).forEach((a) => {
    eventos.push({
      id: `apartado-${a.id}`,
      icon: CalendarClock,
      tone: 'warning',
      title: 'Nuevo apartado',
      detail: `${a.cliente?.nombre ?? 'Cliente'} · $${Number(a.total).toLocaleString('es-MX')}`,
      timestamp: formatoRelativo(a.createdAt),
      fechaOrden: new Date(a.createdAt).getTime(),
    });
  });

  notificaciones.slice(0, 8).forEach((n) => {
    eventos.push({
      id: `notif-${n.id}`,
      icon: Bell,
      tone: 'neutral',
      title: n.titulo,
      detail: n.mensaje,
      timestamp: formatoRelativo(n.createdAt),
      fechaOrden: new Date(n.createdAt).getTime(),
    });
  });

  return eventos.sort((a, b) => b.fechaOrden - a.fechaOrden).slice(0, 6);
}

// ---------------------------------------------------------------------------

export default function DashboardHome() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const { sucursales, sucursalId: sucursalTopbar, puedeVerTodas } = useBranch();

  const [periodo, setPeriodo] = useState<Periodo>('7d');
  const [ventas, setVentas] = useState<VentaResumen[] | null>(null);
  const [apartados, setApartados] = useState<ApartadoResumen[] | null>(null);
  const [productosTotal, setProductosTotal] = useState<number | null>(null);
  const [bajoStock, setBajoStock] = useState<BajoStockResumen[] | null>(null);
  const [existencias, setExistencias] = useState<ExistenciaResumen[] | null>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionResumen[]>([]);

  useEffect(() => {
    let activo = true;
    if (puedeVer('productos', rol)) {
      api<{ total: number }>('/productos?limit=1')
        .then((r) => activo && setProductosTotal(r.total))
        .catch(() => activo && setProductosTotal(0));
    }
    if (puedeVer('ventas', rol)) {
      api<VentaResumen[]>('/ventas')
        .then((r) => activo && setVentas(r))
        .catch(() => activo && setVentas([]));
    }
    if (puedeVer('apartados', rol)) {
      api<ApartadoResumen[]>('/apartados?estado=ACTIVO')
        .then((r) => activo && setApartados(r))
        .catch(() => activo && setApartados([]));
    }
    if (usuario) {
      api<NotificacionResumen[]>('/notificaciones?soloNoLeidas=true')
        .then((r) => activo && setNotificaciones(r))
        .catch(() => {});
    }
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, usuario?.id]);

  // Stock bajo respeta el selector de sucursal del topbar: si hay una
  // sucursal concreta seleccionada se consulta solo esa; si el admin eligió
  // "Todas las sucursales" se consulta cada una y se suman (el endpoint
  // /inventario/bajo-stock exige una sucursalId por diseño, no hay versión
  // "todas" en el backend — no se le agrega, se compone aquí).
  useEffect(() => {
    let activo = true;
    if (!puedeVer('inventario', rol) || sucursales.length === 0) return;

    const idsAConsultar = sucursalTopbar !== null ? [sucursalTopbar] : puedeVerTodas ? sucursales.map((s) => s.id) : [];
    if (idsAConsultar.length === 0) return;

    Promise.all([
      ...idsAConsultar.map((id) => api<BajoStockResumen[]>(`/inventario/bajo-stock?sucursalId=${id}`)),
      ...idsAConsultar.map((id) => api<ExistenciaResumen[]>(`/inventario/existencias?sucursalId=${id}`)),
    ])
      .then((respuestas) => {
        if (!activo) return;
        setBajoStock(respuestas.slice(0, idsAConsultar.length).flat() as BajoStockResumen[]);
        setExistencias(respuestas.slice(idsAConsultar.length).flat() as ExistenciaResumen[]);
      })
      .catch(() => {
        if (!activo) return;
        setBajoStock([]);
        setExistencias([]);
      });

    return () => {
      activo = false;
    };
  }, [rol, sucursales, sucursalTopbar, puedeVerTodas]);

  const ventana = useMemo(() => calcularVentana(periodo), [periodo]);

  const { ventasPeriodo, ventasAnterior } = useMemo(() => {
    if (!ventas) return { ventasPeriodo: [] as VentaResumen[], ventasAnterior: [] as VentaResumen[] };
    const completadas = ventas.filter((v) => v.estado === 'COMPLETADA');
    return {
      ventasPeriodo: completadas.filter((v) => {
        const t = new Date(v.createdAt).getTime();
        return t >= ventana.desde.getTime() && t < ventana.hasta.getTime();
      }),
      ventasAnterior: completadas.filter((v) => {
        const t = new Date(v.createdAt).getTime();
        return t >= ventana.anteriorDesde.getTime() && t < ventana.anteriorHasta.getTime();
      }),
    };
  }, [ventas, ventana]);

  const totalActual = ventasPeriodo.reduce((acc, v) => acc + Number(v.total), 0);
  const totalAnterior = ventasAnterior.reduce((acc, v) => acc + Number(v.total), 0);
  const deltaMonto = calcularDelta(totalActual, totalAnterior);
  const deltaConteo = calcularDelta(ventasPeriodo.length, ventasAnterior.length);

  const serieGrafica = useMemo(() => agruparParaGrafica(ventasPeriodo, periodo, ventana.desde), [ventasPeriodo, periodo, ventana]);
  const topProductos = useMemo(() => calcularTopProductos(ventasPeriodo), [ventasPeriodo]);
  const actividad = useMemo(
    () => construirActividad(ventas ?? [], apartados ?? [], notificaciones),
    [ventas, apartados, notificaciones]
  );

  const saldoApartados = (apartados ?? []).reduce((acc, a) => acc + (a.saldoPendiente || 0), 0);
  const resumenStock = useMemo(() => {
    if (existencias === null) return null;

    const porVariante = new Map<number, { stockActual: number; stockMinimo: number }>();
    existencias.forEach((existencia) => {
      const actual = porVariante.get(existencia.variante.id) ?? { stockActual: 0, stockMinimo: 0 };
      actual.stockActual += Number(existencia.stockActual);
      actual.stockMinimo = Math.max(actual.stockMinimo, Number(existencia.stockMinimo));
      porVariante.set(existencia.variante.id, actual);
    });

    return Array.from(porVariante.values()).reduce(
      (resumen, variante) => {
        if (variante.stockActual <= 0) resumen.agotado += 1;
        else if (variante.stockActual <= variante.stockMinimo) resumen.bajo += 1;
        else resumen.disponible += 1;
        return resumen;
      },
      { disponible: 0, bajo: 0, agotado: 0 }
    );
  }, [existencias]);

  const primerNombre = usuario?.nombre?.split(' ')[0] ?? '';
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  const accionesRapidas = [
    puedeVer('ventas', rol) && { href: '/dashboard/ventas', label: 'Nueva venta', icon: ShoppingCart },
    puedeVer('productos', rol) && { href: '/dashboard/productos', label: 'Nuevo producto', icon: Package },
    puedeVer('apartados', rol) && { href: '/dashboard/apartados', label: 'Nuevo apartado', icon: CalendarClock },
    puedeVer('transferencias', rol) && { href: '/dashboard/transferencias', label: 'Transferir inventario', icon: ArrowLeftRight },
  ].filter(Boolean) as { href: string; label: string; icon: typeof ShoppingCart }[];

  const cargandoInicial = ventas === null && apartados === null && productosTotal === null;

  return (
    <div className="space-y-6">
      {/* Saludo + selector de periodo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-semibold leading-tight tracking-tight">
            {saludo}, {primerNombre}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Esto es lo que está pasando hoy en Camino al Deporte.</p>
        </div>
        <div className="flex items-center gap-1 self-start rounded-lg border border-border bg-secondary/50 p-1">
          {OPCIONES_PERIODO.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodo(opt.value)}
              className={`rounded-md px-3 h-7 text-xs font-medium transition-colors ${
                periodo === opt.value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Acciones rápidas */}
      {accionesRapidas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accionesRapidas.map((accion) => (
            <Button key={accion.href} variant="outline" size="sm" asChild>
              <Link href={accion.href}>
                <accion.icon className="w-3.5 h-3.5" />
                {accion.label}
              </Link>
            </Button>
          ))}
        </div>
      )}

      {/* Métricas principales */}
      {cargandoInicial ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {puedeVer('ventas', rol) && (
            <MetricCard
              title="Ventas"
              value={`$${totalActual.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`}
              icon={TrendingUp}
              delta={deltaMonto}
              deltaLabel="vs. periodo anterior"
              sparkline={serieGrafica.map((b) => b.total)}
            />
          )}
          {puedeVer('ventas', rol) && (
            <MetricCard
              title="Ventas realizadas"
              value={String(ventasPeriodo.length)}
              icon={ShoppingCart}
              delta={deltaConteo}
              deltaLabel="vs. periodo anterior"
            />
          )}
          {puedeVer('productos', rol) && (
            <MetricCard
              title="Productos"
              value={productosTotal !== null ? String(productosTotal) : '—'}
              icon={Package}
              description={
                bajoStock !== null
                  ? bajoStock.length > 0
                    ? `${bajoStock.length} con stock bajo`
                    : 'Todo en niveles saludables'
                  : undefined
              }
            />
          )}
          {puedeVer('apartados', rol) && (
            <MetricCard
              title="Apartados"
              value={String((apartados ?? []).length)}
              icon={CalendarClock}
              description={`$${saldoApartados.toLocaleString('es-MX', { minimumFractionDigits: 0 })} por cobrar`}
            />
          )}
        </div>
      )}

      {/* Gráfica de ventas + actividad reciente */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {puedeVer('ventas', rol) && (
          <Card className="lg:col-span-2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Ventas</h2>
              <span className="text-xs text-muted-foreground">
                {OPCIONES_PERIODO.find((o) => o.value === periodo)?.label}
              </span>
            </div>
            {ventas === null ? (
              <Skeleton className="h-56 w-full" />
            ) : ventasPeriodo.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sin ventas en este periodo"
                description="Cuando se registre una venta, aparecerá aquí."
              />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={serieGrafica} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'rgb(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval={periodo === '30d' ? 3 : 0}
                  />
                  <ChartTooltip
                    formatter={(value: number) => [`$${value.toLocaleString('es-MX')}`, 'Ventas']}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid rgb(var(--border))',
                      fontSize: 12,
                      background: 'rgb(var(--popover))',
                      color: 'rgb(var(--popover-foreground))',
                    }}
                  />
                  <Line type="monotone" dataKey="total" stroke="rgb(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        )}

        <Card className={puedeVer('ventas', rol) ? '' : 'lg:col-span-3'}>
          <CardHeader>
            <CardTitle className="text-base">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {ventas === null && apartados === null ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <ActivityFeed items={actividad} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estado del inventario + productos más vendidos */}
      {(puedeVer('inventario', rol) || puedeVer('ventas', rol)) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {puedeVer('inventario', rol) && (
            <Card className="p-5">
              <h2 className="mb-4 text-base font-semibold">Estado del inventario</h2>
              {bajoStock === null || resumenStock === null ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <StockIndicator
                    disponible={resumenStock.disponible}
                    bajo={resumenStock.bajo}
                    agotado={resumenStock.agotado}
                  />
                  <p className="mt-4 text-sm text-muted-foreground">
                    {bajoStock.length > 0
                      ? `${bajoStock.length} producto${bajoStock.length === 1 ? '' : 's'} necesita${bajoStock.length === 1 ? '' : 'n'} atención`
                      : 'Todo el inventario está en niveles saludables.'}
                  </p>
                  <Button variant="link" size="sm" className="mt-1 px-0" asChild>
                    <Link href="/dashboard/inventario">
                      Ver inventario <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </Button>
                </>
              )}
            </Card>
          )}

          {puedeVer('ventas', rol) && (
            <Card className={`p-5 ${puedeVer('inventario', rol) ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <h2 className="mb-4 text-base font-semibold">Productos más vendidos</h2>
              {ventas === null ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : topProductos.length === 0 ? (
                <EmptyState
                  icon={Warehouse}
                  title="Sin ventas todavía en este periodo"
                  description="Los productos más vendidos aparecerán aquí en cuanto haya ventas registradas."
                />
              ) : (
                <ul className="space-y-3">
                  {topProductos.map((p, i) => (
                    <li key={p.nombre} className="flex items-center gap-3">
                      <span className="w-4 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                      <ProductoThumb url={p.imagen} alt={p.nombre} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">{p.cantidad} vendidos</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        ${p.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
