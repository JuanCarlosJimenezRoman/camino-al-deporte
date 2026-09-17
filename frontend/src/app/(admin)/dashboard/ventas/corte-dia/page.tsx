'use client';

import { useEffect, useState } from 'react';
import { Receipt, DollarSign, Banknote, CreditCard, Wallet, Coins, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatearHora, formatoMonedaExacto, ZONA_HORARIA_NEGOCIO } from '@/lib/utils';
import { useAuth, puedeVer } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { Button } from '@/components/ui/button';
import { ProductoThumb } from '@/components/admin/ProductoThumb';
import { imagenMiniatura } from '@/lib/imagenCloudinary';
import { StatusBadge } from '@/components/ui/status-badge';
import Link from 'next/link';

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
  // Pago combinado (ver POST /ventas) — el desglose real por el que ya se
  // repartió esta venta dentro de porMetodoPago/porCuentaTransferencia de
  // arriba está en "pagos", no en metodoPago (que aquí solo trae el
  // método "dominante").
  pagoMixto: boolean;
  pagos?: {
    metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
    monto: string;
    cuentaTransferencia?: { nombre: string } | null;
  }[];
}

interface ProductoVendido {
  // Null cuando el renglón es un producto no registrado en el catálogo (ver
  // esLibre) — se agrupa por su descripción en vez de por un id real.
  productoId: number | null;
  nombre: string;
  // Null en un producto sin variante por talla (ej. libre) o en variantes
  // sin talla asignada.
  talla: string | null;
  imagenUrl: string | null;
  esLibre?: boolean;
  proveedorId: number | null;
  proveedorNombre: string;
  cantidad: number;
  total: number;
}

interface TotalProveedor {
  proveedorId: number | null;
  proveedorNombre: string;
  cantidad: number;
  total: number;
}

interface AnticipoApartadoCorte {
  id: number;
  monto: number;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  cuenta: string | null;
  apartadoFolio: string | null;
  cliente: string | null;
  createdAt: string;
}

interface GastoProveedorCorte {
  proveedorId: number;
  monto: string;
  proveedor: { id: number; nombre: string };
}

interface GastoCorteDia {
  id: number;
  nivel: 'PROVEEDOR' | 'SUCURSAL';
  motivo: string;
  monto: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  notas: string | null;
  registradoPor: { nombre: string };
  createdAt: string;
  proveedores: GastoProveedorCorte[];
}

interface CorteDia {
  fecha: string;
  sucursalId: number | null;
  totalVentas: number;
  totalGeneral: number;
  // Cuánto de totalGeneral se cubrió con saldo a favor de clientes (ver
  // Venta.saldoAplicado) — ya está descontado de porMetodoPago/
  // porCuentaTransferencia, se muestra aparte solo como referencia.
  saldoAplicadoTotal: number;
  porMetodoPago: Record<string, number>;
  porCuentaTransferencia: Record<string, number>;
  canceladas: { cantidad: number; total: number };
  productosVendidos: ProductoVendido[];
  porProveedor: TotalProveedor[];
  ventas: VentaResumen[];
  // Anticipos y abonos de apartados cobrados este día (ver POST /apartados y
  // POST /apartados/:id/pagos). Un apartado nunca genera un registro en
  // Venta, así que ese dinero no sale en "ventas" de arriba — pero sí ya
  // está sumado dentro de porMetodoPago/porCuentaTransferencia y de
  // efectivoEnCaja (ver backend), este bloque es solo el detalle para
  // auditar de qué apartado/cliente vino cada abono.
  anticipos: {
    cantidad: number;
    total: number;
    porMetodoPago: Record<string, number>;
    detalle: AnticipoApartadoCorte[];
  };
  gastos: {
    cantidad: number;
    total: number;
    porMetodoPago: Record<string, number>;
    porProveedor: TotalProveedor[];
    detalle: GastoCorteDia[];
  };
  efectivoEnCaja: number;
}

function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA_NEGOCIO });
}

