'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  Send,
  FileText,
  Download,
  CalendarClock,
  Receipt,
  History,
  ShoppingBag,
  Plus,
  Minus,
  Wallet,
  ChevronRight,
  User,
  Barcode,
  Tag,
  Trash2,
  Banknote,
  CreditCard,
  Landmark,
  MessageSquarePlus,
  LayoutGrid,
} from 'lucide-react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { formatearFechaHora, formatearHora, formatoMonedaExacto } from '@/lib/utils';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface Sucursal {
  id: number;
  nombre: string;
}

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
}

interface Proveedor {
  id: number;
  nombre: string;
}

interface Categoria {
  id: number;
  nombre: string;
}

interface VentaItem {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  // Null cuando el renglón es un producto NO registrado en el catálogo (ver
  // descripcionLibre) — no descontó inventario ni tiene SKU/talla/foto.
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  } | null;
  descripcionLibre?: string | null;
  proveedor?: { id: number; nombre: string } | null;
}

interface Venta {
  id: number;
  folio: string;
  cliente: string | null;
  // Teléfono capturado en el punto de venta para mandar el ticket digital.
  clienteTelefono: string | null;
  total: string;
  estado: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  comprobanteUrl: string | null;
  cuentaTransferencia: { nombre: string } | null;
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string; telefono?: string | null };
  // Descuento libre que el cajero puede aplicar al cobrar (opcional).
  descuentoTipo: 'PORCENTAJE' | 'MONTO' | null;
  descuentoValor: string | null;
  descuentoMonto: string;
  descuentoMotivo: string | null;
  // Efectivo entregado por el cliente, solo con metodoPago = EFECTIVO — se
  // usa para mostrar el cambio dado en el ticket.
  efectivoRecibido: string | null;
  // Número que se muestra como "contáctanos" dentro del ticket: el WhatsApp
  // propio de la sucursal si lo tiene, si no el general de la tienda. Ya
  // viene resuelto desde el backend (ver GET/POST /ventas).
  whatsappContacto: string | null;
  // Resultado del envío automático por WhatsApp Business Platform (Cloud
  // API), solo presente en la respuesta de POST /ventas. Si enviado=false
  // (no configurado todavía, o Meta rechazó el mensaje), se ofrece el link
  // manual de wa.me como respaldo — ver construirLinkTicket.
  ticketDigital?: { enviado: boolean; error?: string } | null;
  // PDF del ticket (generado en el servidor, subido a Cloudinary). Se puede
  // abrir/descargar siempre que se haya generado, aunque el envío
  // automático por WhatsApp haya fallado o no esté configurado todavía.
  ticketPdfUrl: string | null;
  items: VentaItem[];
}

