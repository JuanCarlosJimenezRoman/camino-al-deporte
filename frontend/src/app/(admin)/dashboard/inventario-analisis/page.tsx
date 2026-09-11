'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { useBranch } from '@/lib/branchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Boxes, Box, AlertTriangle, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Colores: se reutilizan los tokens de marca (--chart-1..5) igual que en
// Reportes, para que las gráficas se vean consistentes con el resto.
// ---------------------------------------------------------------------------
const COLOR_PRIMARIO = 'rgb(var(--chart-1))';
const COLORES = [
  'rgb(var(--chart-1))',
  'rgb(var(--chart-2))',
  'rgb(var(--chart-4))',
  'rgb(var(--chart-3))',
  'rgb(var(--chart-5))',
];
const COLOR_GRID = 'rgb(var(--border))';
const COLOR_EJE = 'rgb(var(--chart-axis))';
const COLOR_TEXTO_SECUNDARIO = 'rgb(var(--muted-foreground))';

interface FilaDesglose {
  id?: number | null;
  nombre?: string;
  valor?: string;
  tipo?: string;
  marca?: string | null;
  piezas: number;
  valorCompra: number;
  productos: number;
  variantes: number;
  debajoMinimo: number;
}

interface FilaSucursal {
  id: number;
  nombre: string;
  piezas: number;
  valorCompra: number;
  valorVenta: number;
}

interface BajoMinimoRow {
  varianteId: number;
  producto: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  talla: string | null;
  color: string | null;
  sku: string;
  sucursal: string | null;
  stock: number;
  minimo: number;
  faltante: number;
}

interface AnalisisResponse {
  sucursalId: number | null;
  totales: {
    piezas: number;
    valorCompra: number;
    valorVenta: number;
    productos: number;
    variantes: number;
  };
  porMarca: FilaDesglose[];
  porModelo: FilaDesglose[];
  porCategoria: FilaDesglose[];
  porTalla: FilaDesglose[];
  porProveedor: FilaDesglose[];
  porSucursal: FilaSucursal[];
  bajoMinimo: BajoMinimoRow[];
}

function money(n: number) {
  return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function etiquetaTalla(r: FilaDesglose) {
  return r.tipo ? `${r.tipo}: ${r.valor}` : (r.valor ?? '');
}

function TooltipUnidades({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-card text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{p.value} pzs</span>
        </div>
      ))}
    </div>
  );
}

