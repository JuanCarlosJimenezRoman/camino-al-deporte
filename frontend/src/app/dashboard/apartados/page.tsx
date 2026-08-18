'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Send, FileText, Plus, X, CalendarClock } from 'lucide-react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, EstadoTono } from '@/components/ui/status-badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter } from '@/components/ui/drawer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';

interface Sucursal {
  id: number;
  nombre: string;
}

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
}

interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
}

// Un renglón por (variante, proveedor): la misma talla puede aparecer varias
// veces si más de un proveedor tiene stock de ella en esa sucursal.
interface Existencia {
  id: number | null;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: {
      nombre: string;
      precioVenta: string;
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
  };
}

// Identifica un bucket concreto (variante + proveedor) para usarlo como
// value de <option>, ya que un mismo varianteId puede repetirse.
function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}`;
}

interface ItemCarrito {
  varianteId: number;
  proveedorId: number | null;
  sucursalStockId: number;
  sucursalStockNombre: string;
  descripcion: string;
  imagenUrl: string | null;
  cantidad: number;
  precioUnitario: number;
}

interface Pago {
  id: number;
  monto: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  cuentaTransferencia: { nombre: string } | null;
  comprobanteUrl: string | null;
  registradoPor: { nombre: string };
  createdAt: string;
}

interface ApartadoItem {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
  sucursalStock?: { nombre: string };
}

interface Apartado {
  id: number;
  folio: string;
  cliente: Cliente;
  sucursalVenta: { nombre: string };
  total: string;
  estado: 'ACTIVO' | 'LIQUIDADO' | 'CANCELADO';
  fechaLimite: string | null;
  notas: string | null;
  items: ApartadoItem[];
  pagos: Pago[];
  pagado: number;
  saldoPendiente: number;
  createdAt: string;
  // Número que se muestra como "contacto" dentro del comprobante (WhatsApp
  // de la sucursal, o el general de la tienda si no tiene uno propio). Ya
  // viene resuelto desde el backend — ver POST /apartados y POST
  // /apartados/:id/pagos.
  whatsappContacto?: string | null;
  // Resultado del envío automático por WhatsApp Business Platform (Cloud
  // API), solo presente justo después de crear el apartado o registrar un
  // abono. Si enviado=false (plantilla sin configurar/aprobar, o Meta
  // rechazó el mensaje), se ofrece el link manual de wa.me como respaldo.
  ticketDigital?: { enviado: boolean; error?: string } | null;
  // Comprobante en PDF (de la creación o del abono más reciente), generado
  // en el servidor y subido a Cloudinary.
  ticketPdfUrl?: string | null;
}

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

const ESTADO_TONO: Record<Apartado['estado'], EstadoTono> = {
  ACTIVO: 'warning',
  LIQUIDADO: 'success',
  CANCELADO: 'neutral',
};

function etiquetaMetodoPago(v: Pago['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
}

// Comprobante digital del apartado: mismo mecanismo de click-to-chat que ya
// se usa para el ticket de venta (ver app/dashboard/ventas/page.tsx) — el
// envío automático por la API de WhatsApp es el "camino feliz" (ver
// ticketDigital arriba); esto es el respaldo manual, siempre disponible.
function formatearTelefonoWhatsapp(telefono: string): string {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 10) digitos = '52' + digitos; // sin código de país -> asumimos México
  return digitos;
}

function construirComprobanteTexto(apartado: Apartado, montoEvento: number | null): string {
  const articulos = apartado.items
    .map((it) => {
      const detalle = [it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ');
      return `- ${it.variante.producto.nombre}${detalle ? ` (${detalle})` : ''} x${it.cantidad} — $${it.subtotal}`;
    })
    .join('\n');
  const esAnticipo = montoEvento != null && Math.abs(apartado.pagado - montoEvento) < 0.01;

  return [
    'Comprobante de apartado — Camino al Deporte',
    `Folio: ${apartado.folio}`,
    `Fecha: ${new Date(apartado.createdAt).toLocaleString('es-MX')}`,
    apartado.sucursalVenta?.nombre ? `Sucursal: ${apartado.sucursalVenta.nombre}` : '',
    `Cliente: ${apartado.cliente.nombre}`,
    '',
    'Artículos:',
    articulos,
    '',
    montoEvento != null ? `${esAnticipo ? 'Anticipo' : 'Abono'} recibido hoy: $${montoEvento.toFixed(2)}` : '',
    `Total: $${apartado.total}`,
    `Pagado a la fecha: $${apartado.pagado.toFixed(2)}`,
    `Saldo pendiente: $${apartado.saldoPendiente.toFixed(2)}`,
    `Fecha límite para recoger: ${
      apartado.fechaLimite ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX') : 'Sin fecha límite'
    }`,
    '',
    apartado.saldoPendiente > 0.01 ? '¡Gracias por tu apartado!' : '¡Ya está liquidado, listo para recoger!',
    'Presenta este comprobante o tu folio para recoger tu pedido.',
    apartado.whatsappContacto ? `Dudas, contáctanos: ${apartado.whatsappContacto}` : '',
  ].join('\n');
}

function construirLinkComprobante(apartado: Apartado, montoEvento: number | null): string | null {
  if (!apartado.cliente?.telefono) return null;
  const numero = formatearTelefonoWhatsapp(apartado.cliente.telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(construirComprobanteTexto(apartado, montoEvento))}`;
}

