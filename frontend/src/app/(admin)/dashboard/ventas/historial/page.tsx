'use client';

import { useEffect, useState } from 'react';
import { DollarSign, History, Pencil, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatearFechaHora, formatoMonedaExacto } from '@/lib/utils';
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
import { toast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter } from '@/components/ui/drawer';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
}

interface VentaItem {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  variante: {
    id: number;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
}

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  clienteTelefono: string | null;
  total: string;
  estado: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  cuentaTransferenciaId: number | null;
  descuentoTipo: 'PORCENTAJE' | 'MONTO' | null;
  descuentoValor: string | null;
  descuentoMotivo: string | null;
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

interface VentaEdicionRegistro {
  id: number;
  motivo: string;
  createdAt: string;
  usuario: { nombre: string };
  cambios: {
    venta?: Record<string, { antes: unknown; despues: unknown }>;
    items?: { itemId: number; varianteId: number; antes: Record<string, unknown>; despues: Record<string, unknown> }[];
    advertencias?: string[];
  };
}

interface FormItem {
  id: number;
  varianteId: number;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  proveedorId: string;
}

const ESTADO_TONO: Record<string, 'success' | 'destructive' | 'neutral'> = {
  COMPLETADA: 'success',
  CANCELADA: 'destructive',
};

const ETIQUETAS_CAMPO: Record<string, string> = {
  cliente: 'Cliente',
  clienteTelefono: 'Teléfono',
  metodoPago: 'Método de pago',
  cuentaTransferenciaId: 'Cuenta de transferencia',
  descuentoTipo: 'Tipo de descuento',
  descuentoValor: 'Valor del descuento',
  descuentoMotivo: 'Motivo del descuento',
  total: 'Total',
};

function etiquetaMetodoPago(v: Venta['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
}

function valorLegible(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return formatoMonedaExacto(v);
  return String(v);
}

export default function HistorialVentasPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [cargando, setCargando] = useState(false);

  // --- Edición de una venta (solo administradores) ---
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [ventaEditando, setVentaEditando] = useState<Venta | null>(null);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [formCliente, setFormCliente] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formMetodoPago, setFormMetodoPago] = useState<Venta['metodoPago']>('EFECTIVO');
  const [formCuentaId, setFormCuentaId] = useState('');
  const [formAplicarDescuento, setFormAplicarDescuento] = useState(false);
  const [formDescuentoTipo, setFormDescuentoTipo] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [formDescuentoValor, setFormDescuentoValor] = useState('');
  const [formDescuentoMotivo, setFormDescuentoMotivo] = useState('');
  const [formMotivo, setFormMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [ediciones, setEdiciones] = useState<VentaEdicionRegistro[]>([]);
  const [cargandoEdiciones, setCargandoEdiciones] = useState(false);

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

  async function abrirEdicion(venta: Venta) {
    setVentaEditando(venta);
    setErrorForm('');
    setFormMotivo('');
    setFormCliente(venta.cliente || '');
    setFormTelefono(venta.clienteTelefono || '');
    setFormMetodoPago(venta.metodoPago);
    setFormCuentaId(venta.cuentaTransferenciaId ? String(venta.cuentaTransferenciaId) : '');
    setFormAplicarDescuento(!!venta.descuentoTipo);
    setFormDescuentoTipo(venta.descuentoTipo || 'PORCENTAJE');
    setFormDescuentoValor(venta.descuentoValor || '');
    setFormDescuentoMotivo(venta.descuentoMotivo || '');
    setFormItems(
      venta.items.map((it) => ({
        id: it.id,
        varianteId: it.variante.id,
        descripcion: `${it.variante.producto.nombre}${it.variante.talla ? ` (${it.variante.talla.valor}${it.variante.color ? ` / ${it.variante.color}` : ''})` : ''}`,
        cantidad: String(it.cantidad),
        precioUnitario: it.precioUnitario,
        proveedorId: it.proveedorId ? String(it.proveedorId) : '',
      }))
    );

    if (proveedores.length === 0) api<Proveedor[]>('/proveedores?todas=1').then(setProveedores);
    if (cuentas.length === 0) api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);

    setCargandoEdiciones(true);
    setEdiciones([]);
    try {
      const data = await api<VentaEdicionRegistro[]>(`/ventas/${venta.id}/ediciones`);
      setEdiciones(data);
    } catch {
      // No es crítico para poder editar — si falla, simplemente no se
      // muestra el historial previo de cambios.
    } finally {
      setCargandoEdiciones(false);
    }
  }

  function cerrarEdicion() {
    setVentaEditando(null);
  }