function etiquetaMetodoPagoSimple(v: VentaResumen['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
}

function etiquetaMetodoPago(venta: Pick<VentaResumen, 'metodoPago' | 'pagoMixto' | 'pagos'>) {
  if (venta.pagoMixto && venta.pagos?.length) {
    return `Combinado (${venta.pagos.map((p) => etiquetaMetodoPagoSimple(p.metodoPago)).join(' + ')})`;
  }
  return etiquetaMetodoPagoSimple(venta.metodoPago);
}

export default function CorteDelDiaPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [corte, setCorte] = useState<CorteDia | null>(null);
  const [cargando, setCargando] = useState(false);
  // Colapsados por defecto: el detalle por proveedor/producto es útil para
  // revisar algo puntual, pero no hace falta verlo cada vez que se abre el
  // corte del día — con las métricas de arriba (total, efectivo, tarjeta)
  // suele bastar.
  const [mostrarProveedores, setMostrarProveedores] = useState(false);
  const [mostrarProductos, setMostrarProductos] = useState(false);
  const [mostrarGastos, setMostrarGastos] = useState(false);
  const [mostrarAnticipos, setMostrarAnticipos] = useState(false);

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
            <MetricCard title="Total general" value={formatoMonedaExacto(corte.totalGeneral)} icon={DollarSign} />
            <MetricCard title="Efectivo" value={formatoMonedaExacto(corte.porMetodoPago.EFECTIVO || 0)} icon={Banknote} />
            <MetricCard title="Tarjeta" value={formatoMonedaExacto(corte.porMetodoPago.TARJETA || 0)} icon={CreditCard} />
          </div>

          {corte.saldoAplicadoTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              De lo anterior, {formatoMonedaExacto(corte.saldoAplicadoTotal)} se cubrieron con saldo a favor de
              clientes (ya descontado de Efectivo/Tarjeta/Transferencias arriba — ese dinero no entró hoy).
            </p>
          )}

          <div className="card">
            <h2 className="text-base font-semibold mb-3">
              Transferencias — {formatoMonedaExacto(corte.porMetodoPago.TRANSFERENCIA || 0)}
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
                      <td className="tabular-nums font-medium">{formatoMonedaExacto(monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Anticipos y abonos de apartados — {formatoMonedaExacto(corte.anticipos.total)}
              </h2>
              <div className="flex items-center gap-2">
                {puedeVer('apartados', usuario?.rol) && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/apartados">
                      <Coins className="w-3.5 h-3.5" />
                      Ver apartados
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setMostrarAnticipos((v) => !v)}>
                  {mostrarAnticipos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {mostrarAnticipos ? 'Ocultar detalle' : 'Ver detalle'}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Dinero cobrado hoy como anticipo o abono de un apartado (no es una venta todavía, pero sí entró a caja) —
              ya está incluido en Efectivo/Tarjeta/Transferencias de arriba y en el efectivo en caja de abajo.
            </p>
            {mostrarAnticipos && (
              corte.anticipos.detalle.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin anticipos ni abonos de apartados este día.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Apartado</th>
                        <th>Cliente</th>
                        <th>Monto</th>
                        <th>Método</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corte.anticipos.detalle.map((a) => (
                        <tr key={a.id}>
                          <td className="font-medium">{a.apartadoFolio || '—'}</td>
                          <td>{a.cliente || '—'}</td>
                          <td className="tabular-nums font-medium">{formatoMonedaExacto(a.monto)}</td>
                          <td className="text-xs">
                            {a.metodoPago === 'EFECTIVO' ? 'Efectivo' : a.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                            {a.cuenta ? ` (${a.cuenta})` : ''}
                          </td>
                          <td className="text-xs text-muted-foreground">{formatearHora(a.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Gastos del día — {formatoMonedaExacto(corte.gastos.total)}
              </h2>
              <div className="flex items-center gap-2">
                {puedeVer('gastos', usuario?.rol) && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/dashboard/gastos">
                      <Wallet className="w-3.5 h-3.5" />
                      Registrar
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setMostrarGastos((v) => !v)}>
                  {mostrarGastos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {mostrarGastos ? 'Ocultar detalle' : 'Ver detalle'}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Efectivo vendido menos efectivo gastado hoy — referencia para cuadrar el cajón:{' '}
              <span className="font-medium text-foreground">{formatoMonedaExacto(corte.efectivoEnCaja)}</span>
            </p>
            {mostrarGastos && (
              corte.gastos.detalle.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin gastos registrados este día.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Motivo</th>
                        <th>Proveedor(es)</th>
                        <th>Monto</th>
                        <th>Método</th>
                        <th>Registró</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corte.gastos.detalle.map((g) => (
                        <tr key={g.id}>
                          <td className="font-medium">{g.motivo}</td>
                          <td className="text-sm">
                            {g.nivel === 'SUCURSAL' ? (
                              <StatusBadge tono="neutral" withDot={false}>
                                Sucursal · {g.proveedores.length} proveedores
                              </StatusBadge>
                            ) : (
                              g.proveedores[0]?.proveedor.nombre || '—'
                            )}
                          </td>
                          <td className="tabular-nums font-medium">{formatoMonedaExacto(g.monto)}</td>
                          <td className="text-xs">
                            {g.metodoPago === 'EFECTIVO' ? 'Efectivo' : g.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                          </td>
                          <td className="text-sm">{g.registradoPor?.nombre}</td>
                          <td className="text-xs text-muted-foreground">{formatearHora(g.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Total por proveedor {corte.porProveedor.length > 0 && `(${corte.porProveedor.length})`}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setMostrarProveedores((v) => !v)}>
                {mostrarProveedores ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {mostrarProveedores ? 'Ocultar detalle' : 'Ver detalle'}
              </Button>
            </div>
            {mostrarProveedores && (
              corte.porProveedor.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin ventas con proveedor asignado este día.</p>
              ) : (
                <table className="mt-3">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Artículos</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corte.porProveedor.map((p) => (
                      <tr key={p.proveedorId ?? 'sin-proveedor'}>
                        <td>{p.proveedorNombre}</td>
                        <td className="tabular-nums">{p.cantidad}</td>
                        <td className="tabular-nums font-medium">{formatoMonedaExacto(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Productos vendidos {corte.productosVendidos.length > 0 && `(${corte.productosVendidos.length})`}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setMostrarProductos((v) => !v)}>
                {mostrarProductos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {mostrarProductos ? 'Ocultar detalle' : 'Ver detalle'}
              </Button>
            </div>
            {mostrarProductos && (
              corte.productosVendidos.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin productos vendidos este día.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Producto</th>
                        <th>Talla</th>
                        <th>Proveedor</th>
                        <th>Cantidad</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corte.productosVendidos.map((p) => (
                        <tr
                          key={`${p.productoId ?? `libre-${p.nombre}`}-${p.talla ?? 'sin-talla'}-${p.proveedorId ?? 'sin-proveedor'}`}
                        >
                          <td>
                            <ProductoThumb url={imagenMiniatura(p.imagenUrl ?? undefined)} alt={p.nombre} size={36} />
                          </td>
                          <td className="font-medium">
                            {p.nombre}
                            {p.esLibre && (
                              <StatusBadge tono="warning" withDot={false} className="ml-2 align-middle">
                                No registrado
                              </StatusBadge>
                            )}
                          </td>
                          <td className="text-sm">{p.talla ?? '—'}</td>
                          <td className="text-sm">{p.proveedorNombre}</td>
                          <td className="tabular-nums">{p.cantidad}</td>
                          <td className="tabular-nums font-medium">{formatoMonedaExacto(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {corte.canceladas.cantidad > 0 && (
            <p className="text-sm text-muted-foreground">
              {corte.canceladas.cantidad} venta(s) cancelada(s) este día por {formatoMonedaExacto(corte.canceladas.total)} (no se incluyen en los totales de arriba).
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
                    <td className="tabular-nums font-medium">{formatoMonedaExacto(v.total)}</td>
                    <td className="text-xs">
                      {etiquetaMetodoPago(v)}
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
