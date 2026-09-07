'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCcw,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  CreditCard,
  Landmark,
  User,
  Receipt,
  X,
} from 'lucide-react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { formatoMonedaExacto, formatearFechaHora } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Motivo = 'DEFECTUOSO' | 'NO_LE_GUSTO' | 'NO_QUEDO';
type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

const MOTIVOS: { value: Motivo; label: string }[] = [
  { value: 'DEFECTUOSO', label: 'Producto defectuoso' },
  { value: 'NO_LE_GUSTO', label: 'No le gustó' },
  { value: 'NO_QUEDO', label: 'No le quedó (talla)' },
];

interface Sucursal {
  id: number;
  nombre: string;
}

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
}

// Un renglón por (variante, proveedor, sucursal) — mismo shape que regresa
// GET /inventario/existencias (ver frontend/.../ventas/page.tsx).
interface Existencia {
  id: number | null;
  sucursalId: number;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: {
      id: number;
      nombre: string;
      precioVenta: string;
    };
  };
}

interface VentaItemLite {
  id: number;
  cantidad: number;
  precioUnitario: string;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string };
  } | null;
  descripcionLibre?: string | null;
  proveedor?: { id: number; nombre: string } | null;
}

interface VentaLista {
  id: number;
  folio: string;
  cliente: string | null;
  clienteTelefono: string | null;
  sucursal: { nombre: string };
  estado: string;
  items: VentaItemLite[];
}

interface CambioItemResp {
  id: number;
  direccion: 'DEVUELTO' | 'ENTREGADO';
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  motivo: Motivo | null;
  motivoDetalle: string | null;
  reingresado: boolean;
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string };
  };
  proveedor: { id: number; nombre: string } | null;
}

interface Cambio {
  id: number;
  folio: string;
  cliente: string | null;
  clienteTelefono: string | null;
  totalDevuelto: string;
  totalNuevo: string;
  diferencia: string;
  metodoPago: MetodoPago | null;
  cuentaTransferencia: { nombre: string } | null;
  comprobanteUrl: string | null;
  efectivoRecibido: string | null;
  notas: string | null;
  estado: 'COMPLETADO' | 'CANCELADO';
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { id: number; nombre: string };
  ventaOrigen: { id: number; folio: string } | null;
  items: CambioItemResp[];
}

// Renglón local del carrito de "producto devuelto".
interface FilaDevuelto {
  key: string;
  varianteId: number;
  sku: string;
  nombre: string;
  talla: string | null;
  color: string | null;
  proveedorId: number | null;
  cantidad: number;
  precioUnitario: number;
  motivo: Motivo | '';
  motivoDetalle: string;
}

// Renglón local del carrito de "producto nuevo".
interface FilaNueva {
  key: string;
  varianteId: number;
  sku: string;
  nombre: string;
  talla: string | null;
  color: string | null;
  proveedorId: number | null;
  stockDisponible: number;
  cantidad: number;
  precioUnitario: number;
}

let contadorKey = 0;
function nuevaKey() {
  contadorKey += 1;
  return `k${contadorKey}`;
}

function nombreExistencia(e: Existencia) {
  const detalle = [e.variante.talla?.valor, e.variante.color].filter(Boolean).join('/');
  return `${e.variante.producto.nombre}${detalle ? ` (${detalle})` : ''}`;
}

// ---------------------------------------------------------------------------
// Buscador de producto reutilizable (devuelto o nuevo)
// ---------------------------------------------------------------------------

