'use client';

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { DollarSign, ShoppingCart, Receipt, Tag, Download, TrendingUp, TrendingDown, Minus, Loader2, Lock } from 'lucide-react';
import { useReportes } from '@/features/reportes/useReportes';
import { money, moneyCompacto } from '@/features/reportes/utils';
import { KpiTile } from '@/features/reportes/components/KpiTile';
import { SelectorPeriodo } from '@/features/reportes/components/SelectorPeriodo';
import { TooltipMoneda } from '@/features/reportes/components/TooltipMoneda';
import { TooltipPiezas } from '@/features/reportes/components/TooltipPiezas';
import { TasaVentaBadge } from '@/features/reportes/components/TasaVentaBadge';

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
// Los cinco quedan como var() de globals.css (no hex fijo) para que se vean
// bien tanto en modo claro como oscuro sin duplicar lógica acá: chart-2 y
// chart-3 en particular usan un paso más oscuro de su mismo tono en modo
// oscuro (revalidado con el skill de dataviz contra la superficie oscura),
// mientras que chart-1/4/5 y los grises se heredan sin cambio.
const COLOR_PRIMARIO = 'rgb(var(--chart-1))'; // --chart-1 / --primary
const COLOR_PRIMARIO_SUAVE = 'rgb(var(--chart-1) / 0.14)';
const COLOR_SECUNDARIO = 'rgb(var(--chart-2))'; // segundo color de la misma secuencia fija, para "Ingresado" vs "Vendido"
const COLOR_PROYECCION = 'rgb(var(--chart-projection))'; // tinte claro del mismo hue, para la línea de estimación
// Efectivo, Tarjeta, Transferencia (mostrador), Pedidos en línea
const COLORES_METODO_PAGO = ['rgb(var(--chart-1))', 'rgb(var(--chart-2))', 'rgb(var(--chart-4))', 'rgb(var(--chart-3))'];
const COLOR_GRID = 'rgb(var(--border))';
const COLOR_EJE = 'rgb(var(--chart-axis))';
const COLOR_TEXTO_SECUNDARIO = 'rgb(var(--muted-foreground))';

export default function ReportesVentasPage() {
  const {
    usuario,
    esAdmin,
    puedeVerReportes,
    sucursales,
    sucursalId,
    setSucursalId,
    preset,
    aplicarPreset,
    desde,
    hasta,
    setRango,
    setPreset,
    resumen,
    porMetodoPago,
    porSucursal,
    desglose,
    porProveedor,
    cargando,
    error,
    horizonte,
    setHorizonte,
    estimacion,
    cargandoEstimacion,
    exportando,
    exportar,
    datosSerie,
    datosProyeccion,
  } = useReportes();

  if (!puedeVerReportes) {
    return <EmptyState icon={Lock} title="Sin acceso" description="No tienes permiso para ver esta sección." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes y estimaciones de ventas"
        subtitle={
          esAdmin
            ? 'Visión global de todas las sucursales, incluyendo la tienda en línea. Filtra por sucursal o periodo para profundizar.'
            : `Datos de tu sucursal${usuario?.sucursal?.nombre ? ` (${usuario.sucursal.nombre})` : ''} más los pedidos en línea que salieron de ahí.`
        }
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Reportes' }]}
        actions={
          <Button onClick={exportar} disabled={exportando || cargando} variant="secondary" size="sm">
            {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Exportar a Excel
          </Button>
        }
      />

      {/* Filtros: una sola fila, arriba de todo — todo lo de abajo se filtra igual */}
      <Card>
        <SelectorPeriodo
          preset={preset}
          desde={desde}
          hasta={hasta}
          sucursalId={sucursalId}
          sucursales={sucursales}
          esAdmin={esAdmin}
          onPreset={aplicarPreset}
          onDesde={(v) => {
            setPreset('personalizado');
            setRango((r) => ({ ...r, desde: v }));
          }}
          onHasta={(v) => {
            setPreset('personalizado');
            setRango((r) => ({ ...r, hasta: v }));
          }}
          onSucursal={setSucursalId}
        />
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
            <div className="min-w-0">
              <h3 className="text-sm font-semibold mb-2">Por marca</h3>
              <div className="overflow-x-auto">
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
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold mb-2">Por categoría</h3>
              <div className="overflow-x-auto">
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
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold mb-2">Por talla</h3>
              <div className="overflow-x-auto">
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
          </div>
        </CardContent>
      </Card>

      {/* Ventas por proveedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas por proveedor</CardTitle>
          <CardDescription>
            Piezas que entraron (reabastos) contra piezas vendidas en el periodo, para ver qué tan bien rota lo que surte
            cada proveedor — no solo cuánto vendió en total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!porProveedor || porProveedor.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={Math.max(260, porProveedor.slice(0, 8).length * 52)}>
                <BarChart data={porProveedor.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={COLOR_GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: COLOR_EJE }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    width={110}
                    tick={{ fontSize: 11, fill: COLOR_TEXTO_SECUNDARIO }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 16)}…` : v)}
                  />
                  <Tooltip content={<TooltipPiezas />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                  />
                  <Bar dataKey="cantidadIngresada" name="Ingresado" fill={COLOR_SECUNDARIO} radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="cantidadVendida" name="Vendido" fill={COLOR_PRIMARIO} radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Ingresado (pzs)</th>
                      <th>Vendido (pzs)</th>
                      <th>Monto vendido</th>
                      <th>% vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porProveedor.map((p) => (
                      <tr key={p.id ?? 'sin-proveedor'}>
                        <td>{p.nombre}</td>
                        <td>{p.cantidadIngresada}</td>
                        <td>{p.cantidadVendida}</td>
                        <td>{money(p.montoVendido)}</td>
                        <td>
                          <TasaVentaBadge valor={p.tasaVenta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