export default function ApartadosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Comprobante del apartado que se acaba de crear (se muestra aquí, no
  // dentro del formulario, porque el formulario se cierra al terminar).
  const [ticketLink, setTicketLink] = useState<string | null>(null);
  const [ticketPdfUrl, setTicketPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (filtroEstado) qs.set('estado', filtroEstado);
      const data = await api<Apartado[]>(`/apartados?${qs.toString()}`);
      setApartados(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  const adeudosPorCliente = useMemo(() => {
    const mapa = new Map<number, { cliente: Cliente; saldo: number; cantidad: number }>();
    for (const a of apartados) {
      if (a.estado !== 'ACTIVO' || a.saldoPendiente <= 0) continue;
      const actual = mapa.get(a.cliente.id) || { cliente: a.cliente, saldo: 0, cantidad: 0 };
      actual.saldo += a.saldoPendiente;
      actual.cantidad += 1;
      mapa.set(a.cliente.id, actual);
    }
    return Array.from(mapa.values()).sort((x, y) => y.saldo - x.saldo);
  }, [apartados]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apartados"
        subtitle={`${apartados.length} apartado${apartados.length === 1 ? '' : 's'}`}
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Apartados' }]}
        actions={
          <Button size="sm" onClick={() => setMostrarForm(true)}>
            <Plus className="w-4 h-4" />
            Nuevo apartado
          </Button>
        }
      />

      <NuevoApartadoForm
        open={mostrarForm}
        onOpenChange={setMostrarForm}
        sucursales={sucursales}
        cuentas={cuentas}
        usuario={usuario}
        esAdmin={esAdmin}
        onCreado={(creado) => {
          setMostrarForm(false);
          const autoEnviado = creado.ticketDigital?.enviado;
          const motivo = !autoEnviado && creado.ticketDigital?.error ? ` (${creado.ticketDigital.error})` : '';
          toast({ title: 'Apartado registrado', description: autoEnviado ? 'Comprobante (PDF) enviado automáticamente por WhatsApp.' : motivo || undefined, variant: 'success' });
          setMensaje(null);
          setTicketPdfUrl(creado.ticketPdfUrl || null);
          const montoEvento = creado.pagos?.[0] ? Number(creado.pagos[0].monto) : null;
          setTicketLink(autoEnviado ? null : construirLinkComprobante(creado, montoEvento));
          cargar();
        }}
      />

      {mensaje && <p className="rounded-lg bg-secondary/60 border border-border px-3 py-2 text-sm">{mensaje}</p>}

      {(ticketLink || ticketPdfUrl) && (
        <div className="flex flex-wrap gap-2">
          {ticketLink && (
            <Button variant="outline" size="sm" asChild>
              <a href={ticketLink} target="_blank" rel="noreferrer">
                <Send className="w-3.5 h-3.5" />
                Enviar comprobante por WhatsApp
              </a>
            </Button>
          )}
          {ticketPdfUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={ticketPdfUrl} target="_blank" rel="noreferrer">
                <FileText className="w-3.5 h-3.5" />
                Ver comprobante (PDF)
              </a>
            </Button>
          )}
        </div>
      )}

      {adeudosPorCliente.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-3">Clientes con adeudo</h2>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Apartados activos</th>
                <th>Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {adeudosPorCliente.map(({ cliente, saldo, cantidad }) => (
                <tr key={cliente.id}>
                  <td className="font-medium">{cliente.nombre}</td>
                  <td>{cliente.telefono}</td>
                  <td className="tabular-nums">{cantidad}</td>
                  <td className="tabular-nums font-medium">${saldo.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="w-48">
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="LIQUIDADO">Liquidados</option>
          <option value="CANCELADO">Cancelados</option>
        </Select>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : apartados.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Sin apartados registrados"
          description="Los apartados que registres aparecerán aquí."
          action={
            <Button size="sm" onClick={() => setMostrarForm(true)}>
              <Plus className="w-4 h-4" />
              Nuevo apartado
            </Button>
          }
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Sucursal</th>
              <th>Total</th>
              <th>Pagado</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Fecha límite</th>
              <th>Comprobante</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apartados.map((a) => (
              <ApartadoFila
                key={a.id}
                apartado={a}
                expandido={expandidoId === a.id}
                onToggle={() => setExpandidoId(expandidoId === a.id ? null : a.id)}
                cuentas={cuentas}
                onCambio={cargar}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila expandible: detalle, registrar abono, cancelar
// ---------------------------------------------------------------------------

function ApartadoFila({
  apartado,
  expandido,
  onToggle,
  cuentas,
  onCambio,
}: {
  apartado: Apartado;
  expandido: boolean;
  onToggle: () => void;
  cuentas: CuentaTransferencia[];
  onCambio: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  // Comprobante actualizado (con el nuevo saldo) del abono que se acaba de
  // registrar.
  const [ticketLink, setTicketLink] = useState<string | null>(null);
  const [ticketPdfUrl, setTicketPdfUrl] = useState<string | null>(null);

  async function registrarAbono() {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
      setMensaje('Elige a qué cuenta llegó la transferencia.');
      return;
    }
    if (metodoPago === 'TRANSFERENCIA' && !comprobante) {
      setMensaje('Falta la foto del comprobante.');
      return;
    }

    setGuardando(true);
    setTicketLink(null);
    setTicketPdfUrl(null);
    try {
      const datos = {
        monto: montoNum,
        metodoPago,
        cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
      };
      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      const actualizado = await apiUpload<Apartado>(`/apartados/${apartado.id}/pagos`, formData);
      setMonto('');
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);

      const autoEnviado = actualizado.ticketDigital?.enviado;
      const motivo = !autoEnviado && actualizado.ticketDigital?.error ? ` (${actualizado.ticketDigital.error})` : '';
      setMensaje(
        autoEnviado
          ? 'Abono registrado. Comprobante (PDF) enviado automáticamente por WhatsApp.'
          : `Abono registrado.${motivo}`
      );
      setTicketPdfUrl(actualizado.ticketPdfUrl || null);
      setTicketLink(autoEnviado ? null : construirLinkComprobante(actualizado, montoNum));
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el abono.');
    } finally {
      setGuardando(false);
    }
  }

  async function cancelar() {
    setCancelando(true);
    try {
      await api(`/apartados/${apartado.id}/cancelar`, { method: 'POST' });
      toast({ title: 'Apartado cancelado', description: 'El stock reservado se devolvió.', variant: 'success' });
      onCambio();
    } catch (err) {
      toast({ title: 'No se pudo cancelar', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCancelando(false);
      setConfirmarCancelar(false);
    }
  }

  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td className="font-medium">{apartado.folio}</td>
        <td>
          {apartado.cliente.nombre}
          <div className="text-xs text-muted-foreground">{apartado.cliente.telefono}</div>
        </td>
        <td>{apartado.sucursalVenta?.nombre}</td>
        <td className="tabular-nums">${apartado.total}</td>
        <td className="tabular-nums">${apartado.pagado.toFixed(2)}</td>
        <td className="tabular-nums font-medium">${apartado.saldoPendiente.toFixed(2)}</td>
        <td>
          <StatusBadge tono={ESTADO_TONO[apartado.estado]}>{apartado.estado}</StatusBadge>
        </td>
        <td>{apartado.fechaLimite ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX') : '—'}</td>
        <td onClick={(e) => e.stopPropagation()}>
          {apartado.ticketPdfUrl ? (
            <a href={apartado.ticketPdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
              ver PDF
            </a>
          ) : (
            '—'
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {expandido ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {expandido ? 'Ocultar' : 'Ver'}
          </Button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={10} className="bg-secondary/40">
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Artículos</h3>
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Talla</th>
                      <th>Sucursal stock</th>
                      <th>Cant.</th>
                      <th>Precio</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apartado.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <ProductoThumb url={imagenPrincipal(it.variante.producto, it.variante.color)} alt={it.variante.producto.nombre} />
                        </td>
                        <td className="text-xs text-muted-foreground">{it.variante.sku}</td>
                        <td>{it.variante.producto.nombre}</td>
                        <td>{it.variante.talla?.valor ?? '—'}</td>
                        <td>{it.sucursalStock?.nombre ?? '—'}</td>
                        <td className="tabular-nums">{it.cantidad}</td>
                        <td className="tabular-nums">${it.precioUnitario}</td>
                        <td className="tabular-nums font-medium">${it.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pagos / abonos</h3>
                {apartado.pagos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin abonos todavía.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Monto</th>
                        <th>Método</th>
                        <th>Registrado por</th>
                        <th>Fecha</th>
                        <th>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apartado.pagos.map((p) => (
                        <tr key={p.id}>
                          <td className="tabular-nums font-medium">${p.monto}</td>
                          <td className="text-xs">
                            {etiquetaMetodoPago(p.metodoPago)}
                            {p.cuentaTransferencia ? ` (${p.cuentaTransferencia.nombre})` : ''}
                          </td>
                          <td>{p.registradoPor?.nombre}</td>
                          <td className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString('es-MX')}</td>
                          <td>
                            {p.comprobanteUrl ? (
                              <a href={p.comprobanteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                                ver
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {apartado.estado === 'ACTIVO' && (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs">Monto del abono</label>
                    <Input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-32" />
                  </div>
                  <div className="w-36">
                    <label className="text-xs">Método</label>
                    <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}>
                      {METODOS_PAGO.map((m) => (
                        <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
                      ))}
                    </Select>
                  </div>
                  {metodoPago === 'TRANSFERENCIA' && (
                    <>
                      <div className="w-44">
                        <label className="text-xs">Cuenta</label>
                        <Select value={cuentaTransferenciaId} onChange={(e) => setCuentaTransferenciaId(e.target.value)}>
                          <option value="">Selecciona...</option>
                          {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs block mb-1">Comprobante</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                          className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium hover:file:bg-secondary/70"
                        />
                      </div>
                    </>
                  )}
                  <Button size="sm" onClick={registrarAbono} disabled={guardando}>
                    {guardando ? 'Guardando…' : 'Registrar abono'}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmarCancelar(true)}>
                    Cancelar apartado
                  </Button>
                </div>
              )}

              {apartado.notas && <p className="text-xs text-muted-foreground">Notas: {apartado.notas}</p>}
              {mensaje && <p className="text-sm">{mensaje}</p>}
              {(ticketLink || ticketPdfUrl) && (
                <div className="flex flex-wrap gap-2">
                  {ticketLink && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={ticketLink} target="_blank" rel="noreferrer">
                        <Send className="w-3.5 h-3.5" />
                        Enviar comprobante por WhatsApp
                      </a>
                    </Button>
                  )}
                  {ticketPdfUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={ticketPdfUrl} target="_blank" rel="noreferrer">
                        <FileText className="w-3.5 h-3.5" />
                        Ver comprobante (PDF)
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      <ConfirmDialog
        open={confirmarCancelar}
        onOpenChange={setConfirmarCancelar}
        title={`¿Cancelar el apartado ${apartado.folio}?`}
        description="El stock reservado se devolverá a la sucursal de origen."
        confirmLabel="Cancelar apartado"
        onConfirm={cancelar}
        loading={cancelando}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulario de nuevo apartado
// ---------------------------------------------------------------------------

function NuevoApartadoForm({
  open,
  onOpenChange,
  sucursales,
  cuentas,
  usuario,
  esAdmin,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sucursales: Sucursal[];
  cuentas: CuentaTransferencia[];
  usuario: { sucursalId?: number | null } | null;
  esAdmin: boolean;
  onCreado: (creado: Apartado) => void;
}) {
  const [sucursalVentaId, setSucursalVentaId] = useState(usuario?.sucursalId ? String(usuario.sucursalId) : '');

  // Cliente
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [emailNuevo, setEmailNuevo] = useState('');

  // Artículos
  const [sucursalStockId, setSucursalStockId] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [existenciaKey, setExistenciaKey] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [fechaLimite, setFechaLimite] = useState('');
  const [notas, setNotas] = useState('');

  const [conAnticipo, setConAnticipo] = useState(false);
  const [montoAnticipo, setMontoAnticipo] = useState('');
  const [metodoAnticipo, setMetodoAnticipo] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [cuentaAnticipoId, setCuentaAnticipoId] = useState('');
  const [comprobanteAnticipo, setComprobanteAnticipo] = useState<File | null>(null);

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!busquedaCliente.trim()) {
      setResultadosCliente([]);
      return;
    }
    const t = setTimeout(() => {
      api<Cliente[]>(`/clientes?q=${encodeURIComponent(busquedaCliente.trim())}`).then(setResultadosCliente);
    }, 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  useEffect(() => {
    if (!sucursalStockId) {
      setExistencias([]);
      return;
    }
    const qs = new URLSearchParams({ sucursalId: sucursalStockId });
    if (busquedaProducto) qs.set('skuOProducto', busquedaProducto);
    api<Existencia[]>(`/inventario/existencias?${qs.toString()}`).then((data) =>
      setExistencias(data.filter((e) => e.stockActual > 0))
    );
  }, [sucursalStockId, busquedaProducto]);

  const totalCarrito = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

  function agregarAlCarrito() {
    if (!existenciaKey || !sucursalStockId) return;
    const existencia = existencias.find((e) => claveExistencia(e) === existenciaKey);
    if (!existencia) return;
    const sucursal = sucursales.find((s) => String(s.id) === sucursalStockId);

    setCarrito((prev) => [
      ...prev,
      {
        varianteId: existencia.variante.id,
        proveedorId: existencia.proveedorId,
        sucursalStockId: Number(sucursalStockId),
        sucursalStockNombre: sucursal?.nombre || '',
        descripcion: `${existencia.variante.producto.nombre} ${
          existencia.variante.talla ? `(${existencia.variante.talla.valor})` : ''
        } — ${existencia.variante.sku} — ${existencia.proveedor?.nombre ?? 'sin proveedor'}`,
        imagenUrl: imagenPrincipal(existencia.variante.producto, existencia.variante.color),
        cantidad,
        precioUnitario: Number(existencia.variante.producto.precioVenta),
      },
    ]);
    setExistenciaKey('');
    setCantidad(1);
  }

  function quitarDelCarrito(idx: number) {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
  }

  function limpiarFormulario() {
    setSucursalVentaId(usuario?.sucursalId ? String(usuario.sucursalId) : '');
    setBusquedaCliente('');
    setResultadosCliente([]);
    setClienteSeleccionado(null);
    setNombreNuevo('');
    setTelefonoNuevo('');
    setEmailNuevo('');
    setSucursalStockId('');
    setBusquedaProducto('');
    setExistencias([]);
    setExistenciaKey('');
    setCantidad(1);
    setCarrito([]);
    setFechaLimite('');
    setNotas('');
    setConAnticipo(false);
    setMontoAnticipo('');
    setMetodoAnticipo('EFECTIVO');
    setCuentaAnticipoId('');
    setComprobanteAnticipo(null);
    setMensaje(null);
  }

  async function crearApartado() {
    if (carrito.length === 0) {
      setMensaje('Agrega al menos un artículo.');
      return;
    }
    if (!clienteSeleccionado && !(nombreNuevo.trim() && telefonoNuevo.trim())) {
      setMensaje('Selecciona un cliente existente o captura nombre y teléfono para uno nuevo.');
      return;
    }
    if (conAnticipo) {
      const montoNum = Number(montoAnticipo);
      if (!montoNum || montoNum <= 0) {
        setMensaje('Captura el monto del anticipo.');
        return;
      }
      if (metodoAnticipo === 'TRANSFERENCIA' && (!cuentaAnticipoId || !comprobanteAnticipo)) {
        setMensaje('Falta la cuenta o el comprobante del anticipo por transferencia.');
        return;
      }
    }

    setGuardando(true);
    try {
      const datos: Record<string, unknown> = {
        sucursalVentaId: sucursalVentaId ? Number(sucursalVentaId) : undefined,
        fechaLimite: fechaLimite || undefined,
        notas: notas || undefined,
        items: carrito.map((i) => ({
          varianteId: i.varianteId,
          proveedorId: i.proveedorId,
          sucursalStockId: i.sucursalStockId,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
        })),
      };
      if (clienteSeleccionado) {
        datos.clienteId = clienteSeleccionado.id;
      } else {
        datos.clienteNuevo = { nombre: nombreNuevo.trim(), telefono: telefonoNuevo.trim(), email: emailNuevo || undefined };
      }
      if (conAnticipo) {
        datos.anticipo = {
          monto: Number(montoAnticipo),
          metodoPago: metodoAnticipo,
          cuentaTransferenciaId: metodoAnticipo === 'TRANSFERENCIA' ? Number(cuentaAnticipoId) : undefined,
        };
      }

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (conAnticipo && comprobanteAnticipo) formData.append('comprobante', comprobanteAnticipo);

      const creado = await apiUpload<Apartado>('/apartados', formData);
      limpiarFormulario();
      onCreado(creado);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el apartado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent widthClassName="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>Nuevo apartado</DrawerTitle>
          <DrawerDescription>Reserva artículos para un cliente, con o sin anticipo.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-6">
          {esAdmin && (
            <div className="max-w-xs">
              <label>Sucursal que atiende</label>
              <Select value={sucursalVentaId} onChange={(e) => setSucursalVentaId(e.target.value)}>
                <option value="">Selecciona...</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</p>
              {clienteSeleccionado ? (
                <div className="flex items-center gap-2 text-sm">
                  <span>{clienteSeleccionado.nombre} — {clienteSeleccionado.telefono}</span>
                  <Button variant="ghost" size="sm" onClick={() => setClienteSeleccionado(null)}>Cambiar</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Buscar por nombre o teléfono..." value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} />
                  {resultadosCliente.length > 0 && (
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {resultadosCliente.map((c) => (
                        <button
                          key={c.id}
                          className="block w-full text-left px-2.5 py-1.5 text-sm hover:bg-secondary transition-colors"
                          onClick={() => {
                            setClienteSeleccionado(c);
                            setResultadosCliente([]);
                            setBusquedaCliente('');
                          }}
                        >
                          {c.nombre} — {c.telefono}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">O captura un cliente nuevo:</p>
                  <Input placeholder="Nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
                  <Input placeholder="Teléfono" value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} />
                  <Input placeholder="Email (opcional)" value={emailNuevo} onChange={(e) => setEmailNuevo(e.target.value)} />
                </>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalles</p>
              <div>
                <label>Fecha límite (opcional)</label>
                <Input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
              </div>
              <div>
                <label>Notas (opcional)</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Artículos (pueden venir de cualquier sucursal)</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <label>Sucursal de stock</label>
                <Select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
                  <option value="">Selecciona...</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </Select>
              </div>
              <div className="w-44">
                <label>Buscar SKU / producto</label>
                <Input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} />
              </div>
              <div className="flex items-end gap-1.5">
                {existenciaKey && (
                  <ProductoThumb
                    url={imagenPrincipal(
                      existencias.find((e) => claveExistencia(e) === existenciaKey)?.variante.producto,
                      existencias.find((e) => claveExistencia(e) === existenciaKey)?.variante.color
                    )}
                    alt=""
                    size={32}
                  />
                )}
                <div className="w-64">
                  <label>Producto</label>
                  <Select value={existenciaKey} onChange={(e) => setExistenciaKey(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {existencias.map((e) => (
                      <option key={claveExistencia(e)} value={claveExistencia(e)}>
                        {e.variante.producto.nombre} {e.variante.talla ? `(${e.variante.talla.valor})` : ''} — {e.variante.sku} —{' '}
                        {e.proveedor?.nombre ?? 'sin proveedor'} — stock: {e.stockActual}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="w-20">
                <label>Cantidad</label>
                <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
              </div>
              <Button variant="outline" size="sm" onClick={agregarAlCarrito} disabled={!existenciaKey}>
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </Button>
            </div>

            {carrito.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                {carrito.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 px-3 py-2">
                    <ProductoThumb url={it.imagenUrl} alt={it.descripcion} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{it.descripcion}</div>
                      <div className="text-xs text-muted-foreground truncate">{it.sucursalStockNombre} · x{it.cantidad}</div>
                    </div>
                    <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">${(it.cantidad * it.precioUnitario).toFixed(2)}</div>
                    <Button variant="ghost" size="icon" onClick={() => quitarDelCarrito(idx)} aria-label="Quitar" className="shrink-0 text-destructive">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {carrito.length > 0 && <p className="text-sm font-semibold tabular-nums">Total: ${totalCarrito.toFixed(2)}</p>}
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={conAnticipo} onChange={(e) => setConAnticipo(e.target.checked)} />
              Registrar un anticipo ahora
            </label>

            {conAnticipo && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <label>Monto</label>
                  <Input type="number" min={0} step="0.01" value={montoAnticipo} onChange={(e) => setMontoAnticipo(e.target.value)} />
                </div>
                <div className="w-36">
                  <label>Método</label>
                  <Select value={metodoAnticipo} onChange={(e) => setMetodoAnticipo(e.target.value as typeof metodoAnticipo)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
                    ))}
                  </Select>
                </div>
                {metodoAnticipo === 'TRANSFERENCIA' && (
                  <>
                    <div className="w-44">
                      <label>Cuenta</label>
                      <Select value={cuentaAnticipoId} onChange={(e) => setCuentaAnticipoId(e.target.value)}>
                        <option value="">Selecciona...</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="block">Comprobante</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setComprobanteAnticipo(e.target.files?.[0] || null)}
                        className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium hover:file:bg-secondary/70"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={crearApartado} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Registrar apartado'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
