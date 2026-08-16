'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  ComposedChart,
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
import { api, apiDownload, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  ShoppingCart,
  Receipt,
  Tag,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Colores: se reutilizan los tokens de marca ya definidos en globals.css
// (--chart-1..5) en vez de inventar una paleta nueva, para que este
// dashboard se vea consistente con el resto del sistema. Se evita a
// propósito --chart-5 (rojo) como color de SERIE porque coincide con el
// token de estado destructive que ya se usa en esta misma pantalla (flechas
// de variación) — usarlo también para una categoría de la gráfica generaría
// confusión entre "esto bajó" y "esto es la serie X". --chart-3 (ámbar) sí
// se usa aquí para "Pedidos en línea" (ver COLORES_METODO_PAGO): coincide
// con el token warning, pero ese solo aparece en la tarjeta de Estimación,
// separada de esta gráfica, así que el riesgo de confundirlos es bajo.
// Validado con el validador de paletas del skill de dataviz (orden orange/
// green/violet/amber: PASS en CVD y contraste normal —tanto adyacente como
// --pairs all, que es el caso real de un pie donde cualquier rebanada puede
// quedar junto a cualquier otra—, con la advertencia de contraste esperable
// en verde/ámbar — por eso aquí siempre hay leyenda + valores directos,
// nunca solo color).
const COLOR_PRIMARIO = '#FF4E00'; // --chart-1 / --primary
const COLOR_PRIMARIO_SUAVE = 'rgba(255, 78, 0, 0.14)';
const COLOR_PROYECCION = '#FFB088'; // tinte claro del mismo hue, para la línea de estimación
// Efectivo, Tarjeta, Transferencia (mostrador), Pedidos en línea
const COLORES_METODO_PAGO = ['#FF4E00', '#10B981', '#8B5CF6', '#F59E0B'];
const COLOR_GRID = '#e5e7eb'; // --border
const COLOR_EJE = '#9ca3af';
const COLOR_TEXTO_SECUNDARIO = '#6b7280'; // --muted-foreground

interface Sucursal {
  id: number;
  nombre: string;
}

interface ResumenMetricas {
  totalVentas: number;
  totalMonto: number;
  totalDescuentos: number;
  ticketPromedio: number;
}

interface ResumenResponse {
  periodo: { desde: string; hasta: string };
  periodoAnterior: { desde: string; hasta: string };
  actual: ResumenMetricas;
  anterior: ResumenMetricas;
  variacion: { monto: number | null; ventas: number | null; ticketPromedio: number | null };
}

interface SeriePunto {
  fecha: string;
  ventas: number;
  monto: number;
}

interface MetodoPagoRow {
  metodo: string;
  etiqueta: string;
  ventas: number;
  monto: number;
}

interface SucursalRow {
  sucursalId: number;
  nombre: string;
  ventas: number;
  monto: number;
}

interface DesgloseItem {
  id?: number | null;
  nombre?: string;
  valor?: string;
  tipo?: string;
  cantidad: number;
  monto: number;
}

interface DesgloseResponse {
  topProductos: DesgloseItem[];
  porMarca: DesgloseItem[];
  porCategoria: DesgloseItem[];
  porTalla: DesgloseItem[];
  porProveedor: DesgloseItem[];
}

interface EstimacionResponse {
  historico: SeriePunto[];
  suficienteDatos: boolean;
  promedioDiarioHistorico: number;
  tendencia: { direccion: 'creciendo' | 'bajando' | 'estable'; cambioSemanalPct: number };
  totalProyectado: number;
  proyeccion: { fecha: string; monto: number }[];
  nota: string;
}

// Un punto del gráfico de estimación trae SOLO "real" (histórico) o SOLO
// "estimado" (proyección) — excepto el último día histórico, que trae
// ambos para que la línea punteada arranque conectada a la línea sólida.
interface PuntoProyeccion {
  fecha: string;
  real?: number;
  estimado?: number;
}

function money(n: number) {
  return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneyCompacto(n: number) {
  const abs = Math.abs(n || 0);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return money(n);
}

function formatFechaCorta(fecha: string) {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function menosDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

type PresetRango = 'hoy' | '7d' | '30d' | 'mes' | 'mesPasado' | 'personalizado';

function calcularPreset(preset: PresetRango): { desde: string; hasta: string } {
  const hasta = hoyISO();
  switch (preset) {
    case 'hoy':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: menosDias(6), hasta };
    case '30d':
      return { desde: menosDias(29), hasta };
    case 'mes': {
      const ahora = new Date();
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: inicio.toISOString().slice(0, 10), hasta };
    }
    case 'mesPasado': {
      const ahora = new Date();
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
    }
    default:
      // 'personalizado' no pasa por aquí (los inputs de fecha manejan su
      // propio valor); este caso solo existe para que el switch compile.
      return { desde: menosDias(29), hasta };
  }
}

// ---------------------------------------------------------------------------
// Piezas pequeñas reutilizables
// ---------------------------------------------------------------------------

function Delta({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="text-xs text-muted-foreground">sin periodo anterior</span>;
  }
  const positivo = valor > 0.5;
  const negativo = valor < -0.5;
  const Icono = positivo ? TrendingUp : negativo ? TrendingDown : Minus;
  const clase = positivo ? 'text-success' : negativo ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${clase}`}>
      <Icono className="w-3.5 h-3.5" />
      {valor > 0 ? '+' : ''}
      {valor.toFixed(1)}% vs periodo anterior
    </span>
  );
}

function KpiTile({
  icon: Icono,
  titulo,
  valor,
  delta,
  tono,
}: {
  icon: typeof DollarSign;
  titulo: string;
  valor: string;
  delta?: number | null;
  tono: 'primary' | 'success' | 'warning';
}) {
  const toneClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div className={`p-2 rounded-lg ${toneClasses[tono]}`}>
          <Icono className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor}</div>
        {delta !== undefined && <div className="mt-1">{<Delta valor={delta} />}</div>}
      </CardContent>
    </Card>
  );
}

function TooltipMoneda({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-card text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function ReportesVentasPage() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const esAdmin = rol === 'ADMIN_PRINCIPAL' || rol === 'DESARROLLO';
  const puedeVerReportes = puedeVer('reportes', rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [preset, setPreset] = useState<PresetRango>('30d');
  const [{ desde, hasta }, setRango] = useState(calcularPreset('30d'));

  const [resumen, setResumen] = useState<ResumenResponse | null>(null);
  const [serie, setSerie] = useState<SeriePunto[] | null>(null);
  const [porMetodoPago, setPorMetodoPago] = useState<MetodoPagoRow[] | null>(null);
  const [porSucursal, setPorSucursal] = useState<SucursalRow[] | null>(null);
  const [desglose, setDesglose] = useState<DesgloseResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const [horizonte, setHorizonte] = useState(30);
  const [estimacion, setEstimacion] = useState<EstimacionResponse | null>(null);
  const [cargandoEstimacion, setCargandoEstimacion] = useState(false);

  useEffect(() => {
    if (esAdmin) api<Sucursal[]>('/sucursales').then(setSucursales).catch(() => {});
  }, [esAdmin]);

  function aplicarPreset(p: PresetRango) {
    setPreset(p);
    setRango(calcularPreset(p));
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      if (esAdmin && sucursalId) qs.set('sucursalId', sucursalId);
      const qsStr = qs.toString();

      const [resumenData, serieData, metodoData, desgloseData, sucursalData] = await Promise.all([
        api<ResumenResponse>(`/reportes/ventas/resumen?${qsStr}`),
        api<{ serie: SeriePunto[] }>(`/reportes/ventas/serie?${qsStr}`),
        api<{ porMetodoPago: MetodoPagoRow[] }>(`/reportes/ventas/por-metodo-pago?${qsStr}`),
        api<DesgloseResponse>(`/reportes/ventas/desglose?${qsStr}&limite=10`),
        esAdmin ? api<{ porSucursal: SucursalRow[] }>(`/reportes/ventas/por-sucursal?${qsStr}`) : Promise.resolve(null),
      ]);

      setResumen(resumenData);
      setSerie(serieData.serie);
      setPorMetodoPago(metodoData.porMetodoPago);
      setDesglose(desgloseData);
      setPorSucursal(sucursalData?.porSucursal ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los reportes.');
    } finally {
      setCargando(false);
    }
  }

  async function cargarEstimacion() {
    setCargandoEstimacion(true);
    try {
      const qs = new URLSearchParams({ horizonte: String(horizonte), historialDias: '90' });
      if (esAdmin && sucursalId) qs.set('sucursalId', sucursalId);
      const data = await api<EstimacionResponse>(`/reportes/ventas/estimacion?${qs.toString()}`);
      setEstimacion(data);
    } catch {
      setEstimacion(null);
    } finally {
      setCargandoEstimacion(false);
    }
  }

  useEffect(() => {
    if (puedeVerReportes) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerReportes, desde, hasta, sucursalId]);

  useEffect(() => {
    if (puedeVerReportes) cargarEstimacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerReportes, horizonte, sucursalId]);

  async function exportar() {
    setExportando(true);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      if (esAdmin && sucursalId) qs.set('sucursalId', sucursalId);
      await apiDownload(`/reportes/ventas/exportar?${qs.toString()}`, `reporte-ventas-${desde}-a-${hasta}.xlsx`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo exportar el reporte.');
    } finally {
      setExportando(false);
    }
  }

  const datosProyeccion = useMemo<PuntoProyeccion[]>(() => {
    if (!estimacion) return [];
    const puntos: PuntoProyeccion[] = estimacion.historico.slice(-45).map((p) => ({
      fecha: formatFechaCorta(p.fecha),
      real: p.monto,
    }));
    if (puntos.length && estimacion.proyeccion.length) {
      puntos[puntos.length - 1].estimado = puntos[puntos.length - 1].real;
    }
    for (const p of estimacion.proyeccion) {
      puntos.push({ fecha: formatFechaCorta(p.fecha), estimado: p.monto });
    }
    return puntos;
  }, [estimacion]);

  const datosSerie = useMemo(() => (serie || []).map((p) => ({ ...p, fechaCorta: formatFechaCorta(p.fecha) })), [serie]);

  if (!puedeVerReportes) {
    return <p className="text-sm text-muted-foreground">No tienes permiso para ver esta sección.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Reportes y estimaciones de ventas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {esAdmin
              ? 'Visión global de todas las sucursales, incluyendo la tienda en línea. Filtra por sucursal o periodo para profundizar.'
              : `Datos de tu sucursal${usuario?.sucursal?.nombre ? ` (${usuario.sucursal.nombre})` : ''} más los pedidos en línea que salieron de ahí.`}
          </p>
        </div>
        <Button onClick={exportar} disabled={exportando || cargando} variant="secondary" size="sm">
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Exportar a Excel
        </Button>
      </div>

      {/* Filtros: una sola fila, arriba de todo — todo lo de abajo se filtra igual */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          {(
            [
              ['hoy', 'Hoy'],
              ['7d', '7 días'],
              ['30d', '30 días'],
              ['mes', 'Este mes'],
              ['mesPasado', 'Mes pasado'],
            ] as [PresetRango, string][]
          ).map(([valor, etiqueta]) => (
            <Button
              key={valor}
              size="sm"
              variant={preset === valor ? 'default' : 'outline'}
              onClick={() => aplicarPreset(valor)}
            >
              {etiqueta}
            </Button>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setPreset('personalizado');
                setRango((r) => ({ ...r, desde: e.target.value }));
              }}
              className="!w-auto"
              style={{ maxWidth: 150 }}
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setPreset('personalizado');
                setRango((r) => ({ ...r, hasta: e.target.value }));
              }}
              className="!w-auto"
              style={{ maxWidth: 150 }}
            />
          </div>
          {esAdmin && (
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          icon={DollarSign}
          titulo="Total vendido"
          valor={resumen ? money(resumen.actual.totalMonto) : '—'}
          delta={resumen?.variacion.monto ?? undefined}
          tono="primary"
        />
        <KpiTile
          icon={ShoppingCart}
          titulo="Ventas"
          valor={resumen ? String(resumen.actual.totalVentas) : '—'}
          delta={resumen?.variacion.ventas ?? undefined}
          tono="primary"
        />
        <KpiTile
          icon={Receipt}
          titulo="Ticket promedio"
          valor={resumen ? money(resumen.actual.ticketPromedio) : '—'}
          delta={resumen?.variacion.ticketPromedio ?? undefined}
          tono="success"
        />
        <KpiTile
          icon={Tag}
          titulo="Descuentos aplicados"
          valor={resumen ? money(resumen.actual.totalDescuentos) : '—'}
          tono="warning"
        />
      </div>

      {/* Tendencia */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia de ventas</CardTitle>
          <CardDescription>
            Monto vendido por día en el periodo filtrado ({desde} a {hasta}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando || !datosSerie.length ? (
            <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
              {cargando ? 'Cargando…' : 'Sin ventas en el periodo.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <ComposedChart data={datosSerie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={COLOR_GRID} vertical={false} />
                <XAxis
                  dataKey="fechaCorta"
                  tick={{ fontSize: 11, fill: COLOR_EJE }}
                  axisLine={{ stroke: COLOR_GRID }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: COLOR_EJE }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => moneyCompacto(v)}
                  width={56}
                />
                <Tooltip content={<TooltipMoneda />} />
                <Area
                  type="monotone"
                  dataKey="monto"
                  name="Monto vendido"
                  stroke={COLOR_PRIMARIO}
                  strokeWidth={2}
                  fill={COLOR_PRIMARIO_SUAVE}
                  dot={false}
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Método de pago + sucursales */}
      <div className={`grid grid-cols-1 ${esAdmin && porSucursal && porSucursal.length > 1 ? 'lg:grid-cols-2' : ''} gap-4`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ventas por método de pago</CardTitle>
            <CardDescription>Incluye "Pedidos en línea" — pagados por transferencia SPEI, ya validados.</CardDescription>
          </CardHeader>
          <CardContent>
            {!porMetodoPago || porMetodoPago.every((m) => m.monto === 0) ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={porMetodoPago}
                      dataKey="monto"
                      nameKey="etiqueta"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--card, #fff)"
                      strokeWidth={2}
                    >
                      {porMetodoPago.map((entry, i) => (
                        <Cell key={entry.metodo} fill={COLORES_METODO_PAGO[i % COLORES_METODO_PAGO.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipMoneda />} />
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
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {porMetodoPago?.map((m, i) => (
                <div key={m.metodo} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: COLORES_METODO_PAGO[i % COLORES_METODO_PAGO.length] }}
                  />
                  <span className="text-muted-foreground truncate">{m.etiqueta}</span>
                  <span className="font-medium ml-auto">{money(m.monto)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {esAdmin && porSucursal && porSucursal.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas por sucursal</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(220, porSucursal.length * 42)}>
                <BarChart data={porSucursal} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={COLOR_GRID} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => moneyCompacto(v)} tick={{ fontSize: 11, fill: COLOR_EJE }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={110}
                    tick={{ fontSize: 12, fill: COLOR_TEXTO_SECUNDARIO }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TooltipMoneda />} />
                  <Bar dataKey="monto" name="Monto vendido" fill={COLOR_PRIMARIO} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top productos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productos más vendidos</CardTitle>
          <CardDescription>Top {desglose?.topProductos.length || 0} por monto vendido en el periodo.</CardDescription>
        </CardHeader>
        <CardContent>
          {!desglose || desglose.topProductos.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={Math.max(240, desglose.topProductos.length * 34)}>
                <BarChart data={desglose.topProductos} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={COLOR_GRID} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => moneyCompacto(v)} tick={{ fontSize: 11, fill: COLOR_EJE }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={140}
                    tick={{ fontSize: 11, fill: COLOR_TEXTO_SECUNDARIO }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
                  />
                  <Tooltip content={<TooltipMoneda />} />
                  <Bar dataKey="monto" name="Monto vendido" fill={COLOR_PRIMARIO} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Piezas</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desglose.topProductos.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nombre}</td>
                        <td>{p.cantidad}</td>
                        <td>{money(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clasificación: marca, categoría, talla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clasificación de ventas</CardTitle>
          <CardDescription>Qué se está vendiendo por marca, categoría y talla en el periodo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Por marca</h3>
              <table>
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th>Piezas</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(desglose?.porMarca || []).slice(0, 12).map((m) => (
                    <tr key={m.id}>
                      <td>{m.nombre}</td>
                      <td>{m.cantidad}</td>
                      <td>{money(m.monto)}</td>
                    </tr>
                  ))}
                  {desglose && desglose.porMarca.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground">
                        Sin datos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Por categoría</h3>
              <table>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Piezas</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(desglose?.porCategoria || []).slice(0, 12).map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td>{c.cantidad}</td>
                      <td>{money(c.monto)}</td>
                    </tr>
                  ))}
                  {desglose && desglose.porCategoria.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground">
                        Sin datos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Por talla</h3>
              <table>
                <thead>
                  <tr>
                    <th>Talla</th>
                    <th>Piezas</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(desglose?.porTalla || []).slice(0, 12).map((t) => (
                    <tr key={`${t.tipo}-${t.valor}`}>
                      <td>{t.valor}</td>
                      <td>{t.cantidad}</td>
                      <td>{money(t.monto)}</td>
                    </tr>
                  ))}
                  {desglose && desglose.porTalla.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground">
                        Sin datos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estimación */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Estimación de ventas futuras</CardTitle>
            <CardDescription>
              Proyección con base en la tendencia de los últimos 90 días y el patrón de ventas por día de la semana.
            </CardDescription>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {[7, 30, 60, 90].map((d) => (
              <Button key={d} size="sm" variant={horizonte === d ? 'default' : 'outline'} onClick={() => setHorizonte(d)}>
                {d}d
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cargandoEstimacion || !estimacion ? (
            <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">Calculando estimación…</div>
          ) : (
            <>
              {!estimacion.suficienteDatos && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 text-warning text-xs px-3 py-2">
                  Todavía hay poco historial de ventas para una proyección confiable. Sigue registrando ventas y esta
                  estimación se irá afinando.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Proyectado próximos {horizonte} días</div>
                  <div className="text-2xl font-semibold mt-0.5">{money(estimacion.totalProyectado)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Promedio diario histórico</div>
                  <div className="text-2xl font-semibold mt-0.5">{money(estimacion.promedioDiarioHistorico)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tendencia</div>
                  <div
                    className={`inline-flex items-center gap-1.5 text-base font-semibold mt-0.5 ${
                      estimacion.tendencia.direccion === 'creciendo'
                        ? 'text-success'
                        : estimacion.tendencia.direccion === 'bajando'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {estimacion.tendencia.direccion === 'creciendo' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : estimacion.tendencia.direccion === 'bajando' ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <Minus className="w-4 h-4" />
                    )}
                    {estimacion.tendencia.direccion === 'creciendo' ? 'Creciendo' : estimacion.tendencia.direccion === 'bajando' ? 'Bajando' : 'Estable'}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({estimacion.tendencia.cambioSemanalPct > 0 ? '+' : ''}
                      {estimacion.tendencia.cambioSemanalPct.toFixed(1)}%/semana)
                    </span>
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={datosProyeccion} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={COLOR_GRID} vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 11, fill: COLOR_EJE }}
                    axisLine={{ stroke: COLOR_GRID }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: COLOR_EJE }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => moneyCompacto(v)}
                    width={56}
                  />
                  <Tooltip content={<TooltipMoneda />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={28}
                    iconType="plainline"
                    formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                  />
                  <Line
                    type="monotone"
                    dataKey="real"
                    name="Ventas reales"
                    stroke={COLOR_PRIMARIO}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="estimado"
                    name="Proyección"
                    stroke={COLOR_PROYECCION}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>

              <p className="text-xs text-muted-foreground">{estimacion.nota}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