function KpiTile({
  icon: Icono,
  titulo,
  valor,
  sub,
}: {
  icon: typeof Package;
  titulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icono className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// Gráfica de barras horizontales genérica para desgloses por piezas.
function BarrasDesglose({
  data,
  labelKey,
  color = COLOR_PRIMARIO,
}: {
  data: any[];
  labelKey: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={COLOR_GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: COLOR_EJE }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={130}
          tick={{ fontSize: 11, fill: COLOR_TEXTO_SECUNDARIO }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v && v.length > 18 ? `${v.slice(0, 18)}…` : v)}
        />
        <Tooltip content={<TooltipUnidades />} />
        <Bar dataKey="piezas" name="Piezas en stock" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TablaDesglose({ data, labelFn }: { data: FilaDesglose[]; labelFn?: (r: FilaDesglose) => string }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Piezas</th>
            <th>Valor</th>
            <th>Bajo mín.</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.id ?? `${r.nombre ?? r.valor ?? 'sin'}-${i}`}>
              <td>{labelFn ? labelFn(r) : r.nombre ?? r.valor}</td>
              <td className="tabular-nums">{r.piezas}</td>
              <td className="tabular-nums">{money(r.valorCompra)}</td>
              <td>
                {r.debajoMinimo > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {r.debajoMinimo}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventarioAnalisisPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const puedeVerAnalisis = puedeVer('inventarioAnalisis', rol);
  const esAdmin = rol === 'ADMIN_PRINCIPAL' || rol === 'DESARROLLO';
  const { sucursalId, sucursalActual, cargando: cargandoSucursal } = useBranch();

  const [datos, setDatos] = useState<AnalisisResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (cargandoSucursal) return;
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (sucursalId !== null) qs.set('sucursalId', String(sucursalId));
      const data = await api<AnalisisResponse>(`/inventario/analisis?${qs.toString()}`);
      setDatos(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el análisis de inventario.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (puedeVerAnalisis) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerAnalisis, sucursalId, cargandoSucursal]);

  const verTodas = sucursalId === null && esAdmin;

  const porCategoria = useMemo(() => (datos?.porCategoria ?? []).slice(0, 8), [datos]);

  if (!puedeVerAnalisis) {
    return <EmptyState icon={Lock} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  const subtitulo = verTodas
    ? 'Visión global del stock de todas las sucursales, para decidir qué reabastecer.'
    : `Stock en ${sucursalActual?.nombre ?? 'esta sucursal'}, para decidir qué reabastecer.`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario y reabasto"
        subtitle={subtitulo}
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Inventario y reabasto' }]}
      />

      {verTodas && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-foreground">
          Viendo <strong>todas las sucursales</strong> a la vez. Para revisar el reabasto de una en particular, elige una
          sucursal en la barra superior.
        </p>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {cargando || cargandoSucursal ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : datos && datos.totales.productos === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin existencias registradas"
          description={verTodas ? 'Ninguna sucursal tiene stock cargado todavía.' : 'Esta sucursal no tiene stock cargado todavía.'}
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile
              icon={Boxes}
              titulo="Piezas en stock"
              valor={datos ? datos.totales.piezas.toLocaleString('es-MX') : '—'}
              sub={datos ? `${datos.totales.variantes} variantes (tallas/colores)` : undefined}
            />
            <KpiTile
              icon={Package}
              titulo="Valor de compra"
              valor={datos ? money(datos.totales.valorCompra) : '—'}
              sub={datos ? `Valor de venta: ${money(datos.totales.valorVenta)}` : undefined}
            />
            <KpiTile
              icon={Box}
              titulo="Productos"
              valor={datos ? datos.totales.productos.toLocaleString('es-MX') : '—'}
            />
            <KpiTile
              icon={AlertTriangle}
              titulo="Bajo el mínimo"
              valor={datos ? String(datos.bajoMinimo.length) : '—'}
              sub={datos ? 'variantes a reordenar (más urgente primero)' : undefined}
            />
          </div>

          {/* Reabasto sugerido */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reabasto sugerido</CardTitle>
              <CardDescription>
                Variantes en o por debajo de su stock mínimo{verTodas ? ' (cada renglón indica la sucursal)' : ''}. Ordenadas por
                mayor faltante.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!datos || datos.bajoMinimo.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                  No hay variantes por debajo de su mínimo. Todo está en orden.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Talla</th>
                        {verTodas && <th>Sucursal</th>}
                        <th>Stock</th>
                        <th>Mínimo</th>
                        <th>Faltante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.bajoMinimo.map((r) => (
                        <tr key={r.varianteId}>
                          <td>
                            <div className="font-medium">{r.producto}</div>
                            <div className="text-xs text-muted-foreground">
                              {[r.marca, r.modelo, r.categoria].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{r.talla ?? '—'}</td>
                          {verTodas && <td>{r.sucursal ?? '—'}</td>}
                          <td className="tabular-nums">{r.stock}</td>
                          <td className="tabular-nums">{r.minimo}</td>
                          <td>
                            <span className="font-medium text-destructive tabular-nums">{r.faltante}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock por sucursal (solo tiene sentido en modo "todas") */}
          {verTodas && datos && datos.porSucursal.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock por sucursal</CardTitle>
                <CardDescription>Piezas en stock por sucursal.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarrasDesglose data={datos.porSucursal} labelKey="nombre" color={COLOR_PRIMARIO} />
              </CardContent>
            </Card>
          )}

          {/* Stock por categoría (pie) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stock por categoría</CardTitle>
              <CardDescription>Cómo se reparte el stock actual entre categorías.</CardDescription>
            </CardHeader>
            <CardContent>
              {porCategoria.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={porCategoria}
                        dataKey="piezas"
                        nameKey="nombre"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="var(--card, #fff)"
                        strokeWidth={2}
                      >
                        {porCategoria.map((entry, i) => (
                          <Cell key={entry.id ?? i} fill={COLORES[i % COLORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipUnidades />} />
                      <Legend
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Marca + Modelo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock por marca</CardTitle>
                <CardDescription>Top {Math.min(10, datos?.porMarca.length ?? 0)} marcas por piezas en stock.</CardDescription>
              </CardHeader>
              <CardContent>
                {!datos || datos.porMarca.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
                ) : (
                  <div className="space-y-3">
                    <BarrasDesglose data={datos.porMarca.slice(0, 10)} labelKey="nombre" />
                    <TablaDesglose data={datos.porMarca.slice(0, 10)} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock por modelo</CardTitle>
                <CardDescription>Top {Math.min(10, datos?.porModelo.length ?? 0)} modelos por piezas en stock.</CardDescription>
              </CardHeader>
              <CardContent>
                {!datos || datos.porModelo.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
                ) : (
                  <div className="space-y-3">
                    <BarrasDesglose
                      data={datos.porModelo.slice(0, 10)}
                      labelKey="nombre"
                    />
                    <TablaDesglose data={datos.porModelo.slice(0, 10)} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Talla + Proveedor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock por talla</CardTitle>
                <CardDescription>Piezas en stock por talla (agrupado por tipo).</CardDescription>
              </CardHeader>
              <CardContent>
                {!datos || datos.porTalla.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
                ) : (
                  <div className="space-y-3">
                    <BarrasDesglose
                      data={datos.porTalla.slice(0, 14).map((r) => ({ ...r, etiqueta: etiquetaTalla(r) }))}
                      labelKey="etiqueta"
                    />
                    <TablaDesglose data={datos.porTalla.slice(0, 14)} labelFn={etiquetaTalla} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock por proveedor</CardTitle>
                <CardDescription>Piezas en stock que surte cada proveedor (stock real, no el proveedor por defecto).</CardDescription>
              </CardHeader>
              <CardContent>
                {!datos || datos.porProveedor.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
                ) : (
                  <div className="space-y-3">
                    <BarrasDesglose data={datos.porProveedor.slice(0, 10)} labelKey="nombre" />
                    <TablaDesglose data={datos.porProveedor.slice(0, 10)} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