  function actualizarItem(id: number, campo: keyof FormItem, valor: string) {
    setFormItems((items) => items.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)));
  }

  const totalFormPreview = formItems.reduce((acc, it) => {
    const cantidad = Number(it.cantidad) || 0;
    const precio = Number(it.precioUnitario) || 0;
    return acc + cantidad * precio;
  }, 0);
  const descuentoPreview = formAplicarDescuento
    ? formDescuentoTipo === 'PORCENTAJE'
      ? (totalFormPreview * (Number(formDescuentoValor) || 0)) / 100
      : Number(formDescuentoValor) || 0
    : 0;

  async function guardarEdicion() {
    if (!ventaEditando) return;
    setErrorForm('');

    if (formMotivo.trim().length < 5) {
      setErrorForm('Escribe un motivo de al menos 5 caracteres explicando la corrección.');
      return;
    }
    if (formMetodoPago === 'TRANSFERENCIA' && !formCuentaId) {
      setErrorForm('Selecciona la cuenta que recibió la transferencia.');
      return;
    }
    if (formItems.some((it) => !it.cantidad || Number(it.cantidad) <= 0)) {
      setErrorForm('La cantidad de cada artículo debe ser mayor a 0.');
      return;
    }
    if (formAplicarDescuento && (!formDescuentoValor || Number(formDescuentoValor) <= 0)) {
      setErrorForm('Captura el valor del descuento, o desmarca la casilla si ya no aplica.');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        motivo: formMotivo.trim(),
        cliente: formCliente || null,
        clienteTelefono: formTelefono || null,
        metodoPago: formMetodoPago,
        cuentaTransferenciaId: formMetodoPago === 'TRANSFERENCIA' ? Number(formCuentaId) : null,
        descuentoTipo: formAplicarDescuento ? formDescuentoTipo : null,
        descuentoValor: formAplicarDescuento ? Number(formDescuentoValor) : null,
        descuentoMotivo: formAplicarDescuento ? formDescuentoMotivo || null : null,
        items: formItems.map((it) => ({
          id: it.id,
          cantidad: Number(it.cantidad),
          precioUnitario: Number(it.precioUnitario),
          proveedorId: it.proveedorId ? Number(it.proveedorId) : null,
        })),
      };
      const respuesta = await api<{ venta: Venta; advertencias: string[] }>(`/ventas/${ventaEditando.id}/editar`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      toast({
        title: 'Venta corregida',
        description: respuesta.advertencias.length > 0 ? respuesta.advertencias.join(' ') : undefined,
        variant: respuesta.advertencias.length > 0 ? 'warning' : 'success',
      });
      setVentaEditando(null);
      cargar();
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : 'No se pudo guardar la corrección.');
    } finally {
      setGuardando(false);
    }
  }

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
          <MetricCard title="Total del periodo" value={formatoMonedaExacto(historial.resumen.totalGeneral)} icon={DollarSign} />

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
                    <td className="tabular-nums font-medium">{formatoMonedaExacto(r.total)}</td>
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
                  {esAdmin && <th></th>}
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
                      <td className="font-medium tabular-nums">{formatoMonedaExacto(v.total)}</td>
                      <td className="text-xs">
                        {etiquetaMetodoPago(v.metodoPago)}
                        {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                      </td>
                      <td>
                        <StatusBadge tono={ESTADO_TONO[v.estado] ?? 'neutral'}>{v.estado}</StatusBadge>
                      </td>
                      <td>{v.usuario?.nombre}</td>
                      <td className="text-xs text-muted-foreground">{formatearFechaHora(v.createdAt)}</td>
                      {esAdmin && (
                        <td>
                          {v.estado === 'COMPLETADA' && (
                            <Button variant="ghost" size="sm" onClick={() => abrirEdicion(v)}>
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </>
      ) : null}

      <Drawer open={!!ventaEditando} onOpenChange={(open) => !open && cerrarEdicion()}>
        <DrawerContent widthClassName="max-w-xl">
          {ventaEditando && (
            <>
              <DrawerHeader>
                <DrawerTitle>Editar venta {ventaEditando.folio}</DrawerTitle>
                <DrawerDescription>
                  Corrige datos capturados mal (proveedor, cantidad, precio, pago, descuento). El motivo queda
                  guardado en un registro de auditoría — no se puede cambiar la sucursal ni agregar/quitar artículos.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerBody className="space-y-4">
                <div className="space-y-3 border-b border-border pb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Artículos</p>
                  {formItems.map((it) => (
                    <div key={it.id} className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-sm font-medium">{it.descripcion}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label>Cantidad</label>
                          <Input
                            type="number"
                            min={1}
                            value={it.cantidad}
                            onChange={(e) => actualizarItem(it.id, 'cantidad', e.target.value)}
                          />
                        </div>
                        <div>
                          <label>Precio unitario</label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={it.precioUnitario}
                            onChange={(e) => actualizarItem(it.id, 'precioUnitario', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label>Proveedor</label>
                        <Select value={it.proveedorId} onChange={(e) => actualizarItem(it.id, 'proveedorId', e.target.value)}>
                          <option value="">Sin proveedor</option>
                          {proveedores.map((p) => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-b border-border pb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente y pago</p>
                  <div>
                    <label>Cliente (opcional)</label>
                    <Input value={formCliente} onChange={(e) => setFormCliente(e.target.value)} />
                  </div>
                  <div>
                    <label>Teléfono del cliente (opcional)</label>
                    <Input value={formTelefono} onChange={(e) => setFormTelefono(e.target.value)} />
                  </div>
                  <div>
                    <label>Método de pago</label>
                    <Select value={formMetodoPago} onChange={(e) => setFormMetodoPago(e.target.value as Venta['metodoPago'])}>
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </Select>
                  </div>
                  {formMetodoPago === 'TRANSFERENCIA' && (
                    <div>
                      <label>Cuenta que recibió el pago</label>
                      <Select value={formCuentaId} onChange={(e) => setFormCuentaId(e.target.value)}>
                        <option value="">Selecciona...</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre} {c.banco ? `(${c.banco})` : ''}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-b border-border pb-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={formAplicarDescuento} onChange={(e) => setFormAplicarDescuento(e.target.checked)} />
                    Aplicar descuento
                  </label>
                  {formAplicarDescuento && (
                    <div className="space-y-2 pl-1">
                      <div className="flex gap-2">
                        <div className="w-20">
                          <Select value={formDescuentoTipo} onChange={(e) => setFormDescuentoTipo(e.target.value as 'PORCENTAJE' | 'MONTO')}>
                            <option value="PORCENTAJE">%</option>
                            <option value="MONTO">$</option>
                          </Select>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={formDescuentoValor}
                          onChange={(e) => setFormDescuentoValor(e.target.value)}
                          placeholder={formDescuentoTipo === 'PORCENTAJE' ? 'Ej. 10' : 'Ej. 100.00'}
                        />
                      </div>
                      <Input value={formDescuentoMotivo} onChange={(e) => setFormDescuentoMotivo(e.target.value)} placeholder="Motivo del descuento (opcional)" />
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Nuevo total: <span className="font-semibold text-foreground">{formatoMonedaExacto(Math.max(totalFormPreview - descuentoPreview, 0))}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <label>Motivo de la corrección (obligatorio)</label>
                  <textarea
                    value={formMotivo}
                    onChange={(e) => setFormMotivo(e.target.value)}
                    rows={2}
                    style={{ resize: 'vertical' }}
                    placeholder="Ej. se registró con el proveedor equivocado, era Proveedor X no Proveedor Y"
                  />
                </div>

                {errorForm && <p className="text-sm text-destructive">{errorForm}</p>}

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial de cambios</p>
                  {cargandoEdiciones ? (
                    <Skeleton className="h-16 w-full" />
                  ) : ediciones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Esta venta no se ha corregido antes.</p>
                  ) : (
                    <div className="space-y-2">
                      {ediciones.map((ed) => (
                        <div key={ed.id} className="rounded-lg border border-border p-3 text-sm space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {formatearFechaHora(ed.createdAt)} — {ed.usuario?.nombre}
                          </p>
                          <p className="font-medium">{ed.motivo}</p>
                          {ed.cambios?.venta && Object.keys(ed.cambios.venta).length > 0 && (
                            <ul className="text-xs text-muted-foreground list-disc pl-4">
                              {Object.entries(ed.cambios.venta).map(([campo, cambio]) => (
                                <li key={campo}>
                                  {ETIQUETAS_CAMPO[campo] || campo}: {valorLegible(cambio.antes)} → {valorLegible(cambio.despues)}
                                </li>
                              ))}
                            </ul>
                          )}
                          {ed.cambios?.items && ed.cambios.items.length > 0 && (
                            <p className="text-xs text-muted-foreground">{ed.cambios.items.length} artículo(s) corregido(s).</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="secondary" onClick={cerrarEdicion} disabled={guardando}>
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </Button>
                <Button onClick={guardarEdicion} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar corrección'}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