// Un renglón por (variante, proveedor, sucursal): la misma talla puede
// aparecer varias veces si más de un proveedor tiene stock de ella, y ahora
// que la búsqueda es global (sin sucursalId) también puede repetirse una vez
// por cada sucursal donde exista.
interface Existencia {
  id: number | null;
  sucursalId: number;
  sucursal: { id: number; nombre: string } | null;
  proveedorId: number | null;
  proveedor: { id: number; nombre: string } | null;
  stockActual: number;
  variante: {
    id: number;
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: {
      // id/marca se usan para agrupar las existencias (una por talla) en
      // una sola tarjeta por producto en la vista de catálogo — ver
      // agruparPorProducto más abajo.
      id: number;
      nombre: string;
      precioVenta: string;
      marca?: { nombre: string } | null;
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
  };
}

// Identifica un bucket concreto (variante + proveedor + sucursal) para usarlo
// como key/value, ya que un mismo varianteId puede repetirse.
function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}:${e.sucursalId}`;
}

// Una tarjeta del catálogo visual (grid tipo "Productos populares") es un
// PRODUCTO, no una existencia — un mismo tenis con 5 tallas distintas ocupa
// una sola tarjeta, no cinco. Esto agrupa la lista plana que regresa
// /inventario/existencias (un renglón por variante+proveedor) en una
// tarjeta por producto, sumando el stock de todas sus tallas/proveedores y
// quedándose con el primer SKU/imagen que encuentra como referencia.
interface ProductoAgrupado {
  productoId: number;
  nombre: string;
  skuRef: string;
  imagenUrl: string | null;
  precio: number;
  stockTotal: number;
  // Todas las existencias (una por talla/color/proveedor) de este producto
  // en la sucursal elegida — si son más de una, la tarjeta pide elegir
  // talla antes de agregar (ver TarjetaProductoGrid).
  variantes: Existencia[];
}

function agruparPorProducto(lista: Existencia[]): ProductoAgrupado[] {
  const mapa = new Map<number, ProductoAgrupado>();
  for (const e of lista) {
    const p = e.variante.producto;
    const existente = mapa.get(p.id);
    if (existente) {
      existente.stockTotal += e.stockActual;
      existente.variantes.push(e);
    } else {
      mapa.set(p.id, {
        productoId: p.id,
        nombre: p.nombre,
        skuRef: e.variante.sku,
        imagenUrl: imagenPrincipal(p, e.variante.color),
        precio: Number(p.precioVenta),
        stockTotal: e.stockActual,
        variantes: [e],
      });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Botones +/- para cambiar cantidad sin tener que borrar y volver a teclear
// un número — más rápido de tocar en tablet/pantalla táctil que el input
// numérico solo, y sigue permitiendo llegar directo al mínimo/máximo cuando
// están deshabilitados.
function SelectorCantidad({
  cantidad,
  onCambiar,
  min = 1,
  max,
}: {
  cantidad: number;
  onCambiar: (nueva: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onCambiar(cantidad - 1)}
        disabled={cantidad <= min}
        aria-label="Quitar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{cantidad}</span>
      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        disabled={max !== undefined && cantidad >= max}
        aria-label="Agregar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Tarjeta de una tarjeta del catálogo visual. Si el producto tiene una sola
// talla/variante, tocar la tarjeta la agrega directo al ticket; si tiene
// varias, primero despliega los chips de talla para que el cajero elija
// (no se puede adivinar cuál quiere) — igual que elegir talla en cualquier
// tienda de tenis, pero pensado para tocarse con el dedo en una tablet.
function TarjetaProductoGrid({
  producto,
  expandido,
  onClic,
  onElegirTalla,
}: {
  producto: ProductoAgrupado;
  expandido: boolean;
  onClic: () => void;
  onElegirTalla: (e: Existencia) => void;
}) {
  const multiple = producto.variantes.length > 1;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <button type="button" onClick={onClic} className="flex flex-1 flex-col gap-2 text-left">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-secondary/50 p-2">
          {producto.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagenUrl} alt={producto.nombre} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-full w-full rounded bg-secondary" />
          )}
        </div>
        <div>
          <div className="line-clamp-2 text-sm font-medium leading-tight">{producto.nombre}</div>
          <div className="truncate text-xs text-muted-foreground">{producto.skuRef}</div>
        </div>
      </button>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tabular-nums text-primary">{formatoMonedaExacto(producto.precio)}</span>
        <span className="text-xs text-muted-foreground">Stock: {producto.stockTotal}</span>
      </div>
      {multiple &&
        (expandido ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {producto.variantes.map((v) => (
              <button
                key={claveExistencia(v)}
                type="button"
                onClick={() => onElegirTalla(v)}
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
              >
                {v.variante.talla?.valor ?? v.variante.color ?? 'Único'}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">{producto.variantes.length} tallas · toca para elegir</div>
        ))}
    </div>
  );
}

// Billetes que tiene sentido ofrecer como atajo para "Efectivo recibido",
// según el total a cobrar: no tiene caso mostrar el botón de $50 si la
// cuenta ya va en $600. Si el total supera el billete más grande (raro,
// pero pasa con compras grandes), se sugiere el siguiente múltiplo de $500
// arriba del total en vez de no mostrar nada.
function billetesSugeridos(total: number): number[] {
  const denominaciones = [20, 50, 100, 200, 500, 1000];
  const sugeridos = denominaciones.filter((d) => d >= total);
  if (sugeridos.length === 0 && total > 0) {
    sugeridos.push(Math.ceil(total / 500) * 500);
  }
  return sugeridos.slice(0, 4);
}

// Un renglón del carrito de la venta actual: la misma existencia (variante +
// proveedor) puede aparecer varias veces en una compra si el cliente pide
// varios artículos distintos, por eso el carrito es una lista de renglones
// en vez de un solo "seleccionado" — antes solo se podía vender un producto
// a la vez porque el formulario solo guardaba una selección.
//
// Un renglón también puede ser "libre": un producto que NO está dado de
// alta en el catálogo (ver POST /ventas → descripcionLibre). No tiene
// Existencia ni límite de stock — el cajero captura descripción, proveedor
// (opcional, solo de referencia) y precio a mano.
interface ItemCarritoVariante {
  tipo: 'variante';
  key: string;
  existencia: Existencia;
  cantidad: number;
}
interface ItemCarritoLibre {
  tipo: 'libre';
  key: string;
  descripcion: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  precioUnitario: number;
  cantidad: number;
}
type ItemCarrito = ItemCarritoVariante | ItemCarritoLibre;

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

const ESTADO_TONO: Record<string, 'success' | 'destructive' | 'neutral'> = {
  COMPLETADA: 'success',
  CANCELADA: 'destructive',
};

function etiquetaMetodoPago(v: Venta['metodoPago']) {
  return v === 'EFECTIVO' ? 'Efectivo' : v === 'TARJETA' ? 'Tarjeta' : 'Transferencia';
}

// Ticket digital para ventas de tienda física: se manda por WhatsApp con el
// mismo mecanismo de click-to-chat que ya se usa para el pago de pedidos en
// línea (ver app/tienda/pedidos/[id]/page.tsx) — no hay envío automático,
// el cajero abre el link con el mensaje ya armado y lo manda desde su
// WhatsApp. Aquí el número del link SÍ es el del cliente (a diferencia de
// pedidos en línea, donde el cliente le escribe a la tienda): el ticket va
// del negocio hacia el cliente.
function formatearTelefonoWhatsapp(telefono: string): string {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 10) digitos = '52' + digitos; // sin código de país -> asumimos México
  return digitos;
}

function construirTicketTexto(venta: Venta, notaExtra?: string): string {
  const articulos = venta.items
    .map((it) => {
      if (!it.variante) {
        // Producto no registrado en el catálogo (ver descripcionLibre).
        return `- ${it.descripcionLibre ?? 'Producto no registrado'} x${it.cantidad} — $${it.subtotal}`;
      }
      const detalle = [it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ');
      return `- ${it.variante.producto.nombre}${detalle ? ` (${detalle})` : ''} x${it.cantidad} — $${it.subtotal}`;
    })
    .join('\n');
  const etiquetaPago = METODOS_PAGO.find((m) => m.valor === venta.metodoPago)?.etiqueta || venta.metodoPago;
  const descuentoMonto = Number(venta.descuentoMonto || 0);
  const cambio =
    venta.metodoPago === 'EFECTIVO' && venta.efectivoRecibido != null
      ? Number(venta.efectivoRecibido) - Number(venta.total)
      : null;

  return [
    'Ticket de compra — Camino al Deporte',
    `Folio: ${venta.folio}`,
    `Fecha: ${formatearFechaHora(venta.createdAt)}`,
    venta.sucursal?.nombre ? `Sucursal: ${venta.sucursal.nombre}` : '',
    venta.usuario?.nombre ? `Vendedor: ${venta.usuario.nombre}` : '',
    '',
    'Artículos:',
    articulos,
    '',
    descuentoMonto > 0
      ? `Descuento${venta.descuentoTipo === 'PORCENTAJE' ? ` (${venta.descuentoValor}%)` : ''}: -$${descuentoMonto.toFixed(2)}`
      : '',
    `Total: $${venta.total}`,
    `Método de pago: ${etiquetaPago}`,
    venta.efectivoRecibido != null ? `Efectivo recibido: $${Number(venta.efectivoRecibido).toFixed(2)}` : '',
    cambio !== null ? `Cambio: $${cambio.toFixed(2)}` : '',
    // Observación libre que el cajero capturó al cobrar ("+ Agregar
    // observaciones" en el ticket) — es solo texto que viaja en este
    // mensaje de WhatsApp, no se guarda en la base de datos ni en el
    // historial de ventas.
    notaExtra?.trim() ? `Nota: ${notaExtra.trim()}` : '',
    '',
    '¡Gracias por tu compra!',
    venta.whatsappContacto ? `Dudas o cambios, contáctanos: ${venta.whatsappContacto}` : '',
  ].join('\n');
}

function construirLinkTicket(venta: Venta, notaExtra?: string): string | null {
  if (!venta.clienteTelefono) return null;
  const numero = formatearTelefonoWhatsapp(venta.clienteTelefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(construirTicketTexto(venta, notaExtra))}`;
}

// Fuerza la descarga del PDF (en vez de solo abrirlo en una pestaña) para
// cuando el envío automático por WhatsApp Cloud API no esté configurado o
// falle (ej. falta el método de pago en Meta Business, sucursal sin Phone
// Number ID, etc.): el vendedor descarga el PDF aquí y lo adjunta a mano en
// el chat de WhatsApp del cliente.
//
// El link normal de Cloudinary (ticketPdfUrl) solo lo ABRE en una pestaña
// nueva — el atributo HTML "download" de <a> no funciona con URLs de otro
// dominio (cross-origin), así que en vez de eso se usa el flag "fl_attachment"
// de Cloudinary, que agrega el header Content-Disposition: attachment desde
// el propio servidor de Cloudinary y sí obliga la descarga en cualquier
// navegador. Ver https://cloudinary.com/documentation/image_transformations#attribute_fl_attachment
function construirLinkDescargaTicket(ticketPdfUrl: string, folio?: string | null): string {
  const nombreArchivo = folio ? `ticket-${folio}` : 'ticket';
  const flag = `fl_attachment:${encodeURIComponent(nombreArchivo)}`;
  if (ticketPdfUrl.includes('/upload/')) {
    return ticketPdfUrl.replace('/upload/', `/upload/${flag}/`);
  }
  // Por si algún día cambia el formato de URL de Cloudinary y no trae
  // "/upload/": mejor regresar el link normal (se abre, no se descarga
  // forzado) que romper el botón.
  return ticketPdfUrl;
}