function BuscadorProducto({
  sucursalId,
  soloConStock,
  placeholder,
  onSeleccionar,
}: {
  sucursalId: string;
  soloConStock: boolean;
  placeholder: string;
  onSeleccionar: (e: Existencia) => void;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Existencia[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!sucursalId || texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sucursalId, skuOProducto: texto.trim() });
        const data = await api<Existencia[]>(`/inventario/existencias?${params.toString()}`);
        if (!cancelado) {
          setResultados(soloConStock ? data.filter((e) => e.stockActual > 0) : data);
        }
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [texto, sucursalId, soloConStock]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          disabled={!sucursalId}
        />
      </div>
      {texto.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-card">
          {buscando && <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>}
          {!buscando && resultados.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</div>
          )}
          {!buscando &&
            resultados.map((r, i) => (
              <button
                key={`${r.variante.id}-${r.proveedorId ?? 'x'}-${i}`}
                type="button"
                onClick={() => {
                  onSeleccionar(r);
                  setTexto('');
                  setResultados([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span className="truncate">{nombreExistencia(r)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {soloConStock ? `${r.stockActual} disp.` : r.variante.sku}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function CambiosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';
  const sucursalBloqueada = !esAdmin;

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);

  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [cargandoCambios, setCargandoCambios] = useState(true);

  // Venta original (opcional): se buscan por folio entre las ventas que ya
  // se cargaron de esta sucursal (mismo criterio que el historial de
  // ventas: sin pedir un endpoint nuevo).
  const [ventas, setVentas] = useState<VentaLista[]>([]);
  const [folioBuscado, setFolioBuscado] = useState('');
  const ventaEncontrada = useMemo(() => {
    const termino = folioBuscado.trim().toUpperCase();
    if (!termino) return null;
    return ventas.find((v) => v.folio.toUpperCase().includes(termino)) || null;
  }, [folioBuscado, ventas]);

  const [cliente, setCliente] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [notas, setNotas] = useState('');

  const [devueltos, setDevueltos] = useState<FilaDevuelto[]>([]);
  const [nuevos, setNuevos] = useState<FilaNueva[]>([]);

  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [efectivoRecibido, setEfectivoRecibido] = useState('');

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [cambioACancelar, setCambioACancelar] = useState<Cambio | null>(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarCambios() {
    setCargandoCambios(true);
    try {
      const data = await api<Cambio[]>('/cambios');
      setCambios(data);
    } finally {
      setCargandoCambios(false);
    }
  }

  async function cargarVentas() {
    const data = await api<VentaLista[]>('/ventas');
    setVentas(data);
  }

  useEffect(() => {
    cargarCambios();
    cargarVentas();
    // Los carritos son de una sucursal concreta (existencias/stock de esa
    // sucursal) — al cambiar de sucursal ya no aplican.
    setDevueltos([]);
    setNuevos([]);
    setFolioBuscado('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  // ---------------------------------------------------------------------
  // Carrito: producto devuelto
  // ---------------------------------------------------------------------

  function agregarDevuelto(e: Existencia) {
    setDevueltos((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        varianteId: e.variante.id,
        sku: e.variante.sku,
        nombre: e.variante.producto.nombre,
        talla: e.variante.talla?.valor || null,
        color: e.variante.color,
        proveedorId: e.proveedorId,
        cantidad: 1,
        precioUnitario: Number(e.variante.producto.precioVenta),
        motivo: '',
        motivoDetalle: '',
      },
    ]);
  }

  function agregarDevueltoDeVenta(item: VentaItemLite) {
    if (!item.variante) return; // renglón libre: no se puede referenciar una variante
    setDevueltos((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        varianteId: item.variante!.id,
        sku: item.variante!.sku,
        nombre: item.variante!.producto.nombre,
        talla: item.variante!.talla?.valor || null,
        color: item.variante!.color,
        proveedorId: item.proveedor?.id ?? null,
        cantidad: 1,
        precioUnitario: Number(item.precioUnitario),
        motivo: '',
        motivoDetalle: '',
      },
    ]);
    if (ventaEncontrada && !cliente && ventaEncontrada.cliente) setCliente(ventaEncontrada.cliente);
    if (ventaEncontrada && !clienteTelefono && ventaEncontrada.clienteTelefono) {
      setClienteTelefono(ventaEncontrada.clienteTelefono);
    }
  }

  function actualizarDevuelto(key: string, cambiosParciales: Partial<FilaDevuelto>) {
    setDevueltos((prev) => prev.map((f) => (f.key === key ? { ...f, ...cambiosParciales } : f)));
  }

  function quitarDevuelto(key: string) {
    setDevueltos((prev) => prev.filter((f) => f.key !== key));
  }

  // ---------------------------------------------------------------------
  // Carrito: producto nuevo
  // ---------------------------------------------------------------------

  function agregarNuevo(e: Existencia) {
    setNuevos((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        varianteId: e.variante.id,
        sku: e.variante.sku,
        nombre: e.variante.producto.nombre,
        talla: e.variante.talla?.valor || null,
        color: e.variante.color,
        proveedorId: e.proveedorId,
        stockDisponible: e.stockActual,
        cantidad: 1,
        precioUnitario: Number(e.variante.producto.precioVenta),
      },
    ]);
  }

  function actualizarNuevo(key: string, cambiosParciales: Partial<FilaNueva>) {
    setNuevos((prev) => prev.map((f) => (f.key === key ? { ...f, ...cambiosParciales } : f)));
  }

  function quitarNuevo(key: string) {
    setNuevos((prev) => prev.filter((f) => f.key !== key));
  }

  // ---------------------------------------------------------------------
  // Totales
  // ---------------------------------------------------------------------

  const totalDevuelto = devueltos.reduce((acc, f) => acc + f.cantidad * f.precioUnitario, 0);
  const totalNuevo = nuevos.reduce((acc, f) => acc + f.cantidad * f.precioUnitario, 0);
  const diferencia = Math.round((totalNuevo - totalDevuelto) * 100) / 100;

  const faltaMotivo = devueltos.some((f) => !f.motivo);
  const puedeRegistrar =
    !!sucursalId &&
    devueltos.length > 0 &&
    nuevos.length > 0 &&
    !faltaMotivo &&
    diferencia >= -0.004 &&
    (diferencia <= 0.004 ||
      metodoPago !== 'TRANSFERENCIA' ||
      (!!cuentaTransferenciaId && !!comprobante));

  async function registrarCambio() {
    setMensaje(null);
    if (!sucursalId) return;
    if (devueltos.length === 0) {
      setMensaje('Agrega al menos un producto que el cliente devuelve.');
      return;
    }
    if (nuevos.length === 0) {
      setMensaje('Agrega al menos un producto nuevo que se lleva el cliente.');
      return;
    }
    if (faltaMotivo) {
      setMensaje('Elige el motivo de devolución de cada producto devuelto.');
      return;
    }
    if (diferencia < -0.004) {
      setMensaje(
        `Todavía queda un saldo a favor del cliente de ${formatoMonedaExacto(
          Math.abs(diferencia)
        )}. Agrega otro producto para cubrirlo — no se hacen reembolsos.`
      );
      return;
    }
    if (diferencia > 0.004) {
      if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
        setMensaje('Elige a qué cuenta llegó la transferencia.');
        return;
      }
      if (metodoPago === 'TRANSFERENCIA' && !comprobante) {
        setMensaje('Falta la foto del comprobante de transferencia.');
        return;
      }
      if (metodoPago === 'EFECTIVO' && efectivoRecibido.trim() && Number(efectivoRecibido) < diferencia) {
        setMensaje(`El efectivo recibido no alcanza. Faltan ${formatoMonedaExacto(diferencia - Number(efectivoRecibido))}.`);
        return;
      }
    }

    setGuardando(true);
    try {
      const datos = {
        sucursalId: Number(sucursalId),
        ventaOrigenId: ventaEncontrada ? ventaEncontrada.id : undefined,
        cliente: cliente.trim() || undefined,
        clienteTelefono: clienteTelefono.trim() || undefined,
        notas: notas.trim() || undefined,
        itemsDevueltos: devueltos.map((f) => ({
          varianteId: f.varianteId,
          cantidad: f.cantidad,
          precioUnitario: f.precioUnitario,
          proveedorId: f.proveedorId ?? undefined,
          motivo: f.motivo,
          motivoDetalle: f.motivoDetalle.trim() || undefined,
        })),
        itemsNuevos: nuevos.map((f) => ({
          varianteId: f.varianteId,
          cantidad: f.cantidad,
          precioUnitario: f.precioUnitario,
          proveedorId: f.proveedorId ?? undefined,
        })),
        metodoPago: diferencia > 0.004 ? metodoPago : undefined,
        cuentaTransferenciaId:
          diferencia > 0.004 && metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
        efectivoRecibido:
          diferencia > 0.004 && metodoPago === 'EFECTIVO' && efectivoRecibido.trim()
            ? Number(efectivoRecibido)
            : undefined,
      };

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      const creado = await apiUpload<Cambio>('/cambios', formData);

      setMensaje(`Cambio ${creado.folio} registrado correctamente.`);
      setDevueltos([]);
      setNuevos([]);
      setCliente('');
      setClienteTelefono('');
      setNotas('');
      setFolioBuscado('');
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);
      setEfectivoRecibido('');
      cargarCambios();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarCancelacion() {
    if (!cambioACancelar) return;
    setCancelando(true);
    try {
      await api(`/cambios/${cambioACancelar.id}/cancelar`, { method: 'POST' });
      setCambioACancelar(null);
      cargarCambios();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cancelar el cambio.');
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Cambios"
        subtitle="Cambio de producto por defecto, gusto o talla — no se hacen reembolsos, solo se cambia por otra mercancía."
        actions={
          sucursales.length > 0 ? (
            <Select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              disabled={sucursalBloqueada}
              wrapperClassName="w-56"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {mensaje && (
        <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{mensaje}</span>
          <button onClick={() => setMensaje(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cliente y venta original ------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-4 h-4" /> Cliente y venta original
          </CardTitle>
          <CardDescription>Ambos son opcionales, pero ligar la venta original agiliza capturar qué devuelve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Nombre del cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            <Input
              placeholder="Teléfono (opcional)"
              value={clienteTelefono}
              onChange={(e) => setClienteTelefono(e.target.value)}
            />
          </div>
          <div className="relative">
            <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar venta original por folio (opcional)"
              value={folioBuscado}
              onChange={(e) => setFolioBuscado(e.target.value)}
              className="pl-9"
            />
          </div>
          {folioBuscado.trim() && !ventaEncontrada && (
            <p className="text-sm text-muted-foreground">Sin ventas que coincidan con &quot;{folioBuscado}&quot;.</p>
          )}
          {ventaEncontrada && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {ventaEncontrada.folio} — {ventaEncontrada.sucursal.nombre}
                </span>
                {ventaEncontrada.cliente && <span className="text-muted-foreground">{ventaEncontrada.cliente}</span>}
              </div>
              <div className="divide-y divide-border">
                {ventaEncontrada.items.map((it) => {
                  const detalle = it.variante
                    ? [it.variante.talla?.valor, it.variante.color].filter(Boolean).join('/')
                    : null;
                  return (
                    <div key={it.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">
                          {it.variante ? it.variante.producto.nombre : it.descripcionLibre}
                          {detalle ? ` (${detalle})` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {it.cantidad} × {formatoMonedaExacto(it.precioUnitario)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!it.variante}
                        onClick={() => agregarDevueltoDeVenta(it)}
                        title={!it.variante ? 'Este renglón no está en el catálogo, agrégalo manualmente' : undefined}
                      >
                        <Plus className="w-3.5 h-3.5" /> Devolver
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Producto devuelto ---------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Producto(s) que devuelve el cliente</CardTitle>
          <CardDescription>Por defecto, porque no le gustó, o porque no le quedó la talla.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BuscadorProducto
            sucursalId={sucursalId}
            soloConStock={false}
            placeholder="Buscar por nombre o SKU del producto devuelto…"
            onSeleccionar={agregarDevuelto}
          />
          {devueltos.length === 0 && (
            <EmptyState title="Sin productos devueltos" description="Busca arriba o agrégalos desde la venta original." />
          )}
          <div className="space-y-3">
            {devueltos.map((f) => {
              const detalle = [f.talla, f.color].filter(Boolean).join('/');
              return (
                <div key={f.key} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {f.nombre}
                        {detalle ? ` (${detalle})` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">SKU {f.sku}</p>
                    </div>
                    <button onClick={() => quitarDevuelto(f.key)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <Input
                        type="number"
                        min={1}
                        value={f.cantidad}
                        onChange={(e) => actualizarDevuelto(f.key, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Precio pagado</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={f.precioUnitario}
                        onChange={(e) => actualizarDevuelto(f.key, { precioUnitario: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs text-muted-foreground">Motivo</label>
                      <Select
                        value={f.motivo}
                        onChange={(e) => actualizarDevuelto(f.key, { motivo: e.target.value as Motivo })}
                      >
                        <option value="">Elige uno…</option>
                        {MOTIVOS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-xs text-muted-foreground">Subtotal</label>
                      <p className="h-9 flex items-center text-sm font-medium">
                        {formatoMonedaExacto(f.cantidad * f.precioUnitario)}
                      </p>
                    </div>
                  </div>
                  {f.motivo === 'DEFECTUOSO' && (
                    <Input
                      placeholder="Detalle del defecto (opcional)"
                      value={f.motivoDetalle}
                      onChange={(e) => actualizarDevuelto(f.key, { motivoDetalle: e.target.value })}
                    />
                  )}
                  {f.motivo === 'DEFECTUOSO' && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> No vuelve a existencias vendibles: se aparta como
                      mercancía dañada.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {devueltos.length > 0 && (
            <div className="flex justify-end text-sm font-semibold">Total devuelto: {formatoMonedaExacto(totalDevuelto)}</div>
          )}
        </CardContent>
      </Card>

      {/* Producto nuevo --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Producto(s) nuevo(s) que se lleva</CardTitle>
          <CardDescription>Debe haber stock disponible en la sucursal elegida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BuscadorProducto
            sucursalId={sucursalId}
            soloConStock
            placeholder="Buscar por nombre o SKU del producto nuevo…"
            onSeleccionar={agregarNuevo}
          />
          {nuevos.length === 0 && <EmptyState title="Sin productos nuevos" description="Busca arriba el producto que se lleva el cliente." />}
          <div className="space-y-3">
            {nuevos.map((f) => {
              const detalle = [f.talla, f.color].filter(Boolean).join('/');
              return (
                <div key={f.key} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {f.nombre}
                        {detalle ? ` (${detalle})` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SKU {f.sku} · {f.stockDisponible} disponibles
                      </p>
                    </div>
                    <button onClick={() => quitarNuevo(f.key)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Cantidad</label>
                      <Input
                        type="number"
                        min={1}
                        max={f.stockDisponible}
                        value={f.cantidad}
                        onChange={(e) =>
                          actualizarNuevo(f.key, {
                            cantidad: Math.min(f.stockDisponible, Math.max(1, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Precio</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={f.precioUnitario}
                        onChange={(e) => actualizarNuevo(f.key, { precioUnitario: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Subtotal</label>
                      <p className="h-9 flex items-center text-sm font-medium">
                        {formatoMonedaExacto(f.cantidad * f.precioUnitario)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {nuevos.length > 0 && (
            <div className="flex justify-end text-sm font-semibold">Total nuevo: {formatoMonedaExacto(totalNuevo)}</div>
          )}
        </CardContent>
      </Card>

      {/* Resumen y pago ---------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total devuelto</p>
              <p className="text-lg font-semibold">{formatoMonedaExacto(totalDevuelto)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total nuevo</p>
              <p className="text-lg font-semibold">{formatoMonedaExacto(totalNuevo)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p className={`text-lg font-semibold ${diferencia < 0 ? 'text-destructive' : ''}`}>
                {formatoMonedaExacto(Math.abs(diferencia))}
              </p>
            </div>
          </div>

          {diferencia < -0.004 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Queda un saldo a favor del cliente de {formatoMonedaExacto(Math.abs(diferencia))}. Agrega otro producto
              para cubrirlo — por política no se hacen reembolsos ni se guarda como saldo pendiente.
            </div>
          )}

          {diferencia >= -0.004 && diferencia <= 0.004 && (devueltos.length > 0 || nuevos.length > 0) && (
            <div className="rounded-lg border border-success/30 bg-success/10 text-success px-4 py-3 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Cambio exacto — no requiere pago adicional.
            </div>
          )}

          {diferencia > 0.004 && (
            <div className="space-y-3">
              <p className="text-sm">
                El cliente paga la diferencia de <strong>{formatoMonedaExacto(diferencia)}</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={metodoPago === 'EFECTIVO' ? 'default' : 'outline'}
                  onClick={() => setMetodoPago('EFECTIVO')}
                >
                  <Banknote className="w-4 h-4" /> Efectivo
                </Button>
                <Button
                  type="button"
                  variant={metodoPago === 'TARJETA' ? 'default' : 'outline'}
                  onClick={() => setMetodoPago('TARJETA')}
                >
                  <CreditCard className="w-4 h-4" /> Tarjeta
                </Button>
                <Button
                  type="button"
                  variant={metodoPago === 'TRANSFERENCIA' ? 'default' : 'outline'}
                  onClick={() => setMetodoPago('TRANSFERENCIA')}
                >
                  <Landmark className="w-4 h-4" /> Transferencia
                </Button>
              </div>
              {metodoPago === 'EFECTIVO' && (
                <div>
                  <label className="text-xs text-muted-foreground">Efectivo recibido (opcional, para calcular el cambio a dar)</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={efectivoRecibido}
                    onChange={(e) => setEfectivoRecibido(e.target.value)}
                  />
                  {efectivoRecibido.trim() && Number(efectivoRecibido) >= diferencia && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Cambio a dar: {formatoMonedaExacto(Number(efectivoRecibido) - diferencia)}
                    </p>
                  )}
                </div>
              )}
              {metodoPago === 'TRANSFERENCIA' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select value={cuentaTransferenciaId} onChange={(e) => setCuentaTransferenciaId(e.target.value)}>
                    <option value="">Cuenta que recibió…</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.banco ? ` — ${c.banco}` : ''}
                      </option>
                    ))}
                  </Select>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <Input placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

          <Button className="w-full" size="lg" disabled={!puedeRegistrar || guardando} onClick={registrarCambio}>
            {guardando ? 'Registrando…' : 'Registrar cambio'}
          </Button>
        </CardContent>
      </Card>

      {/* Historial ---------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCcw className="w-4 h-4" /> Historial de cambios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cargandoCambios && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!cargandoCambios && cambios.length === 0 && (
            <EmptyState title="Sin cambios registrados" description="Los cambios que registres aparecerán aquí." />
          )}
          {!cargandoCambios && cambios.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Folio</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Devuelto</th>
                    <th className="py-2 pr-3">Nuevo</th>
                    <th className="py-2 pr-3">Diferencia</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Vendedor</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cambios.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-medium">{c.folio}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatearFechaHora(c.createdAt)}</td>
                      <td className="py-2 pr-3">{c.cliente || '—'}</td>
                      <td className="py-2 pr-3">{formatoMonedaExacto(c.totalDevuelto)}</td>
                      <td className="py-2 pr-3">{formatoMonedaExacto(c.totalNuevo)}</td>
                      <td className="py-2 pr-3">
                        {Number(c.diferencia) > 0 ? formatoMonedaExacto(c.diferencia) : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge tono={c.estado === 'COMPLETADO' ? 'success' : 'destructive'}>
                          {c.estado === 'COMPLETADO' ? 'Completado' : 'Cancelado'}
                        </StatusBadge>
                      </td>
                      <td className="py-2 pr-3">{c.usuario.nombre}</td>
                      <td className="py-2 pr-3 text-right">
                        {esAdmin && c.estado === 'COMPLETADO' && (
                          <Button size="sm" variant="secondary" onClick={() => setCambioACancelar(c)}>
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!cambioACancelar}
        onOpenChange={(open) => !open && setCambioACancelar(null)}
        title={`¿Cancelar el cambio ${cambioACancelar?.folio}?`}
        description="Se revierte el inventario: el producto entregado regresa a existencias y el producto devuelto vuelve a salir (si aplicaba). No se puede deshacer."
        confirmLabel="Sí, cancelar"
        onConfirm={confirmarCancelacion}
        loading={cancelando}
      />
    </div>
  );
}
