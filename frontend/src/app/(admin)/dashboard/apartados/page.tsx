'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Send,
  FileText,
  Plus,
  X,
  CalendarClock,
  Search,
  AlertTriangle,
  Wallet,
  Users,
  Banknote,
  CreditCard,
  Landmark,
  LucideIcon,
  Tag,
} from 'lucide-react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { formatearFechaHora, formatearFecha } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
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
  // Descuento libre (opcional) aplicado al crear el apartado o después,
  // mientras seguía ACTIVO — ver POST /apartados y
  // POST /apartados/:id/aplicar-descuento. "total" ya viene neto (con el
  // descuento aplicado); el subtotal se reconstruye sumando items.subtotal.
  descuentoTipo: 'PORCENTAJE' | 'MONTO' | null;
  descuentoValor: string | null;
  descuentoMonto: string;
  descuentoMotivo: string | null;
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

// Tarjeta de estadística chica (Activos / Vencidos / Saldo pendiente) para
// la franja de resumen bajo el encabezado — nada de gráfica, solo el
// número, para que cargue rápido y no dependa de librerías de charts.
function TarjetaEstadistica({
  icon: Icon,
  label,
  valor,
  tono = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  valor: string;
  tono?: 'neutral' | 'warning' | 'destructive';
}) {
  const TONO_CLASES: Record<typeof tono, string> = {
    neutral: 'bg-primary/8 text-primary',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONO_CLASES[tono]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tabular-nums truncate">{valor}</div>
      </div>
    </div>
  );
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

// Qué tan urgente es la fecha límite de un apartado ACTIVO: "vencido" (ya
// pasó y sigue sin recogerse/liquidarse — lo más urgente, hay que hablarle
// al cliente) y "proximo" (vence en 3 días o menos, para no dejarlo pasar).
// Un apartado LIQUIDADO/CANCELADO o sin fecha límite nunca es urgente. Se
// usa tanto para ordenar la lista (ver ordenarApartados) como para el badge
// y el texto humanizado de cada renglón (ver textoFechaLimite).
type Urgencia = 'vencido' | 'proximo' | null;

function urgenciaApartado(a: Apartado): Urgencia {
  if (a.estado !== 'ACTIVO' || !a.fechaLimite) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(a.fechaLimite);
  limite.setHours(0, 0, 0, 0);
  const dias = Math.round((limite.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return 'vencido';
  if (dias <= 3) return 'proximo';
  return null;
}

// Texto humanizado de la fecha límite ("Vencido hace 2 días" / "Vence
// hoy" / "Vence en 3 días") en vez de solo la fecha cruda — así el cajero
// no tiene que calcular mentalmente qué tan urgente es cada uno.
function textoFechaLimite(a: Apartado): string {
  if (!a.fechaLimite) return 'Sin fecha límite';
  if (a.estado !== 'ACTIVO') return formatearFecha(a.fechaLimite);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(a.fechaLimite);
  limite.setHours(0, 0, 0, 0);
  const dias = Math.round((limite.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoy';
  if (dias <= 7) return `Vence en ${dias} día${dias === 1 ? '' : 's'}`;
  return `Vence el ${formatearFecha(a.fechaLimite)}`;
}

// Orden por urgencia operativa en vez de solo "más reciente primero": los
// vencidos van arriba de todo (los más vencidos primero — son los que más
// urge resolver), luego los próximos a vencer (el más cercano primero), y
// hasta abajo el resto, por fecha de creación descendente como antes.
function ordenarApartados(lista: Apartado[]): Apartado[] {
  function rango(a: Apartado): number {
    const u = urgenciaApartado(a);
    if (u === 'vencido') return 0;
    if (u === 'proximo') return 1;
    return 2;
  }
  return [...lista].sort((a, b) => {
    const ra = rango(a);
    const rb = rango(b);
    if (ra !== rb) return ra - rb;
    if (ra <= 1 && a.fechaLimite && b.fechaLimite) {
      return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// Resumen corto de los artículos de un apartado para la vista de lista
// ("Nike Sabrina 3 (26.5) +2 más") — el detalle completo solo se ve al
// expandir el renglón.
function resumenArticulos(a: Apartado): string {
  if (a.items.length === 0) return 'Sin artículos';
  const primero = a.items[0];
  const detalle = [primero.variante.talla?.valor, primero.variante.color].filter(Boolean).join(' / ');
  const base = `${primero.variante.producto.nombre}${detalle ? ` (${detalle})` : ''}`;
  return a.items.length > 1 ? `${base} +${a.items.length - 1} más` : base;
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
    `Fecha: ${formatearFechaHora(apartado.createdAt)}`,
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
      apartado.fechaLimite ? formatearFecha(apartado.fechaLimite) : 'Sin fecha límite'
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
  // Buscar por folio, nombre o teléfono del cliente — se filtra en el
  // cliente sobre lo ya cargado (el catálogo de apartados de una tienda de
  // este tamaño no justifica ir y venir al servidor por cada letra; ver
  // apartadosFiltrados).
  const [busqueda, setBusqueda] = useState('');
  // Atajo para ver solo los que ya pasaron su fecha límite — son los que
  // más urgen resolver (hablarle al cliente, liquidar o cancelar).
  const [soloVencidos, setSoloVencidos] = useState(false);
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

  // Se carga TODO una sola vez (sin filtrar por estado en el servidor):
  // así el resumen de arriba (Activos/Vencidos/Saldo pendiente) y "Clientes
  // con adeudo" siempre reflejan la realidad completa, sin importar qué
  // filtro esté viendo el cajero en ese momento — el filtro de estado, la
  // búsqueda y "solo vencidos" se aplican después, en el cliente (ver
  // apartadosFiltrados).
  async function cargar() {
    setCargando(true);
    try {
      const data = await api<Apartado[]>('/apartados');
      setApartados(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activos = useMemo(() => apartados.filter((a) => a.estado === 'ACTIVO'), [apartados]);
  const vencidos = useMemo(() => activos.filter((a) => urgenciaApartado(a) === 'vencido'), [activos]);
  const saldoPendienteTotal = useMemo(() => activos.reduce((acc, a) => acc + a.saldoPendiente, 0), [activos]);

  const apartadosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    let lista = apartados;
    if (filtroEstado) lista = lista.filter((a) => a.estado === filtroEstado);
    if (soloVencidos) lista = lista.filter((a) => urgenciaApartado(a) === 'vencido');
    if (termino) {
      lista = lista.filter(
        (a) =>
          a.folio.toLowerCase().includes(termino) ||
          a.cliente.nombre.toLowerCase().includes(termino) ||
          a.cliente.telefono.includes(termino)
      );
    }
    return ordenarApartados(lista);
  }, [apartados, filtroEstado, soloVencidos, busqueda]);

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

  // Al tocar un cliente de "Clientes con adeudo": salta directo a sus
  // apartados (limpia el filtro de estado y "solo vencidos" por si estaban
  // activos, y busca por su nombre) en vez de dejar que el cajero los
  // busque a mano en la lista completa.
  function verApartadosDeCliente(nombre: string) {
    setFiltroEstado('');
    setSoloVencidos(false);
    setBusqueda(nombre);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apartados"
        subtitle={`${activos.length} activo${activos.length === 1 ? '' : 's'} · ${apartados.length} en total`}
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

      {/* Resumen: de un vistazo, qué tan urgente está la situación — sin
          tener que contar renglones de la tabla de abajo a mano. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TarjetaEstadistica icon={CalendarClock} label="Apartados activos" valor={String(activos.length)} />
        <TarjetaEstadistica
          icon={AlertTriangle}
          label="Vencidos (sin liquidar)"
          valor={String(vencidos.length)}
          tono={vencidos.length > 0 ? 'destructive' : 'neutral'}
        />
        <TarjetaEstadistica icon={Wallet} label="Saldo pendiente total" valor={`$${saldoPendienteTotal.toFixed(2)}`} tono="warning" />
      </div>

      {adeudosPorCliente.length > 0 && (
        <div className="card space-y-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Users className="w-4 h-4 text-muted-foreground" />
            Clientes con adeudo
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {adeudosPorCliente.map(({ cliente, saldo, cantidad }) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => verApartadosDeCliente(cliente.nombre)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{cliente.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {cliente.telefono} · {cantidad} apartado{cantidad === 1 ? '' : 's'} activo{cantidad === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-warning">${saldo.toFixed(2)}</div>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buscar + filtros: folio/cliente/teléfono en un solo campo (se
          filtra sobre lo ya cargado, ver apartadosFiltrados), el estado
          como antes, y "Vencidos" como atajo de un toque a lo más urgente
          sin tener que combinar filtro de estado + leer cada fecha. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, cliente o teléfono…"
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="ACTIVO">Activos</option>
            <option value="LIQUIDADO">Liquidados</option>
            <option value="CANCELADO">Cancelados</option>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setSoloVencidos((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
            soloVencidos ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border bg-card text-foreground hover:bg-secondary'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Solo vencidos
        </button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
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
      ) : apartadosFiltrados.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="Ningún apartado coincide con la búsqueda o los filtros actuales."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('');
                setSoloVencidos(false);
              }}
            >
              Quitar filtros
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {apartadosFiltrados.map((a) => (
            <ApartadoFila
              key={a.id}
              apartado={a}
              expandido={expandidoId === a.id}
              onToggle={() => setExpandidoId(expandidoId === a.id ? null : a.id)}
              cuentas={cuentas}
              onCambio={cargar}
            />
          ))}
        </div>
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
  // Aplicar/editar el descuento del apartado — pensado sobre todo para
  // ofrecerlo justo antes de "Saldar todo" (ver botón junto al abono).
  const [mostrarDescuento, setMostrarDescuento] = useState(false);
  const [descTipo, setDescTipo] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [descValor, setDescValor] = useState('');
  const [descMotivo, setDescMotivo] = useState('');
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);
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

  function abrirDescuento() {
    setDescTipo((apartado.descuentoTipo as 'PORCENTAJE' | 'MONTO' | null) || 'PORCENTAJE');
    setDescValor(apartado.descuentoValor || '');
    setDescMotivo(apartado.descuentoMotivo || '');
    setMensaje(null);
    setMostrarDescuento(true);
  }

  async function guardarDescuento() {
    const valorNum = Number(descValor);
    if (!valorNum || valorNum <= 0) {
      setMensaje('Captura el % o el monto del descuento.');
      return;
    }
    if (descTipo === 'PORCENTAJE' && valorNum > 100) {
      setMensaje('El descuento por porcentaje no puede ser mayor a 100%.');
      return;
    }
    setGuardandoDescuento(true);
    try {
      await api(`/apartados/${apartado.id}/aplicar-descuento`, {
        method: 'POST',
        body: JSON.stringify({ tipoDescuento: descTipo, valor: valorNum, motivo: descMotivo.trim() || undefined }),
      });
      setMostrarDescuento(false);
      toast({ title: 'Descuento aplicado', variant: 'success' });
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al aplicar el descuento.');
    } finally {
      setGuardandoDescuento(false);
    }
  }

  async function quitarDescuento() {
    setGuardandoDescuento(true);
    try {
      await api(`/apartados/${apartado.id}/quitar-descuento`, { method: 'POST' });
      toast({ title: 'Descuento quitado', variant: 'success' });
      onCambio();
    } catch (err) {
      toast({ title: 'No se pudo quitar el descuento', description: err instanceof ApiError ? err.message : undefined, variant: 'destructive' });
    } finally {
      setGuardandoDescuento(false);
    }
  }

  const urgencia = urgenciaApartado(apartado);

  return (
    <div
      className={`card overflow-hidden !p-0 ${
        urgencia === 'vencido' ? 'border-destructive/40' : urgencia === 'proximo' ? 'border-warning/40' : ''
      }`}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors">
        <ProductoThumb
          url={imagenPrincipal(apartado.items[0]?.variante.producto, apartado.items[0]?.variante.color)}
          alt=""
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{apartado.cliente.nombre}</span>
            <StatusBadge tono={ESTADO_TONO[apartado.estado]}>{apartado.estado}</StatusBadge>
            {urgencia === 'vencido' && <StatusBadge tono="destructive">Vencido</StatusBadge>}
            {urgencia === 'proximo' && <StatusBadge tono="warning">Por vencer</StatusBadge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {apartado.folio} · {apartado.sucursalVenta?.nombre} · {resumenArticulos(apartado)}
          </div>
          <div className="text-xs text-muted-foreground truncate">{apartado.cliente.telefono}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums">
            {apartado.saldoPendiente > 0.01 ? `Saldo: $${apartado.saldoPendiente.toFixed(2)}` : `Total: $${apartado.total}`}
          </div>
          <div className={`text-xs ${urgencia === 'vencido' ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
            {textoFechaLimite(apartado)}
          </div>
        </div>
        {expandido ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expandido && (
        <div className="space-y-4 border-t border-border p-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Artículos ({apartado.items.length})
            </h3>
            <div className="space-y-1.5">
              {apartado.items.map((it) => {
                const detalle = [it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ');
                return (
                  <div key={it.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2">
                    <ProductoThumb url={imagenPrincipal(it.variante.producto, it.variante.color)} alt={it.variante.producto.nombre} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {it.variante.producto.nombre}
                        {detalle ? ` (${detalle})` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        SKU {it.variante.sku} · sale de {it.sucursalStock?.nombre ?? '—'} · x{it.cantidad}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">${it.subtotal}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {Number(apartado.descuentoMonto) > 0 && (
            <div className="rounded-lg border border-primary/30 bg-accent/40 p-2.5 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  ${apartado.items.reduce((acc, it) => acc + Number(it.subtotal), 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between font-medium text-primary">
                <span>Descuento{apartado.descuentoTipo === 'PORCENTAJE' ? ` (${apartado.descuentoValor}%)` : ''}</span>
                <span className="tabular-nums">-${Number(apartado.descuentoMonto).toFixed(2)}</span>
              </div>
              {apartado.descuentoMotivo && (
                <div className="mt-0.5 text-xs text-muted-foreground">Motivo: {apartado.descuentoMotivo}</div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagos / abonos</h3>
            {apartado.pagos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin abonos todavía.</p>
            ) : (
              <div className="space-y-1.5">
                {apartado.pagos.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {etiquetaMetodoPago(p.metodoPago)}
                        {p.cuentaTransferencia ? ` (${p.cuentaTransferencia.nombre})` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.registradoPor?.nombre} · {formatearFechaHora(p.createdAt)}
                        {p.comprobanteUrl && (
                          <>
                            {' · '}
                            <a href={p.comprobanteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              ver comprobante
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold tabular-nums">${p.monto}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {apartado.estado === 'ACTIVO' && (
            <div className="space-y-2.5 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={abrirDescuento}>
                  <Tag className="w-3.5 h-3.5" />
                  {Number(apartado.descuentoMonto) > 0 ? 'Editar descuento' : 'Aplicar descuento'}
                </Button>
                {Number(apartado.descuentoMonto) > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={quitarDescuento}
                    disabled={guardandoDescuento}
                  >
                    Quitar descuento
                  </Button>
                )}
              </div>

              {mostrarDescuento && (
                <div className="space-y-2 rounded-lg bg-secondary/50 p-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-32">
                      <label className="text-xs">Tipo</label>
                      <Select value={descTipo} onChange={(e) => setDescTipo(e.target.value as typeof descTipo)}>
                        <option value="PORCENTAJE">Porcentaje (%)</option>
                        <option value="MONTO">Monto fijo ($)</option>
                      </Select>
                    </div>
                    <div className="w-28">
                      <label className="text-xs">Valor</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={descValor}
                        onChange={(e) => setDescValor(e.target.value)}
                        placeholder={descTipo === 'PORCENTAJE' ? 'Ej. 10' : 'Ej. 100.00'}
                      />
                    </div>
                    <div className="min-w-[9rem] flex-1">
                      <label className="text-xs">Motivo (opcional)</label>
                      <Input value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} placeholder="Ej. para liquidar hoy" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={guardarDescuento} disabled={guardandoDescuento}>
                      {guardandoDescuento ? 'Guardando…' : 'Guardar descuento'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setMostrarDescuento(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <label className="text-xs">Monto del abono</label>
                  <Input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMonto(apartado.saldoPendiente.toFixed(2))}
                >
                  Saldar todo (${apartado.saldoPendiente.toFixed(2)})
                </Button>
              </div>
              <div className="grid max-w-xs grid-cols-3 gap-2">
                {METODOS_PAGO.map((m) => {
                  const activo = metodoPago === m.valor;
                  const Icono = m.valor === 'EFECTIVO' ? Banknote : m.valor === 'TARJETA' ? CreditCard : Landmark;
                  return (
                    <button
                      key={m.valor}
                      type="button"
                      onClick={() => setMetodoPago(m.valor)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                        activo ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      <Icono className="w-4 h-4" />
                      {m.etiqueta}
                    </button>
                  );
                })}
              </div>
              {metodoPago === 'TRANSFERENCIA' && (
                <div className="flex flex-wrap items-end gap-2">
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
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" onClick={registrarAbono} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Registrar abono'}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmarCancelar(true)}>
                  Cancelar apartado
                </Button>
                {apartado.ticketPdfUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={apartado.ticketPdfUrl} target="_blank" rel="noreferrer">
                      <FileText className="w-3.5 h-3.5" />
                      Ver comprobante (PDF)
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {apartado.estado !== 'ACTIVO' && apartado.ticketPdfUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={apartado.ticketPdfUrl} target="_blank" rel="noreferrer">
                <FileText className="w-3.5 h-3.5" />
                Ver comprobante (PDF)
              </a>
            </Button>
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
                    Ver comprobante actualizado (PDF)
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
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
    </div>
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
  const [cantidad, setCantidad] = useState(1);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [fechaLimite, setFechaLimite] = useState('');
  const [notas, setNotas] = useState('');

  // Descuento libre (opcional) al momento de crear el apartado — mismo
  // criterio que en Ventas: oculto por default, el monto real en pesos lo
  // calcula y valida el servidor, aquí solo se muestra un preview.
  const [aplicarDescuento, setAplicarDescuento] = useState(false);
  const [descuentoTipo, setDescuentoTipo] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [descuentoValor, setDescuentoValor] = useState('');
  const [descuentoMotivo, setDescuentoMotivo] = useState('');

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

  // Sin debounce esto disparaba una petición por cada tecla — en tablet,
  // donde escribir en el teclado en pantalla ya es más lento, eso se sentía
  // como que la búsqueda "se traba". Con sucursal elegida y SIN texto
  // todavía se trae y se muestra TODO el stock de esa sucursal (ver más
  // abajo, ya no hace falta escribir para que aparezca algo) — para poder
  // recorrerlo con el dedo en vez de depender del teclado.
  useEffect(() => {
    if (!sucursalStockId) {
      setExistencias([]);
      return;
    }
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ sucursalId: sucursalStockId });
      if (busquedaProducto.trim()) qs.set('skuOProducto', busquedaProducto.trim());
      api<Existencia[]>(`/inventario/existencias?${qs.toString()}`).then((data) =>
        setExistencias(
          data
            .filter((e) => e.stockActual > 0)
            .sort((a, b) => a.variante.producto.nombre.localeCompare(b.variante.producto.nombre))
        )
      );
    }, 300);
    return () => clearTimeout(t);
  }, [sucursalStockId, busquedaProducto]);

  const totalCarrito = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
  const descuentoValorNum = Number(descuentoValor) || 0;
  const descuentoMontoPreview =
    aplicarDescuento && descuentoValorNum > 0
      ? Math.min(descuentoTipo === 'PORCENTAJE' ? totalCarrito * (descuentoValorNum / 100) : descuentoValorNum, totalCarrito)
      : 0;
  const totalConDescuento = totalCarrito - descuentoMontoPreview;

  // Se agrega directo al tocar el renglón del resultado de búsqueda (ver
  // más abajo) en vez de elegirlo en un <select> y luego dar clic aparte en
  // "Agregar" — un paso menos, y se ve la foto de cada opción antes de
  // elegir en vez de una línea de texto comprimida.
  function agregarAlCarrito(existencia: Existencia) {
    if (!sucursalStockId) return;
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
    setBusquedaProducto('');
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
    setCantidad(1);
    setCarrito([]);
    setFechaLimite('');
    setNotas('');
    setAplicarDescuento(false);
    setDescuentoTipo('PORCENTAJE');
    setDescuentoValor('');
    setDescuentoMotivo('');
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
    if (aplicarDescuento && descuentoValorNum <= 0) {
      setMensaje('Captura el % o el monto del descuento, o desactiva "Aplicar descuento".');
      return;
    }
    if (aplicarDescuento && descuentoTipo === 'PORCENTAJE' && descuentoValorNum > 100) {
      setMensaje('El descuento por porcentaje no puede ser mayor a 100%.');
      return;
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
      if (aplicarDescuento && descuentoValorNum > 0) {
        datos.descuentoTipo = descuentoTipo;
        datos.descuentoValor = descuentoValorNum;
        datos.descuentoMotivo = descuentoMotivo.trim() || undefined;
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
              <div className="w-44">
                <label>Sucursal de stock</label>
                <Select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
                  <option value="">Selecciona...</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </Select>
              </div>
              <div className="relative min-w-[200px] flex-1">
                <label>Buscar SKU / producto</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                    placeholder={sucursalStockId ? 'Nombre o SKU…' : 'Elige primero la sucursal de stock'}
                    disabled={!sucursalStockId}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-20">
                <label>Cantidad</label>
                <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
              </div>
            </div>

            {/* Resultados: aparecen en cuanto se elige la sucursal, SIN
                necesidad de escribir nada — en tablet, poder recorrerlos
                con el dedo es mucho más rápido que escribir en el teclado
                en pantalla. Escribir en el buscador de arriba solo acota la
                lista. Una fila por existencia, con foto, y se agrega
                directo al tocarla (ver agregarAlCarrito) — nada de "elegir
                y luego dar clic en Agregar" aparte. Sin scroll propio (se
                deja crecer dentro del panel, que ya se desplaza completo):
                una lista con su propio scroll adentro de otra que también
                hace scroll es justo lo que se sentía "difícil de usar" en
                touch — el dedo nunca sabe cuál de las dos está agarrando. */}
            {!sucursalStockId ? (
              <p className="text-sm text-muted-foreground">Elige primero de qué sucursal sale el stock para ver sus productos.</p>
            ) : existencias.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {busquedaProducto.trim() ? 'Sin existencias que coincidan con esa búsqueda.' : 'Esta sucursal no tiene stock disponible.'}
              </p>
            ) : (
              (() => {
                const SIN_BUSQUEDA_LIMITE = 30;
                const buscando = busquedaProducto.trim().length > 0;
                const visibles = buscando ? existencias : existencias.slice(0, SIN_BUSQUEDA_LIMITE);
                return (
                  <div className="space-y-2">
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {visibles.map((e) => (
                        <button
                          key={claveExistencia(e)}
                          type="button"
                          onClick={() => agregarAlCarrito(e)}
                          className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary active:bg-secondary"
                        >
                          <ProductoThumb url={imagenPrincipal(e.variante.producto, e.variante.color)} alt="" size={44} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {e.variante.producto.nombre}
                              {e.variante.talla ? ` (${e.variante.talla.valor})` : ''}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              SKU {e.variante.sku} · {e.proveedor?.nombre ?? 'sin proveedor'} · stock: {e.stockActual}
                            </div>
                          </div>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Plus className="w-4 h-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                    {!buscando && existencias.length > SIN_BUSQUEDA_LIMITE && (
                      <p className="text-xs text-muted-foreground">
                        Mostrando {SIN_BUSQUEDA_LIMITE} de {existencias.length} productos — escribe en el buscador para encontrar algo más específico.
                      </p>
                    )}
                  </div>
                );
              })()
            )}

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

            {carrito.length > 0 && (
              <div className="space-y-0.5">
                {descuentoMontoPreview > 0 && (
                  <p className="text-sm text-muted-foreground tabular-nums">Subtotal: ${totalCarrito.toFixed(2)}</p>
                )}
                {descuentoMontoPreview > 0 && (
                  <p className="text-sm text-primary tabular-nums">Descuento: -${descuentoMontoPreview.toFixed(2)}</p>
                )}
                <p className="text-sm font-semibold tabular-nums">Total: ${totalConDescuento.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aplicarDescuento} onChange={(e) => setAplicarDescuento(e.target.checked)} />
              Aplicar descuento
            </label>

            {aplicarDescuento && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <label>Tipo</label>
                  <Select value={descuentoTipo} onChange={(e) => setDescuentoTipo(e.target.value as typeof descuentoTipo)}>
                    <option value="PORCENTAJE">Porcentaje (%)</option>
                    <option value="MONTO">Monto fijo ($)</option>
                  </Select>
                </div>
                <div className="w-28">
                  <label>Valor</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={descuentoValor}
                    onChange={(e) => setDescuentoValor(e.target.value)}
                    placeholder={descuentoTipo === 'PORCENTAJE' ? 'Ej. 10' : 'Ej. 100.00'}
                  />
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label>Motivo (opcional)</label>
                  <Input value={descuentoMotivo} onChange={(e) => setDescuentoMotivo(e.target.value)} placeholder="Ej. cliente frecuente" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={conAnticipo} onChange={(e) => setConAnticipo(e.target.checked)} />
              Registrar un anticipo ahora
            </label>

            {conAnticipo && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-28">
                    <label>Monto</label>
                    <Input type="number" min={0} step="0.01" value={montoAnticipo} onChange={(e) => setMontoAnticipo(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {METODOS_PAGO.map((m) => {
                      const activo = metodoAnticipo === m.valor;
                      const Icono = m.valor === 'EFECTIVO' ? Banknote : m.valor === 'TARJETA' ? CreditCard : Landmark;
                      return (
                        <button
                          key={m.valor}
                          type="button"
                          onClick={() => setMetodoAnticipo(m.valor)}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                            activo ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                          }`}
                        >
                          <Icono className="w-4 h-4" />
                          {m.etiqueta}
                        </button>
                      );
                    })}
                  </div>
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
