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
} from 'lucide-react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/utils';
import { useAuth, puedeVer } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';

interface Sucursal {
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
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
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
      nombre: string;
      precioVenta: string;
      imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
    };
  };
}

// Identifica un bucket concreto (variante + proveedor + sucursal) para usarlo
// como key/value, ya que un mismo varianteId puede repetirse.
function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}:${e.sucursalId}`;
}

// Un renglón del carrito de la venta actual: la misma existencia (variante +
// proveedor) puede aparecer varias veces en una compra si el cliente pide
// varios artículos distintos, por eso el carrito es una lista de renglones
// en vez de un solo "seleccionado" — antes solo se podía vender un producto
// a la vez porque el formulario solo guardaba una selección.
interface ItemCarrito {
  key: string;
  existencia: Existencia;
  cantidad: number;
}

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

function construirTicketTexto(venta: Venta): string {
  const articulos = venta.items
    .map((it) => {
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
    '',
    '¡Gracias por tu compra!',
    venta.whatsappContacto ? `Dudas o cambios, contáctanos: ${venta.whatsappContacto}` : '',
  ].join('\n');
}

function construirLinkTicket(venta: Venta): string | null {
  if (!venta.clienteTelefono) return null;
  const numero = formatearTelefonoWhatsapp(venta.clienteTelefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(construirTicketTexto(venta))}`;
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

  // Búsqueda de producto: ya no es un <select> con todo el catálogo, es un
  // campo de texto que busca (con un pequeño debounce) en TODAS las
  // sucursales — así se puede ver de un vistazo si el producto que pide el
  // cliente está en la sucursal propia o solo en otra.
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Existencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [seleccion, setSeleccion] = useState<Existencia | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cantidad, setCantidad] = useState(1);

  // Carrito de la venta en curso: uno o más artículos disponibles en la
  // sucursal propia, cada uno con su cantidad. Los productos que solo están
  // en otra sucursal NO entran aquí — para esos sigue existiendo el flujo de
  // "Apartar para el cliente" de un solo artículo (ver seleccion más abajo).
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // Venta local (producto disponible en la sucursal propia)
  const [cliente, setCliente] = useState('');
  // Opcional: solo se pide para poder mandar el ticket digital por WhatsApp
  // al terminar la venta. Sin él, la venta se registra igual.
  const [clienteTelefono, setClienteTelefono] = useState('');
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
    setResultados([]);
    // El carrito son existencias de una sucursal concreta — al cambiar de
    // sucursal ya no aplican (el stock disponible es otro), así que se
    // vacía en vez de arrastrar renglones que ya no son válidos.
    setCarrito([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  // Búsqueda con debounce: espera 300ms sin teclear antes de consultar, para
  // no mandar una petición por cada letra. Busca en todas las sucursales
  // (sin ?sucursalId=) — así se ve de un vistazo si lo que pide el cliente
  // está en la sucursal propia o solo en otra.
  // Si ya hay una selección hecha (el texto es solo el nombre que se puso al
  // elegir un resultado, no algo que el usuario esté escribiendo), no vuelve
  // a buscar — si no, el buscador se reabriría solo justo después de elegir.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (seleccion || busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await api<Existencia[]>(
          `/inventario/existencias?skuOProducto=${encodeURIComponent(busqueda.trim())}`
        );
        setResultados(data.filter((e) => e.stockActual > 0));
        setMostrarResultados(true);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busqueda, seleccion]);

  // Elegir un resultado de la búsqueda tiene dos caminos distintos:
  //  - Si el producto SÍ está en la sucursal propia, se agrega directo al
  //    carrito (puede ser el primero de varios) y la búsqueda se limpia para
  //    poder seguir agregando más artículos a la misma venta.
  //  - Si solo está en otra sucursal, no se puede vender de aquí — se guarda
  //    como "seleccion" para ofrecer apartarlo, igual que antes (eso sigue
  //    siendo de un artículo a la vez).
  function elegirResultado(e: Existencia) {
    const esLocalResultado = e.sucursalId === Number(sucursalId);
    setMostrarResultados(false);
    setMensaje(null);
    if (esLocalResultado) {
      agregarAlCarrito(e);
      setSeleccion(null);
      setBusqueda('');
      setResultados([]);
    } else {
      setSeleccion(e);
      setBusqueda(`${e.variante.producto.nombre}${e.variante.talla ? ` (${e.variante.talla.valor})` : ''}`);
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
      return [...actual, { key, existencia: e, cantidad: Math.min(1, e.stockActual) }];
    });
  }

  function quitarDelCarrito(key: string) {
    setCarrito((actual) => actual.filter((it) => it.key !== key));
  }

  // Cambia la cantidad de un renglón del carrito, siempre entre 1 y el stock
  // disponible de esa existencia (no se puede vender más de lo que hay).
  function cambiarCantidadCarrito(key: string, nuevaCantidad: number) {
    setCarrito((actual) =>
      actual.map((it) => {
        if (it.key !== key) return it;
        const max = it.existencia.stockActual;
        const cantidad = Number.isFinite(nuevaCantidad) ? Math.max(1, Math.min(nuevaCantidad, max)) : 1;
        return { ...it, cantidad };
      })
    );
  }

  function limpiarSeleccion() {
    setSeleccion(null);
    setBusqueda('');
    setResultados([]);
    setCantidad(1);
    setCarrito([]);
    setEfectivoRecibido('');
    setAplicarDescuento(false);
    setDescuentoTipo('PORCENTAJE');
    setDescuentoValor('');
    setDescuentoMotivo('');
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
  const subtotalVenta = carrito.reduce(
    (acc, it) => acc + Number(it.existencia.variante.producto.precioVenta) * it.cantidad,
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
        // el formulario solo guardaba una selección.
        items: carrito.map((it) => ({
          varianteId: it.existencia.variante.id,
          cantidad: it.cantidad,
          precioUnitario: Number(it.existencia.variante.producto.precioVenta),
          // De qué proveedor sale el stock vendido — ya viene fijo desde
          // que se eligió el renglón en la búsqueda.
          proveedorId: it.existencia.proveedorId,
        })),
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
        setTicketLink(construirLinkTicket(creada));
      }
      limpiarSeleccion();
      setCliente('');
      setClienteTelefono('');
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);
      cargar();
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas"
        subtitle="Punto de venta"
        breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Ventas' }]}
        actions={
          <>
            {puedeVer('apartados', usuario?.rol) && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/apartados">
                  <CalendarClock className="w-4 h-4" />
                  Apartados
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/ventas/corte-dia">
                <Receipt className="w-4 h-4" />
                Corte del día
              </Link>
            </Button>
            {puedeVer('historialVentas', usuario?.rol) && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/ventas/historial">
                  <History className="w-4 h-4" />
                  Historial
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="card max-w-3xl">
        <h2 className="text-base font-semibold mb-4">Registrar venta rápida</h2>

        <div className="flex flex-wrap gap-6">
          <div className="flex-1 min-w-[280px] space-y-3">
            <div>
              <label>Sucursal</label>
              {sucursalBloqueada ? (
                <div className="text-sm py-2">{sucursales.find((s) => String(s.id) === sucursalId)?.nombre || usuario?.sucursal?.nombre || '—'}</div>
              ) : (
                <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </Select>
              )}
            </div>

            <div className="relative">
              <label>Buscar producto (nombre o SKU)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setSeleccion(null);
                  }}
                  onFocus={() => resultados.length > 0 && setMostrarResultados(true)}
                  onBlur={() => {
                    // Retraso corto para que el click en un resultado alcance a
                    // registrarse antes de que el blur cierre la lista.
                    setTimeout(() => setMostrarResultados(false), 150);
                  }}
                  placeholder="Ej. Tenis Runner Pro, o el SKU..."
                  className="pl-9"
                />
              </div>
              {buscando && <p className="text-xs text-muted-foreground mt-1">Buscando…</p>}

              {mostrarResultados && resultados.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-elevated">
                  {resultados.map((r) => {
                    const local = r.sucursalId === Number(sucursalId);
                    return (
                      <button
                        key={claveExistencia(r)}
                        onClick={() => elegirResultado(r)}
                        className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary transition-colors"
                      >
                        <ProductoThumb url={imagenPrincipal(r.variante.producto, r.variante.color)} alt="" size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {r.variante.producto.nombre}
                            {r.variante.talla ? ` (${r.variante.talla.valor})` : ''}
                            {r.variante.color ? ` — ${r.variante.color}` : ''}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            SKU {r.variante.sku} · stock: {r.stockActual}
                          </div>
                        </div>
                        <StatusBadge tono={local ? 'success' : 'warning'} withDot={false} className="shrink-0">
                          {local ? 'Tu sucursal' : r.sucursal?.nombre ?? 'Otra sucursal'}
                        </StatusBadge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {seleccion && !esLocal && (
              <p className="text-xs text-warning">
                Este producto no está en tu sucursal — hay {seleccion.stockActual} en {seleccion.sucursal?.nombre ?? 'otra sucursal'}.
                No se puede vender directamente desde aquí; puedes apartarlo para el cliente.
              </p>
            )}

            {esLocal ? (
              <>
                {/* Carrito de la venta: cada búsqueda que coincide con la
                    sucursal propia se agrega aquí en vez de reemplazar la
                    selección anterior — así se pueden vender varios
                    productos distintos en una sola venta. */}
                {carrito.length > 0 ? (
                  <div>
                    <label>Artículos de la venta ({carrito.length})</label>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {carrito.map((it) => {
                        const p = it.existencia.variante.producto;
                        const detalle = [it.existencia.variante.talla?.valor, it.existencia.variante.color]
                          .filter(Boolean)
                          .join(' / ');
                        const precio = Number(p.precioVenta);
                        return (
                          <div key={it.key} className="flex items-center gap-2.5 px-3 py-2">
                            <ProductoThumb url={imagenPrincipal(p, it.existencia.variante.color)} alt="" size={32} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                {p.nombre}
                                {detalle ? ` (${detalle})` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                ${precio.toFixed(2)} c/u · SKU {it.existencia.variante.sku}
                              </div>
                            </div>
                            <Input
                              type="number"
                              min={1}
                              max={it.existencia.stockActual}
                              value={it.cantidad}
                              onChange={(e) => cambiarCantidadCarrito(it.key, Number(e.target.value))}
                              className="w-16 shrink-0"
                            />
                            <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                              ${(precio * it.cantidad).toFixed(2)}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => quitarDelCarrito(it.key)} aria-label="Quitar de la venta" className="shrink-0 text-destructive">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Busca y agrega uno o más productos arriba para armar la venta.</p>
                )}

                {carrito.length > 0 && (
                  <p className="text-sm font-semibold tabular-nums">
                    {descuentoMontoPreview > 0 ? (
                      <>
                        Subtotal: ${subtotalVenta.toFixed(2)} — Descuento: -${descuentoMontoPreview.toFixed(2)}
                        <br />
                        Total: ${totalVenta.toFixed(2)}
                      </>
                    ) : (
                      <>Total: ${totalVenta.toFixed(2)}</>
                    )}
                  </p>
                )}

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
                        <Input value={descuentoMotivo} onChange={(e) => setDescuentoMotivo(e.target.value)} placeholder="Motivo del descuento (opcional)" />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label>Cliente (opcional)</label>
                  <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del cliente" />
                </div>

                <div>
                  <label>Teléfono del cliente (opcional)</label>
                  <Input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} placeholder="10 dígitos, para mandarle el ticket por WhatsApp" />
                </div>

                <div>
                  <label>Método de pago</label>
                  <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
                    ))}
                  </Select>
                </div>

                {metodoPago === 'EFECTIVO' && (
                  <div>
                    <label>Efectivo recibido</label>
                    <Input type="number" min={0} step="0.01" value={efectivoRecibido} onChange={(e) => setEfectivoRecibido(e.target.value)} placeholder="$0.00" />
                    {efectivoRecibido.trim() && cambio !== null && (
                      <p className={`text-sm font-semibold mt-1.5 ${cambio < 0 ? 'text-destructive' : 'text-success'}`}>
                        {cambio < 0 ? `Falta efectivo: $${Math.abs(cambio).toFixed(2)}` : `Cambio a dar: $${cambio.toFixed(2)}`}
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
                <div>
                  <label>Cantidad</label>
                  <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
                </div>
                <p className="text-sm font-semibold tabular-nums">Total: ${subtotalApartado.toFixed(2)}</p>

                <div>
                  <label>Nombre del cliente</label>
                  <Input value={clienteNombreApartado} onChange={(e) => setClienteNombreApartado(e.target.value)} placeholder="Nombre completo" />
                </div>
                <div>
                  <label>Teléfono del cliente</label>
                  <Input value={clienteTelefonoApartado} onChange={(e) => setClienteTelefonoApartado(e.target.value)} placeholder="10 dígitos" />
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
              <Button onClick={registrarVenta} disabled={carrito.length === 0 || guardando}>
                {guardando ? 'Guardando…' : 'Registrar venta'}
              </Button>
            ) : (
              <Button onClick={crearApartado} disabled={!seleccion || guardando}>
                {guardando ? 'Guardando…' : 'Apartar para el cliente'}
              </Button>
            )}
          </div>

          {/* Imagen grande del producto elegido, a la derecha del formulario
              — solo aplica al flujo de apartado (un artículo de otra
              sucursal); en el carrito de la venta directa cada renglón ya
              trae su propia miniatura en la lista de arriba.
              object-fit: contain (vía fit="contain") para que se vea la foto
              completa sin recortarla, aunque no sea cuadrada. */}
          {seleccion && (
            <div className="flex flex-col items-center gap-2 text-center shrink-0 w-[220px]">
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-card border border-border bg-secondary/40 p-3">
                <ProductoThumb url={previewUrl} alt={seleccion?.variante.producto.nombre || ''} size={196} fit="contain" />
              </div>
              <div>
                <div className="text-sm font-semibold">{seleccion.variante.producto.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  {seleccion.variante.talla ? `Talla ${seleccion.variante.talla.valor}` : ''}
                  {seleccion.variante.color ? ` · ${seleccion.variante.color}` : ''}
                </div>
                <div className="text-xs text-muted-foreground">SKU {seleccion.variante.sku}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {cargandoVentas ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : ventas.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Sin ventas todavía" description="Las ventas que registres aparecerán aquí." />
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
              <th>Ticket</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const primerItem = v.items?.[0];
              const linkTicket = construirLinkTicket(v);
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
                  <td className="font-medium tabular-nums">${v.total}</td>
                  <td className="text-xs">
                    {etiquetaMetodoPago(v.metodoPago)}
                    {v.cuentaTransferencia ? ` (${v.cuentaTransferencia.nombre})` : ''}
                    {v.comprobanteUrl && (
                      <>
                        {' · '}
                        <a href={v.comprobanteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          ver comprobante
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    <StatusBadge tono={ESTADO_TONO[v.estado] ?? 'neutral'}>{v.estado}</StatusBadge>
                  </td>
                  <td>{v.usuario?.nombre}</td>
                  <td className="text-xs text-muted-foreground">{formatearFechaHora(v.createdAt)}</td>
                  <td>
                    {linkTicket ? (
                      <a href={linkTicket} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                        Enviar
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {v.ticketPdfUrl ? (
                      <>
                        <a href={v.ticketPdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Ver
                        </a>
                        {' · '}
                        <a href={construirLinkDescargaTicket(v.ticketPdfUrl, v.folio)} className="text-primary hover:underline" title="Descargar para adjuntar a mano en WhatsApp">
                          Descargar
                        </a>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