export default function VentasPage() {
  const { usuario } = useAuth();
  // El vendedor (VENTAS) solo puede vender desde su propia sucursal
  // asignada; el selector se bloquea para ese rol. Admin/desarrollo sí
  // pueden elegir cualquier sucursal. Esto también se valida en el backend
  // (ver resolverSucursalId en routes/ventas.js) — el bloqueo aquí es solo
  // para no confundir al usuario, no es la única línea de defensa.
  const sucursalBloqueada = usuario?.rol === 'VENTAS';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargandoVentas, setCargandoVentas] = useState(true);

  // Búsqueda de producto: filtra en vivo (con un pequeño debounce) el
  // catálogo visual de abajo (ver catalogoGrid) — ya no es un dropdown, es
  // el mismo buscador el que decide qué tarjetas se muestran. También sigue
  // sirviendo para el lector de código de barras: al mandar Enter se agrega
  // directo sin esperar el debounce (ver manejarEnterBusqueda).
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Existencia | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Referencia al campo de búsqueda: se le regresa el foco después de
  // agregar cada artículo (clic, Enter o lector de código de barras) para
  // poder seguir agregando sin volver a tocar el mouse.
  const busquedaInputRef = useRef<HTMLInputElement | null>(null);

  const [cantidad, setCantidad] = useState(1);

  // Categorías (para las píldoras de filtro) y catálogo visual: el grid de
  // tarjetas que reemplaza al dropdown de resultados de antes. Se agrupa
  // por producto (ver agruparPorProducto) para que un mismo tenis con
  // varias tallas ocupe una sola tarjeta.
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [categoriasExpandidas, setCategoriasExpandidas] = useState(false);
  const [catalogoGrid, setCatalogoGrid] = useState<Existencia[]>([]);
  const [cargandoGrid, setCargandoGrid] = useState(false);
  // Por default solo se pintan las primeras tarjetas ("Productos
  // populares", como en cualquier POS) — "Ver todos los productos" quita el
  // límite. En cuanto se busca algo o se elige una categoría, el límite ya
  // no aplica (si no, parecería que el filtro "no encontró" el resto).
  const [mostrarTodosProductos, setMostrarTodosProductos] = useState(false);
  // Qué tarjeta tiene sus chips de talla desplegados (solo una a la vez).
  const [productoExpandidoId, setProductoExpandidoId] = useState<number | null>(null);

  // Carrito de la venta en curso: uno o más artículos disponibles en la
  // sucursal propia, cada uno con su cantidad. Los productos que solo están
  // en otra sucursal NO entran aquí — para esos sigue existiendo el flujo de
  // "Apartar para el cliente" de un solo artículo (ver seleccion más abajo).
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  // Observación libre y opcional del cajero (ej. "entregar en caja") — solo
  // viaja como texto en el ticket que se manda por WhatsApp al cobrar (ver
  // construirTicketTexto); no se guarda en la base de datos.
  const [mostrarNota, setMostrarNota] = useState(false);
  const [notaVenta, setNotaVenta] = useState('');

  // Formulario para agregar un renglón "producto no registrado" (fuera del
  // catálogo) al carrito — ver agregarLibreAlCarrito.
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mostrarFormLibre, setMostrarFormLibre] = useState(false);
  const [libreDescripcion, setLibreDescripcion] = useState('');
  const [libreProveedorId, setLibreProveedorId] = useState('');
  const [librePrecio, setLibrePrecio] = useState('');
  const [libreCantidad, setLibreCantidad] = useState('1');
  const [errorLibre, setErrorLibre] = useState('');

  // Venta local (producto disponible en la sucursal propia)
  const [cliente, setCliente] = useState('');
  // Opcional: solo se pide para poder mandar el ticket digital por WhatsApp
  // al terminar la venta. Sin él, la venta se registra igual.
  const [clienteTelefono, setClienteTelefono] = useState('');
  // Cliente/teléfono empiezan ocultos: la mayoría de las ventas no los
  // captura, así que no vale la pena que ocupen espacio siempre — se abren
  // con "+ Agregar datos del cliente" (ver limpiarSeleccion, que también
  // los vuelve a colapsar en cada venta nueva).
  const [mostrarDatosCliente, setMostrarDatosCliente] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);

  // Descuento libre (opcional): oculto por default, se abre con
  // "¿Aplicar descuento?" para no estorbar en la venta normal (sin
  // descuento). El monto real en pesos lo calcula y valida el servidor, acá
  // solo se manda el % o el monto que teclea el cajero.
  const [aplicarDescuento, setAplicarDescuento] = useState(false);
  const [descuentoTipo, setDescuentoTipo] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [descuentoValor, setDescuentoValor] = useState('');
  const [descuentoMotivo, setDescuentoMotivo] = useState('');

  // Link de WhatsApp del ticket de la última venta registrada, para
  // ofrecerlo justo después de cobrar (ver registrarVenta).
  const [ticketLink, setTicketLink] = useState<string | null>(null);
  // PDF del ticket de la última venta — se ofrece aparte del link de
  // WhatsApp de arriba: sirve incluso si el envío automático falló, o si
  // el cajero solo quiere verlo/imprimirlo.
  const [ticketPdfUrl, setTicketPdfUrl] = useState<string | null>(null);
  // Folio de esa misma venta, solo para nombrar el archivo al descargar el
  // PDF (ver botón "Descargar PDF" / construirLinkDescargaTicket).
  const [ticketFolio, setTicketFolio] = useState<string | null>(null);

  // Apartado (producto solo disponible en otra sucursal): no se vende
  // directamente, se aparta para el cliente y el stock se reserva en la
  // sucursal donde sí hay — ver POST /apartados.
  const [clienteNombreApartado, setClienteNombreApartado] = useState('');
  const [clienteTelefonoApartado, setClienteTelefonoApartado] = useState('');

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then((data) => {
      setSucursales(data);
      const inicial = usuario?.sucursalId ? String(usuario.sucursalId) : data[0] ? String(data[0].id) : '';
      setSucursalId(inicial);
    });
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
    // Para el selector de proveedor del formulario "producto no registrado"
    // (?todas=1: incluye inactivos, igual criterio que en historial/edición).
    api<Proveedor[]>('/proveedores?todas=1').then(setProveedores);
    // Para las píldoras de categoría del catálogo visual.
    api<Categoria[]>('/catalogos/categorias').then(setCategorias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setCargandoVentas(true);
    try {
      const v = await api<Venta[]>('/ventas');
      setVentas(v);
    } finally {
      setCargandoVentas(false);
    }
  }

  useEffect(() => {
    cargar();
    setSeleccion(null);
    setBusqueda('');
    // El carrito son existencias de una sucursal concreta — al cambiar de
    // sucursal ya no aplican (el stock disponible es otro), así que se
    // vacía en vez de arrastrar renglones que ya no son válidos.
    setCarrito([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  // Consulta cruda de existencias por texto (nombre o SKU), ya filtrada a
  // solo lo que tiene stock. Busca en TODAS las sucursales (sin
  // ?sucursalId=) — así, al agregar (ver procesarExistencia), se puede
  // saber de un vistazo si lo que pide el cliente está en la sucursal
  // propia o solo en otra. La usa el Enter/lector de código de barras (ver
  // manejarEnterBusqueda) — el catálogo visual de abajo tiene su propio
  // efecto con debounce (ver catalogoGrid), que sí es siempre de la
  // sucursal elegida.
  async function buscarExistencias(termino: string): Promise<Existencia[]> {
    const data = await api<Existencia[]>(`/inventario/existencias?skuOProducto=${encodeURIComponent(termino)}`);
    return data.filter((e) => e.stockActual > 0);
  }

  // Catálogo visual (grid de tarjetas) de la sucursal elegida: se vuelve a
  // pedir cada vez que cambia la sucursal, la categoría elegida o el texto
  // de búsqueda (con debounce, para no mandar una petición por cada tecla).
  // A diferencia del Enter/lector de código de barras, esto NUNCA agrega
  // nada al carrito por sí solo — solo decide qué tarjetas se pintan.
  useEffect(() => {
    if (!sucursalId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCargandoGrid(true);
      try {
        const params = new URLSearchParams({ sucursalId });
        if (categoriaId) params.set('categoriaId', categoriaId);
        if (busqueda.trim().length >= 2) params.set('skuOProducto', busqueda.trim());
        const data = await api<Existencia[]>(`/inventario/existencias?${params.toString()}`);
        setCatalogoGrid(data.filter((e) => e.stockActual > 0));
      } finally {
        setCargandoGrid(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sucursalId, categoriaId, busqueda]);

  // Punto de entrada único para "ya se eligió qué vender", venga de tocar
  // una tarjeta/chip de talla en el grid o de escanear+Enter en el
  // buscador. Si el producto SÍ está en la sucursal propia, se agrega
  // directo al carrito (puede ser el primero de varios); si solo está en
  // otra sucursal, no se puede vender de aquí — se guarda como "seleccion"
  // para ofrecer apartarlo (ver el panel de la derecha).
  function procesarExistencia(e: Existencia) {
    setMensaje(null);
    const esLocalResultado = e.sucursalId === Number(sucursalId);
    if (esLocalResultado) {
      agregarAlCarrito(e);
      setSeleccion(null);
    } else {
      setSeleccion(e);
      setBusqueda(`${e.variante.producto.nombre}${e.variante.talla ? ` (${e.variante.talla.valor})` : ''}`);
      setCantidad(1);
    }
  }

  // Enter en el buscador (o el lector de código de barras, que "teclea" el
  // SKU y manda Enter solo): agrega directo si hay un solo resultado o uno
  // cuyo SKU coincide exacto, sin esperar el debounce del grid. Si hay
  // varias coincidencias y ninguna es un SKU exacto, no se adivina cuál
  // quiso decir el cajero — se deja el texto tal cual, que ya está
  // filtrando el grid de abajo, y ahí se toca la tarjeta correcta.
  async function manejarEnterBusqueda() {
    const termino = busqueda.trim();
    if (!termino) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const candidatos = await buscarExistencias(termino);
    if (candidatos.length === 0) {
      setMensaje(`Sin existencias para "${termino}".`);
      return;
    }
    const exacto = candidatos.find((c) => c.variante.sku.toLowerCase() === termino.toLowerCase());
    const elegido = exacto ?? (candidatos.length === 1 ? candidatos[0] : null);
    if (elegido) {
      procesarExistencia(elegido);
      if (elegido.sucursalId === Number(sucursalId)) {
        setBusqueda('');
        // Regresa el foco al buscador para poder escanear/teclear el
        // siguiente artículo sin tocar el mouse.
        busquedaInputRef.current?.focus();
      }
    }
  }

  // Agrega una existencia al carrito. Si ya estaba (mismo variante +
  // proveedor + sucursal), solo suma 1 a la cantidad en vez de duplicar el
  // renglón — así buscar el mismo producto dos veces simplemente incrementa
  // la cantidad. Nunca deja pasar de la cantidad disponible en stock.
  function agregarAlCarrito(e: Existencia) {
    const key = claveExistencia(e);
    setCarrito((actual) => {
      const existente = actual.find((it) => it.key === key);
      if (existente) {
        if (existente.cantidad >= e.stockActual) return actual;
        return actual.map((it) => (it.key === key ? { ...it, cantidad: it.cantidad + 1 } : it));
      }
      return [...actual, { tipo: 'variante', key, existencia: e, cantidad: Math.min(1, e.stockActual) }];
    });
  }

  // Agrega un renglón "producto no registrado" (fuera del catálogo) al
  // carrito — a diferencia de agregarAlCarrito, cada uno es su propio
  // renglón nuevo (no hay una existencia con la que agrupar duplicados) y no
  // tiene límite de stock, porque no descuenta ningún inventario.
  function agregarLibreAlCarrito() {
    setErrorLibre('');
    const descripcion = libreDescripcion.trim();
    const precio = Number(librePrecio);
    const cant = Number(libreCantidad);
    if (descripcion.length < 3) {
      setErrorLibre('Describe qué se vendió (mínimo 3 caracteres).');
      return;
    }
    if (!librePrecio || !Number.isFinite(precio) || precio < 0) {
      setErrorLibre('Captura un precio válido.');
      return;
    }
    if (!libreCantidad || !Number.isInteger(cant) || cant <= 0) {
      setErrorLibre('Captura una cantidad válida.');
      return;
    }
    const proveedor = libreProveedorId ? proveedores.find((p) => p.id === Number(libreProveedorId)) : undefined;
    setCarrito((actual) => [
      ...actual,
      {
        tipo: 'libre',
        key: `libre-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        descripcion,
        proveedorId: proveedor ? proveedor.id : null,
        proveedorNombre: proveedor ? proveedor.nombre : null,
        precioUnitario: precio,
        cantidad: cant,
      },
    ]);
    setLibreDescripcion('');
    setLibreProveedorId('');
    setLibrePrecio('');
    setLibreCantidad('1');
    setMostrarFormLibre(false);
  }

  function quitarDelCarrito(key: string) {
    setCarrito((actual) => actual.filter((it) => it.key !== key));
  }

  // "Vaciar ticket": deja la venta en curso como si se acabara de entrar a
  // la pantalla, sin perder la sucursal/categoría elegidas (a diferencia de
  // limpiarSeleccion, que se llama después de cobrar y sí resetea todo).
  function vaciarCarrito() {
    setCarrito([]);
    setAplicarDescuento(false);
    setDescuentoValor('');
    setDescuentoMotivo('');
    setEfectivoRecibido('');
    setMostrarNota(false);
    setNotaVenta('');
  }

  // Cambia la cantidad de un renglón del carrito. Para un renglón normal,
  // siempre entre 1 y el stock disponible de esa existencia (no se puede
  // vender más de lo que hay); un renglón libre no tiene stock que
  // respetar, solo se cuida que sea un entero positivo.
  function cambiarCantidadCarrito(key: string, nuevaCantidad: number) {
    setCarrito((actual) =>
      actual.map((it) => {
        if (it.key !== key) return it;
        if (it.tipo === 'libre') {
          const cantidad = Number.isFinite(nuevaCantidad) ? Math.max(1, Math.round(nuevaCantidad)) : 1;
          return { ...it, cantidad };
        }
        const max = it.existencia.stockActual;
        const cantidad = Number.isFinite(nuevaCantidad) ? Math.max(1, Math.min(nuevaCantidad, max)) : 1;
        return { ...it, cantidad };
      })
    );
  }

  function limpiarSeleccion() {
    setSeleccion(null);
    setBusqueda('');
    setCantidad(1);
    setCarrito([]);
    setEfectivoRecibido('');
    setAplicarDescuento(false);
    setDescuentoTipo('PORCENTAJE');
    setDescuentoValor('');
    setDescuentoMotivo('');
    setMostrarFormLibre(false);
    setLibreDescripcion('');
    setLibreProveedorId('');
    setLibrePrecio('');
    setLibreCantidad('1');
    setErrorLibre('');
    setMostrarDatosCliente(false);
    setMostrarNota(false);
    setNotaVenta('');
    setProductoExpandidoId(null);
  }

  // El vendedor (VENTAS o admin probando con esa sucursal) nunca vende
  // directamente algo que no está físicamente en la sucursal elegida — si
  // el resultado es de otra sucursal, la única acción disponible es
  // apartarlo (ver más abajo), nunca "Registrar venta".
  const esLocal = seleccion ? seleccion.sucursalId === Number(sucursalId) : true;

  // Solo para el flujo de apartado (un artículo de otra sucursal): su propio
  // precio y "cantidad" separados del carrito de la venta directa.
  const precioUnitario = seleccion ? Number(seleccion.variante.producto.precioVenta) : 0;
  const subtotalApartado = precioUnitario * cantidad;

  // Suma de todos los renglones del carrito de la venta directa (uno o más
  // productos) — antes esto solo consideraba el único producto seleccionado.
  // Un renglón libre ya trae su propio precio capturado a mano, en vez de
  // leerlo del catálogo.
  const subtotalVenta = carrito.reduce(
    (acc, it) =>
      acc + (it.tipo === 'libre' ? it.precioUnitario : Number(it.existencia.variante.producto.precioVenta)) * it.cantidad,
    0
  );
  // Solo es una vista previa para el cajero — el monto real en pesos
  // siempre lo recalcula y valida el servidor (ver POST /ventas).
  const descuentoValorNum = Number(descuentoValor) || 0;
  const descuentoMontoPreview =
    aplicarDescuento && descuentoValorNum > 0
      ? Math.min(
          descuentoTipo === 'PORCENTAJE' ? subtotalVenta * (descuentoValorNum / 100) : descuentoValorNum,
          subtotalVenta
        )
      : 0;
  const totalVenta = subtotalVenta - descuentoMontoPreview;
  const cambio = efectivoRecibido.trim() ? Number(efectivoRecibido) - totalVenta : null;

  async function registrarVenta() {
    if (carrito.length === 0 || !sucursalId) return;
    if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
      setMensaje('Elige a qué cuenta llegó la transferencia.');
      return;
    }
    if (metodoPago === 'TRANSFERENCIA' && !comprobante) {
      setMensaje('Falta la foto del comprobante de transferencia.');
      return;
    }
    if (metodoPago === 'EFECTIVO') {
      if (!efectivoRecibido.trim()) {
        setMensaje('Captura cuánto efectivo recibiste, para calcular el cambio.');
        return;
      }
      if (cambio !== null && cambio < 0) {
        setMensaje(`El efectivo recibido no alcanza: faltan $${Math.abs(cambio).toFixed(2)}.`);
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
    setTicketLink(null);
    setTicketPdfUrl(null);
    setTicketFolio(null);
    try {
      const datos = {
        sucursalId: Number(sucursalId),
        cliente: cliente || undefined,
        clienteTelefono: clienteTelefono.trim() || undefined,
        metodoPago,
        cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
        efectivoRecibido: metodoPago === 'EFECTIVO' && efectivoRecibido.trim() ? Number(efectivoRecibido) : undefined,
        descuentoTipo: aplicarDescuento && descuentoValorNum > 0 ? descuentoTipo : undefined,
        descuentoValor: aplicarDescuento && descuentoValorNum > 0 ? descuentoValorNum : undefined,
        descuentoMotivo: aplicarDescuento && descuentoMotivo.trim() ? descuentoMotivo.trim() : undefined,
        // Uno o más renglones, cada uno con su propia variante, cantidad y
        // proveedor de stock — antes aquí solo podía ir un artículo porque
        // el formulario solo guardaba una selección. Un renglón "libre" no
        // manda varianteId, manda descripcionLibre en su lugar (ver POST
        // /ventas) — el servidor lo distingue por eso, no por otro campo.
        items: carrito.map((it) =>
          it.tipo === 'libre'
            ? {
                descripcionLibre: it.descripcion,
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                proveedorId: it.proveedorId,
              }
            : {
                varianteId: it.existencia.variante.id,
                cantidad: it.cantidad,
                precioUnitario: Number(it.existencia.variante.producto.precioVenta),
                // De qué proveedor sale el stock vendido — ya viene fijo desde
                // que se eligió el renglón en la búsqueda.
                proveedorId: it.existencia.proveedorId,
              }
        ),
      };

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      const creada = await apiUpload<Venta>('/ventas', formData);

      const baseMensaje =
        metodoPago === 'EFECTIVO' && cambio !== null && cambio > 0
          ? `Venta registrada. Cambio a dar: $${cambio.toFixed(2)}.`
          : 'Venta registrada.';

      setTicketPdfUrl(creada.ticketPdfUrl || null);
      setTicketFolio(creada.folio || null);

      if (creada.ticketDigital?.enviado) {
        // Ya se mandó solo por la API de WhatsApp (con el PDF adjunto) — no
        // se ofrece el botón manual para no arriesgar mandarlo dos veces.
        setMensaje(`${baseMensaje} Ticket (PDF) enviado automáticamente por WhatsApp.`);
        setTicketLink(null);
      } else {
        // Sin API configurada (o falló el envío): se ofrece el link manual
        // de siempre como respaldo, si el cliente dejó su teléfono — y el
        // PDF por su cuenta, para verlo o mandarlo a mano. Si sí se capturó
        // teléfono, mostramos también el motivo por el que no se mandó solo
        // (viene de config/whatsapp.js) para poder diagnosticar sin tener
        // que ir a revisar los logs del backend.
        const motivo = creada.clienteTelefono && creada.ticketDigital?.error ? ` (${creada.ticketDigital.error})` : '';
        setMensaje(`${baseMensaje}${motivo}`);
        setTicketLink(construirLinkTicket(creada, notaVenta));
      }
      limpiarSeleccion();
      setCliente('');
      setClienteTelefono('');
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);
      cargar();
      // Listo para la siguiente venta sin tener que volver a hacer clic en
      // el buscador.
      busquedaInputRef.current?.focus();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar la venta.');
    } finally {
      setGuardando(false);
    }
  }

  // Si el producto no está en la sucursal del vendedor pero sí en otra, en
  // vez de venderlo (o de "pedirlo" aparte) se aparta para el cliente: el
  // stock se reserva de inmediato en la sucursal donde sí hay (ver
  // ApartadoItem.sucursalStockId) y se notifica a esa sucursal y al admin —
  // reutiliza el mismo mecanismo de Apartados en vez de inventar uno nuevo.
  async function crearApartado() {
    if (!seleccion || !sucursalId) return;
    if (!clienteNombreApartado.trim() || !clienteTelefonoApartado.trim()) {
      setMensaje('Captura nombre y teléfono del cliente para poder apartarlo.');
      return;
    }
    setGuardando(true);
    setMensaje(null);
    setTicketLink(null);
    setTicketPdfUrl(null);
    setTicketFolio(null);
    try {
      await api('/apartados', {
        method: 'POST',
        body: JSON.stringify({
          clienteNuevo: { nombre: clienteNombreApartado.trim(), telefono: clienteTelefonoApartado.trim() },
          sucursalVentaId: Number(sucursalId),
          items: [
            {
              varianteId: seleccion.variante.id,
              proveedorId: seleccion.proveedorId,
              sucursalStockId: seleccion.sucursalId,
              cantidad,
              precioUnitario: precioUnitario,
            },
          ],
        }),
      });
      setMensaje(
        `Apartado creado — se notificó a ${seleccion.sucursal?.nombre ?? 'la sucursal'} y al admin. Puedes ` +
          'registrar el anticipo y darle seguimiento desde Apartados.'
      );
      limpiarSeleccion();
      setClienteNombreApartado('');
      setClienteTelefonoApartado('');
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el apartado.');
    } finally {
      setGuardando(false);
    }
  }

  const previewUrl = seleccion
    ? imagenPrincipal(seleccion.variante.producto, seleccion.variante.color)
    : null;

  // Solo las ventas de HOY (hora de México, ver ZONA_HORARIA_NEGOCIO) — esta
  // pantalla es donde se cobra todo el día, no donde se consulta el
  // histórico completo (para eso ya está /ventas/historial). GET /ventas
  // sigue trayendo todo el histórico del backend (no tiene filtro de
  // fecha todavía), así que este filtro es solo para no pintar cientos de
  // renglones aquí — no evita la descarga completa; si el catálogo de
  // ventas crece mucho valdría la pena agregar ?fecha= en el backend.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const ventasHoy = ventas.filter(
    (v) => new Date(v.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) === hoyISO
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px_auto] gap-5 items-start">
        {/* Columna izquierda: elegir qué se vende — sucursal, buscador,
            categorías y el catálogo visual (tarjetas con foto, como en
            tienda). El carrito y el cobro viven en el panel de la derecha
            (ver más abajo), que se queda fijo en pantalla mientras se sigue
            buscando aquí — así nunca hay que bajar hasta el fondo para dar
            clic en "Cobrar". */}
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="sm:w-52 shrink-0">
              {sucursalBloqueada ? (
                <div className="flex h-11 items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm font-medium truncate">
                  {sucursales.find((s) => String(s.id) === sucursalId)?.nombre || usuario?.sucursal?.nombre || '—'}
                </div>
              ) : (
                <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="h-11">
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </Select>
              )}
            </div>

            {/* Buscador: filtra en vivo las tarjetas de abajo. También es
                donde "escribe" el lector de código de barras — Enter agrega
                directo (ver manejarEnterBusqueda), sin necesitar mouse. */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={busquedaInputRef}
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setSeleccion(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    manejarEnterBusqueda();
                  }
                }}
                placeholder="Escanea o busca un producto, SKU o código de barras"
                className="pl-9 pr-10 h-11 text-base"
                autoFocus
              />
              <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {seleccion && !esLocal && (
            <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 p-1.5">
                <ProductoThumb url={previewUrl} alt={seleccion.variante.producto.nombre} size={48} fit="contain" />
              </div>
              <p className="text-xs text-warning">
                <strong>{seleccion.variante.producto.nombre}</strong> no está en tu sucursal — hay {seleccion.stockActual} en{' '}
                {seleccion.sucursal?.nombre ?? 'otra sucursal'}. No se puede vender directamente desde aquí; completa el panel de la
                derecha para apartarlo.
              </p>
            </div>
          )}

          {/* Categorías: píldoras generadas de Marcas y tallas → Categorías,
              igual que en Productos — "Todos" siempre primero. Si hay más
              de 6, el resto se esconde detrás de "Más" para no ocupar
              varias líneas por default. */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Categorías</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoriaId('')}
                className={`flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
                  categoriaId === '' ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Todos
              </button>
              {(categoriasExpandidas ? categorias : categorias.slice(0, 6)).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(String(c.id))}
                  className={`rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
                    categoriaId === String(c.id)
                      ? 'border-primary bg-accent text-primary'
                      : 'border-border bg-card text-foreground hover:bg-secondary'
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
              {categorias.length > 6 && (
                <button
                  type="button"
                  onClick={() => setCategoriasExpandidas((v) => !v)}
                  className="rounded-lg border border-border bg-card px-3 h-9 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {categoriasExpandidas ? 'Menos' : 'Más'}
                </button>
              )}
            </div>
          </div>

          {/* Catálogo visual: una tarjeta por producto (agrupa tallas, ver
              agruparPorProducto). Sin filtro activo solo se pintan las
              primeras — "Ver todos los productos" quita el límite. */}
          {(() => {
            const productosAgrupados = agruparPorProducto(catalogoGrid);
            const hayFiltro = busqueda.trim().length >= 2 || categoriaId !== '';
            const productosVisibles = mostrarTodosProductos || hayFiltro ? productosAgrupados : productosAgrupados.slice(0, 8);
            return (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {hayFiltro ? `Resultados (${productosAgrupados.length})` : 'Productos populares'}
                </h2>

                {cargandoGrid ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                    ))}
                  </div>
                ) : productosAgrupados.length === 0 ? (
                  <EmptyState
                    icon={ShoppingBag}
                    title="Sin existencias"
                    description={hayFiltro ? 'No hay productos con stock que coincidan con este filtro.' : 'Todavía no hay stock cargado en esta sucursal.'}
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {productosVisibles.map((p) => (
                      <TarjetaProductoGrid
                        key={p.productoId}
                        producto={p}
                        expandido={productoExpandidoId === p.productoId}
                        onClic={() => {
                          if (p.variantes.length === 1) {
                            procesarExistencia(p.variantes[0]);
                          } else {
                            setProductoExpandidoId((actual) => (actual === p.productoId ? null : p.productoId));
                          }
                        }}
                        onElegirTalla={(v) => {
                          procesarExistencia(v);
                          setProductoExpandidoId(null);
                        }}
                      />
                    ))}
                  </div>
                )}

                {!hayFiltro && !mostrarTodosProductos && productosAgrupados.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setMostrarTodosProductos(true)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Ver todos los productos
                  </button>
                )}
              </div>
            );
          })()}

          {/* Acciones rápidas: escanear/buscar solo regresan el foco al
              buscador de arriba (el lector de código de barras "escribe"
              ahí); descuento y vaciar operan directo sobre el ticket de la
              derecha. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => busquedaInputRef.current?.focus()}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 h-10 text-xs sm:text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Barcode className="w-4 h-4 shrink-0" />
              Escanear código
            </button>
            <button
              type="button"
              onClick={() => busquedaInputRef.current?.focus()}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 h-10 text-xs sm:text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              Buscar producto
            </button>
            <button
              type="button"
              disabled={carrito.length === 0}
              onClick={() => setAplicarDescuento(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 h-10 text-xs sm:text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <Tag className="w-4 h-4 shrink-0" />
              Aplicar descuento
            </button>
            <button
              type="button"
              disabled={carrito.length === 0}
              onClick={vaciarCarrito}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 h-10 text-xs sm:text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              Vaciar ticket
            </button>
          </div>

          {/* Vender algo que no está dado de alta en el catálogo: no
              depende de la búsqueda ni del catálogo visual de arriba — es
              un renglón de cobro aparte que nunca toca inventario (ver
              POST /ventas → descripcionLibre). */}
          <div>
            {!mostrarFormLibre ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setMostrarFormLibre(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Producto no registrado
              </Button>
            ) : (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Producto no registrado en el catálogo</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setMostrarFormLibre(false)}
                    aria-label="Cancelar"
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Descripción (obligatoria)</label>
                  <Input
                    value={libreDescripcion}
                    onChange={(e) => setLibreDescripcion(e.target.value)}
                    placeholder="Ej. Calcetas sueltas sin marca"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Proveedor (opcional)</label>
                    <Select value={libreProveedorId} onChange={(e) => setLibreProveedorId(e.target.value)}>
                      <option value="">Sin proveedor</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground">Precio</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={librePrecio}
                      onChange={(e) => setLibrePrecio(e.target.value)}
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-muted-foreground">Cantidad</label>
                    <Input
                      type="number"
                      min={1}
                      value={libreCantidad}
                      onChange={(e) => setLibreCantidad(e.target.value)}
                    />
                  </div>
                </div>
                {errorLibre && <p className="text-xs text-destructive">{errorLibre}</p>}
                <Button type="button" size="sm" onClick={agregarLibreAlCarrito}>
                  Agregar a la venta
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: el "ticket" — carrito (o el apartado en curso) y
            el cobro. En pantallas grandes se queda fija (sticky) mientras se
            sigue buscando en la columna izquierda. */}
        <div className="lg:sticky lg:top-4 card space-y-4">
          {esLocal ? (
            <>
              <h2 className="text-base font-semibold">Ticket {carrito.length > 0 ? `(${carrito.length})` : ''}</h2>

              {carrito.length > 0 ? (
                <div className="space-y-2 max-h-[38vh] overflow-y-auto p-0.5">
                  {carrito.map((it) => {
                    if (it.tipo === 'libre') {
                      return (
                        <div key={it.key} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary">
                            <Plus className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{it.descripcion}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {formatoMonedaExacto(it.precioUnitario)} c/u · No registrado
                              {it.proveedorNombre ? ` · ${it.proveedorNombre}` : ''}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <SelectorCantidad cantidad={it.cantidad} onCambiar={(n) => cambiarCantidadCarrito(it.key, n)} />
                              <span className="text-sm font-semibold tabular-nums">
                                {formatoMonedaExacto(it.precioUnitario * it.cantidad)}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => quitarDelCarrito(it.key)}
                            aria-label="Quitar de la venta"
                            className="shrink-0 text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    }
                    const p = it.existencia.variante.producto;
                    const detalle = [it.existencia.variante.talla?.valor, it.existencia.variante.color]
                      .filter(Boolean)
                      .join(' / ');
                    const precio = Number(p.precioVenta);
                    return (
                      <div key={it.key} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
                        <ProductoThumb url={imagenPrincipal(p, it.existencia.variante.color)} alt="" size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{p.nombre}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {detalle || 'Único'} · {formatoMonedaExacto(precio)}
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <SelectorCantidad
                              cantidad={it.cantidad}
                              onCambiar={(n) => cambiarCantidadCarrito(it.key, n)}
                              max={it.existencia.stockActual}
                            />
                            <span className="text-sm font-semibold tabular-nums">{formatoMonedaExacto(precio * it.cantidad)}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => quitarDelCarrito(it.key)}
                          aria-label="Quitar de la venta"
                          className="shrink-0 text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Busca y agrega uno o más productos para armar la venta.</p>
              )}

              {carrito.length > 0 &&
                (!mostrarNota ? (
                  <button
                    type="button"
                    onClick={() => setMostrarNota(true)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Agregar observaciones
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">
                        Observaciones (solo viajan en el ticket de WhatsApp, no se guardan)
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setMostrarNota(false);
                          setNotaVenta('');
                        }}
                        aria-label="Quitar observaciones"
                        className="shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      value={notaVenta}
                      onChange={(e) => setNotaVenta(e.target.value)}
                      placeholder="Ej. Entregar en caja, cliente frecuente…"
                    />
                  </div>
                ))}

              {carrito.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={aplicarDescuento} onChange={(e) => setAplicarDescuento(e.target.checked)} />
                    Aplicar descuento
                  </label>
                  {aplicarDescuento && (
                    <div className="mt-2 space-y-2 pl-1">
                      <div className="flex gap-2">
                        <div className="w-20">
                          <Select value={descuentoTipo} onChange={(e) => setDescuentoTipo(e.target.value as typeof descuentoTipo)}>
                            <option value="PORCENTAJE">%</option>
                            <option value="MONTO">$</option>
                          </Select>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={descuentoValor}
                          onChange={(e) => setDescuentoValor(e.target.value)}
                          placeholder={descuentoTipo === 'PORCENTAJE' ? 'Ej. 10' : 'Ej. 100.00'}
                        />
                      </div>
                      <Input
                        value={descuentoMotivo}
                        onChange={(e) => setDescuentoMotivo(e.target.value)}
                        placeholder="Motivo del descuento (opcional)"
                      />
                    </div>
                  )}
                </div>
              )}

              {carrito.length > 0 && (
                <div className="rounded-lg bg-secondary/60 border border-border px-4 py-3">
                  {descuentoMontoPreview > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatoMonedaExacto(subtotalVenta)}</span>
                    </div>
                  )}
                  {descuentoMontoPreview > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Descuento</span>
                      <span className="tabular-nums">-{formatoMonedaExacto(descuentoMontoPreview)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="text-2xl font-bold tabular-nums">{formatoMonedaExacto(totalVenta)}</span>
                  </div>
                </div>
              )}

              {!mostrarDatosCliente ? (
                <button
                  type="button"
                  onClick={() => setMostrarDatosCliente(true)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <User className="w-3.5 h-3.5" />
                  Agregar cliente (opcional)
                </button>
              ) : (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Cliente (opcional)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMostrarDatosCliente(false)}
                      aria-label="Ocultar datos del cliente"
                      className="shrink-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <label>Cliente</label>
                    <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
                  </div>
                  <div>
                    <label>Teléfono</label>
                    <Input
                      value={clienteTelefono}
                      onChange={(e) => setClienteTelefono(e.target.value)}
                      placeholder="10 dígitos, para mandarle el ticket por WhatsApp"
                    />
                  </div>
                </div>
              )}

              <div>
                <label>Método de pago</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {METODOS_PAGO.map((m) => {
                    const activo = metodoPago === m.valor;
                    const Icono = m.valor === 'EFECTIVO' ? Banknote : m.valor === 'TARJETA' ? CreditCard : Landmark;
                    return (
                      <button
                        key={m.valor}
                        type="button"
                        onClick={() => setMetodoPago(m.valor)}
                        className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors ${
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

              {metodoPago === 'EFECTIVO' && (
                <div>
                  <label>Efectivo recibido</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={efectivoRecibido}
                    onChange={(e) => setEfectivoRecibido(e.target.value)}
                    placeholder="$0.00"
                  />
                  {carrito.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEfectivoRecibido(totalVenta.toFixed(2))}>
                        Exacto
                      </Button>
                      {billetesSugeridos(totalVenta).map((b) => (
                        <Button key={b} type="button" variant="outline" size="sm" onClick={() => setEfectivoRecibido(String(b))}>
                          ${b}
                        </Button>
                      ))}
                    </div>
                  )}
                  {efectivoRecibido.trim() && cambio !== null && (
                    <p className={`text-sm font-semibold mt-1.5 ${cambio < 0 ? 'text-destructive' : 'text-success'}`}>
                      {cambio < 0
                        ? `Falta efectivo: ${formatoMonedaExacto(Math.abs(cambio))}`
                        : `Cambio a dar: ${formatoMonedaExacto(cambio)}`}
                    </p>
                  )}
                </div>
              )}

              {metodoPago === 'TRANSFERENCIA' && (
                <>
                  <div>
                    <label>Cuenta que recibió el pago</label>
                    <Select value={cuentaTransferenciaId} onChange={(e) => setCuentaTransferenciaId(e.target.value)}>
                      <option value="">Selecciona...</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre} {c.banco ? `(${c.banco})` : ''}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label>Foto del comprobante</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/70"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">Apartar para el cliente</h2>

              {seleccion && (
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card border border-border bg-secondary/40 p-2">
                    <ProductoThumb url={previewUrl} alt={seleccion?.variante.producto.nombre || ''} size={56} fit="contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{seleccion.variante.producto.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {seleccion.variante.talla ? `Talla ${seleccion.variante.talla.valor}` : ''}
                      {seleccion.variante.color ? ` · ${seleccion.variante.color}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">SKU {seleccion.variante.sku}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <label>Cantidad</label>
                <SelectorCantidad cantidad={cantidad} onCambiar={(n) => setCantidad(n)} max={seleccion?.stockActual} />
              </div>

              <div className="rounded-lg bg-secondary/60 border border-border px-4 py-3 flex justify-between items-baseline">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="text-2xl font-bold tabular-nums">{formatoMonedaExacto(subtotalApartado)}</span>
              </div>

              <div>
                <label>Nombre del cliente</label>
                <Input
                  value={clienteNombreApartado}
                  onChange={(e) => setClienteNombreApartado(e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label>Teléfono del cliente</label>
                <Input
                  value={clienteTelefonoApartado}
                  onChange={(e) => setClienteTelefonoApartado(e.target.value)}
                  placeholder="10 dígitos"
                />
              </div>
            </>
          )}

          {mensaje && <p className="rounded-lg bg-secondary/60 border border-border px-3 py-2 text-sm">{mensaje}</p>}

          {(ticketLink || ticketPdfUrl) && (
            <div className="flex flex-wrap gap-2">
              {ticketLink && (
                <Button size="sm" asChild>
                  <a href={ticketLink} target="_blank" rel="noreferrer">
                    <Send className="w-3.5 h-3.5" />
                    Enviar ticket por WhatsApp
                  </a>
                </Button>
              )}
              {ticketPdfUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={ticketPdfUrl} target="_blank" rel="noreferrer">
                    <FileText className="w-3.5 h-3.5" />
                    Ver ticket (PDF)
                  </a>
                </Button>
              )}
              {ticketPdfUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  title="Descarga el PDF a tu dispositivo para adjuntarlo a mano en WhatsApp si el envío automático no llegó"
                >
                  <a href={construirLinkDescargaTicket(ticketPdfUrl, ticketFolio)}>
                    <Download className="w-3.5 h-3.5" />
                    Descargar PDF
                  </a>
                </Button>
              )}
            </div>
          )}

          {esLocal ? (
            <Button
              size="lg"
              className="w-full h-12 gap-2 text-base uppercase tracking-wide"
              onClick={registrarVenta}
              disabled={carrito.length === 0 || guardando}
            >
              <CreditCard className="w-4 h-4" />
              {guardando ? 'Guardando…' : carrito.length > 0 ? `Cobrar ${formatoMonedaExacto(totalVenta)}` : 'Cobrar'}
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={crearApartado} disabled={!seleccion || guardando}>
              {guardando ? 'Guardando…' : 'Apartar para el cliente'}
            </Button>
          )}
        </div>

        {/* Accesos rápidos, en vertical junto al ticket para no robarle
            ancho a la sección de ventas (antes vivían en el PageHeader). */}
        <div className="flex flex-row lg:flex-col gap-1.5 lg:sticky lg:top-4">
          {puedeVer('apartados', usuario?.rol) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" asChild>
                  <Link href="/dashboard/apartados">
                    <CalendarClock className="w-4 h-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Apartados</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" asChild>
                <Link href="/dashboard/ventas/corte-dia">
                  <Receipt className="w-4 h-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Corte del día</TooltipContent>
          </Tooltip>
          {puedeVer('historialVentas', usuario?.rol) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" asChild>
                  <Link href="/dashboard/ventas/historial">
                    <History className="w-4 h-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Historial</TooltipContent>
            </Tooltip>
          )}
          {puedeVer('gastos', usuario?.rol) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" asChild>
                  <Link href="/dashboard/gastos">
                    <Wallet className="w-4 h-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Gastos</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Ventas de hoy: antes aquí se pintaba la tabla de TODAS las ventas
          (sin paginar), compitiendo por espacio y scroll justo en la
          pantalla que se usa para cobrar todo el día. El histórico completo,
          con filtros de fecha, ya vive en /ventas/historial — aquí solo se
          deja un resumen compacto de lo vendido hoy, útil para el cajero sin
          estorbar el flujo de venta. */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Ventas de hoy {ventasHoy.length > 0 ? `(${ventasHoy.length})` : ''}</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/ventas/corte-dia">
              <Receipt className="w-3.5 h-3.5" />
              Corte del día
            </Link>
          </Button>
        </div>

        {cargandoVentas ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : ventasHoy.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Sin ventas todavía hoy" description="Las ventas que registres aparecerán aquí." />
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {ventasHoy.map((v) => {
              const primerItem = v.items?.[0];
              const linkTicket = construirLinkTicket(v);
              return (
                <div key={v.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <ProductoThumb
                    url={imagenPrincipal(primerItem?.variante?.producto, primerItem?.variante?.color)}
                    alt={primerItem?.variante?.producto.nombre || primerItem?.descripcionLibre || ''}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {primerItem
                        ? primerItem.variante
                          ? `${primerItem.variante.producto.nombre}${primerItem.variante.talla ? ` (${primerItem.variante.talla.valor})` : ''}`
                          : `${primerItem.descripcionLibre || 'Producto no registrado'} (no registrado)`
                        : '—'}
                      {v.items && v.items.length > 1 ? ` +${v.items.length - 1}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.folio} · {v.cliente || 'Sin cliente'} · {v.sucursal?.nombre} · {formatearHora(v.createdAt)}
                    </div>
                  </div>
                  <StatusBadge tono={ESTADO_TONO[v.estado] ?? 'neutral'} className="shrink-0">
                    {v.estado}
                  </StatusBadge>
                  <div className="w-24 shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">{formatoMonedaExacto(v.total)}</div>
                    <div className="text-xs text-muted-foreground">{etiquetaMetodoPago(v.metodoPago)}</div>
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs">
                    {linkTicket && (
                      <a href={linkTicket} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        Ticket
                      </a>
                    )}
                    {linkTicket && v.ticketPdfUrl && ' · '}
                    {v.ticketPdfUrl && (
                      <a href={v.ticketPdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
