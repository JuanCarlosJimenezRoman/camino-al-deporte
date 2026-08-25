'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatearFechaHora, formatoMonedaExacto } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from '@/components/ui/drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

interface GastoProveedorRow {
  proveedorId: number;
  monto: string;
  proveedor: { id: number; nombre: string };
}

interface Gasto {
  id: number;
  sucursal: { id: number; nombre: string };
  nivel: 'PROVEEDOR' | 'SUCURSAL';
  motivo: string;
  monto: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  notas: string | null;
  registradoPor: { nombre: string };
  createdAt: string;
  proveedores: GastoProveedorRow[];
}

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

function etiquetaMetodoPago(v: Gasto['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
}

function formVacio() {
  return {
    motivo: '',
    sucursalId: '',
    nivel: 'PROVEEDOR' as 'PROVEEDOR' | 'SUCURSAL',
    proveedorId: '',
    monto: '',
    proveedorIds: [] as number[],
    montoTotal: '',
    metodoPago: 'EFECTIVO' as Gasto['metodoPago'],
    notas: '',
  };
}

export default function GastosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [cargando, setCargando] = useState(false);

  const [filtroSucursalId, setFiltroSucursalId] = useState('');
  const [filtroProveedorId, setFiltroProveedorId] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(formVacio());
  const [guardando, setGuardando] = useState(false);

  const [aEliminar, setAEliminar] = useState<Gasto | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const [expandidoId, setExpandidoId] = useState<number | null>(null);

  useEffect(() => {
    if (esAdmin) api<Sucursal[]>('/sucursales').then(setSucursales).catch(() => {});
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (esAdmin && filtroSucursalId) qs.set('sucursalId', filtroSucursalId);
      if (filtroProveedorId) qs.set('proveedorId', filtroProveedorId);
      if (filtroFechaInicio) qs.set('fechaInicio', filtroFechaInicio);
      if (filtroFechaFin) qs.set('fechaFin', filtroFechaFin);
      const data = await api<{ gastos: Gasto[]; totalGeneral: number }>(`/gastos?${qs.toString()}`);
      setGastos(data.gastos);
      setTotalGeneral(data.totalGeneral);
    } catch (err) {
      toast({
        title: 'No se pudieron cargar los gastos',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSucursalId, filtroProveedorId, filtroFechaInicio, filtroFechaFin]);

  function abrirNuevo() {
    setForm(formVacio());
    setDrawerOpen(true);
  }

  function toggleProveedorSeleccionado(id: number) {
    setForm((f) => ({
      ...f,
      proveedorIds: f.proveedorIds.includes(id) ? f.proveedorIds.filter((x) => x !== id) : [...f.proveedorIds, id],
    }));
  }

  const previewReparto = useMemo(() => {
    const total = Number(form.montoTotal);
    if (!total || form.proveedorIds.length === 0) return null;
    return total / form.proveedorIds.length;
  }, [form.montoTotal, form.proveedorIds]);

  async function guardarGasto() {
    if (!form.motivo.trim()) {
      toast({ title: 'Falta el motivo del gasto', variant: 'destructive' });
      return;
    }
    if (esAdmin && !form.sucursalId) {
      toast({ title: 'Selecciona la sucursal', variant: 'destructive' });
      return;
    }

    const datos: Record<string, unknown> = {
      motivo: form.motivo.trim(),
      metodoPago: form.metodoPago,
      notas: form.notas || undefined,
      nivel: form.nivel,
    };
    if (esAdmin && form.sucursalId) datos.sucursalId = Number(form.sucursalId);

    if (form.nivel === 'PROVEEDOR') {
      if (!form.proveedorId) {
        toast({ title: 'Selecciona el proveedor', variant: 'destructive' });
        return;
      }
      const monto = Number(form.monto);
      if (!monto || monto <= 0) {
        toast({ title: 'Captura un monto válido', variant: 'destructive' });
        return;
      }
      datos.proveedorId = Number(form.proveedorId);
      datos.monto = monto;
    } else {
      if (form.proveedorIds.length < 2) {
        toast({
          title: 'Selecciona al menos dos proveedores',
          description: 'Si el gasto es de un solo proveedor, usa el nivel "Un proveedor".',
          variant: 'destructive',
        });
        return;
      }
      const montoTotal = Number(form.montoTotal);
      if (!montoTotal || montoTotal <= 0) {
        toast({ title: 'Captura el monto total del gasto', variant: 'destructive' });
        return;
      }
      datos.proveedorIds = form.proveedorIds;
      datos.montoTotal = montoTotal;
    }

    setGuardando(true);
    try {
      await api('/gastos', { method: 'POST', body: JSON.stringify(datos) });
      toast({ title: 'Gasto registrado', variant: 'success' });
      setDrawerOpen(false);
      cargar();
    } catch (err) {
      toast({
        title: 'No se pudo registrar el gasto',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await api(`/gastos/${aEliminar.id}`, { method: 'DELETE' });
      toast({ title: 'Gasto eliminado', variant: 'success' });
      setAEliminar(null);
      cargar();
    } catch (err) {
      toast({
        title: 'No se pudo eliminar',
        description: err instanceof ApiError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setEliminando(false);
    }
  }

  const totalColumnas = esAdmin ? 9 : 7;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Gastos"
        subtitle="Salidas de dinero por sucursal y proveedor"
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/dashboard/ventas' },
          { label: 'Gastos' },
        ]}
        actions={
          <Button size="sm" onClick={abrirNuevo}>
            <Plus className="w-4 h-4" />
            Nuevo gasto
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {esAdmin && (
          <div className="w-48">
            <Select value={filtroSucursalId} onChange={(e) => setFiltroSucursalId(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-48">
          <Select value={filtroProveedorId} onChange={(e) => setFiltroProveedorId(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">Del</span>
        <Input type="date" value={filtroFechaInicio} onChange={(e) => setFiltroFechaInicio(e.target.value)} className="w-40" />
        <span className="text-xs text-muted-foreground">al</span>
        <Input type="date" value={filtroFechaFin} onChange={(e) => setFiltroFechaFin(e.target.value)} className="w-40" />
      </div>

      {!cargando && gastos.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {gastos.length} gasto(s) — total{' '}
          <span className="font-semibold text-foreground">{formatoMonedaExacto(totalGeneral)}</span>
        </p>
      )}

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : gastos.length === 0 ? (
        <EmptyState icon={Wallet} title="Sin gastos registrados" description="Todavía no hay gastos con estos filtros." />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Fecha</th>
                {esAdmin && <th>Sucursal</th>}
                <th>Motivo</th>
                <th>Proveedor(es)</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Registró</th>
                {esAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <GastoFila
                  key={g.id}
                  gasto={g}
                  esAdmin={esAdmin}
                  totalColumnas={totalColumnas}
                  expandido={expandidoId === g.id}
                  onToggle={() => setExpandidoId((id) => (id === g.id ? null : g.id))}
                  onEliminar={() => setAEliminar(g)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Nuevo gasto</DrawerTitle>
            <DrawerDescription>
              Un gasto de un solo proveedor usa el nivel &quot;Un proveedor&quot;; uno general de la sucursal (renta, luz,
              papelería...) usa &quot;Sucursal&quot; y se reparte en partes iguales entre los proveedores que selecciones.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            <div>
              <label className="text-sm">Motivo</label>
              <Input
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Ej. Envío de mercancía, papelería, luz..."
              />
            </div>

            {esAdmin && (
              <div>
                <label className="text-sm">Sucursal</label>
                <Select value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}>
                  <option value="">Selecciona una sucursal</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {!esAdmin && usuario?.sucursal && (
              <p className="text-sm text-muted-foreground">Sucursal: {usuario.sucursal.nombre}</p>
            )}

            <div>
              <label className="text-sm">Nivel del gasto</label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={form.nivel === 'PROVEEDOR' ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, nivel: 'PROVEEDOR' })}
                >
                  Un proveedor
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.nivel === 'SUCURSAL' ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, nivel: 'SUCURSAL' })}
                >
                  Sucursal (dividir)
                </Button>
              </div>
            </div>

            {form.nivel === 'PROVEEDOR' ? (
              <>
                <div>
                  <label className="text-sm">Proveedor</label>
                  <Select value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}>
                    <option value="">Selecciona un proveedor</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-sm">Monto</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm">Proveedores entre los que se divide</label>
                  <div className="mt-1 space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
                    {proveedores.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-0.5">
                        <input
                          type="checkbox"
                          checked={form.proveedorIds.includes(p.id)}
                          onChange={() => toggleProveedorSeleccionado(p.id)}
                        />
                        {p.nombre}
                      </label>
                    ))}
                    {proveedores.length === 0 && (
                      <p className="text-sm text-muted-foreground">Sin proveedores registrados.</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm">Monto total</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.montoTotal}
                    onChange={(e) => setForm({ ...form, montoTotal: e.target.value })}
                  />
                  {previewReparto !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatoMonedaExacto(previewReparto)} por proveedor ({form.proveedorIds.length})
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="text-sm">Método de pago</label>
              <Select
                value={form.metodoPago}
                onChange={(e) => setForm({ ...form, metodoPago: e.target.value as Gasto['metodoPago'] })}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-sm">Notas (opcional)</label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className="flex w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary"
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardarGasto} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Registrar gasto'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={!!aEliminar}
        onOpenChange={(open) => !open && setAEliminar(null)}
        title="¿Eliminar este gasto?"
        description={aEliminar ? `${aEliminar.motivo} — ${formatoMonedaExacto(aEliminar.monto)}` : undefined}
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminar}
        loading={eliminando}
      />
    </div>
  );
}

function GastoFila({
  gasto,
  esAdmin,
  totalColumnas,
  expandido,
  onToggle,
  onEliminar,
}: {
  gasto: Gasto;
  esAdmin: boolean;
  totalColumnas: number;
  expandido: boolean;
  onToggle: () => void;
  onEliminar: () => void;
}) {
  const dividido = gasto.nivel === 'SUCURSAL';
  return (
    <>
      <tr>
        <td>
          {dividido && (
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
              {expandido ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </td>
        <td className="text-xs text-muted-foreground whitespace-nowrap">{formatearFechaHora(gasto.createdAt)}</td>
        {esAdmin && <td>{gasto.sucursal.nombre}</td>}
        <td className="font-medium">{gasto.motivo}</td>
        <td className="text-sm">
          {dividido ? (
            <StatusBadge tono="neutral" withDot={false}>
              Sucursal · {gasto.proveedores.length} proveedores
            </StatusBadge>
          ) : (
            gasto.proveedores[0]?.proveedor.nombre || '—'
          )}
        </td>
        <td className="tabular-nums font-medium">{formatoMonedaExacto(gasto.monto)}</td>
        <td className="text-xs">{etiquetaMetodoPago(gasto.metodoPago)}</td>
        <td className="text-sm">{gasto.registradoPor?.nombre}</td>
        {esAdmin && (
          <td>
            <button onClick={onEliminar} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </td>
        )}
      </tr>
      {dividido && expandido && (
        <tr>
          <td colSpan={totalColumnas}>
            <div className="px-3 py-2 bg-secondary/40 rounded-lg text-sm space-y-1">
              {gasto.proveedores.map((gp) => (
                <div key={gp.proveedorId} className="flex justify-between">
                  <span>{gp.proveedor.nombre}</span>
                  <span className="tabular-nums">{formatoMonedaExacto(gp.monto)}</span>
                </div>
              ))}
              {gasto.notas && <p className="mt-2 text-muted-foreground italic">{gasto.notas}</p>}
            </div>
          </td>
        </tr>
      )}
      {!dividido && gasto.notas && (
        <tr>
          <td></td>
          <td colSpan={totalColumnas - 1} className="text-xs text-muted-foreground italic pb-2">
            {gasto.notas}
          </td>
        </tr>
      )}
    </>
  );
}
