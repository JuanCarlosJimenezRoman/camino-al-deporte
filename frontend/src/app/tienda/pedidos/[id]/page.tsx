'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { apiTienda, apiTiendaUpload, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario, claseBotonSecundario } from '@/components/tienda/ui';

interface PedidoItem {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  variante: {
    sku: string;
    talla: { valor: string } | null;
    color: string | null;
    producto: { nombre: string; imagenes?: { url: string }[] };
  };
}

interface Pedido {
  id: number;
  folio: string;
  estado: 'PENDIENTE_PAGO' | 'EN_VALIDACION' | 'PAGADO' | 'ENVIADO' | 'RECIBIDO' | 'CANCELADO';
  total: string;
  destinatario: string;
  calle: string;
  numeroExt: string;
  numeroInt: string | null;
  colonia: string;
  municipio: string;
  estadoMx: string;
  codigoPostal: string;
  cuentaTransferencia: { nombre: string; banco: string | null; titular: string | null; numeroCuenta: string | null } | null;
  proveedorPago: { id: number; nombre: string; telefono: string | null } | null;
  whatsappTienda: string | null;
  referenciaPago: string;
  comprobanteUrl: string | null;
  comprobanteRechazadoMotivo: string | null;
  paqueteria: string | null;
  numeroGuia: string | null;
  items: PedidoItem[];
  createdAt: string;
}

const ESTADO_LABEL: Record<Pedido['estado'], string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'Comprobante en revisión',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

const PASOS: Pedido['estado'][] = ['PENDIENTE_PAGO', 'EN_VALIDACION', 'PAGADO', 'ENVIADO', 'RECIBIDO'];

// El pago ya no se muestra directo en la página (cuenta/CLABE en frío no le
// daba confianza al cliente). En vez de eso se le manda por WhatsApp al
// proveedor que corresponde a su pedido, quien le pasa los datos de pago por
// chat. Si el pedido trae artículos de varios proveedores, ya viene resuelto
// desde el backend: proveedorPago es el que más $ representa en ese pedido.
function formatearTelefonoWhatsapp(telefono: string): string {
  let digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 10) digitos = '52' + digitos; // sin código de país -> asumimos México
  return digitos;
}

function construirMensajeWhatsapp(pedido: Pedido): string {
  const articulos = pedido.items
    .map((it) => {
      const detalle = [it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ');
      return `- ${it.variante.producto.nombre}${detalle ? ` (${detalle})` : ''} x${it.cantidad} — $${it.subtotal}`;
    })
    .join('\n');
  const direccion = `${pedido.destinatario} — ${pedido.calle} ${pedido.numeroExt}${
    pedido.numeroInt ? ` Int. ${pedido.numeroInt}` : ''
  }, ${pedido.colonia}, ${pedido.municipio}, ${pedido.estadoMx}, CP ${pedido.codigoPostal}`;

  return [
    `Hola, quiero pagar mi pedido ${pedido.folio}.`,
    '',
    'Artículos:',
    articulos,
    '',
    `Total: $${pedido.total}`,
    `Referencia: ${pedido.referenciaPago}`,
    '',
    'Dirección de envío:',
    direccion,
  ].join('\n');
}

function construirLinkWhatsapp(pedido: Pedido): string | null {
  // Preferimos el teléfono del proveedor asignado al pedido; si no hay uno
  // (o no tiene teléfono capturado), caemos al WhatsApp general de la tienda
  // configurado en el dashboard, para que el botón nunca desaparezca.
  const telefono = pedido.proveedorPago?.telefono || pedido.whatsappTienda;
  if (!telefono) return null;
  const numero = formatearTelefonoWhatsapp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(construirMensajeWhatsapp(pedido))}`;
}

export default function PedidoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { cliente, cargando } = useAuthCliente();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    try {
      const data = await apiTienda<Pedido>(`/tienda/pedidos/${params.id}`);
      setPedido(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el pedido.');
    }
  }

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace(`/tienda/login?siguiente=/tienda/pedidos/${params.id}`);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, cliente, params.id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!pedido) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  async function subirComprobante() {
    if (!archivo) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('comprobante', archivo);
      const actualizado = await apiTiendaUpload<Pedido>(`/tienda/pedidos/${pedido!.id}/comprobante`, formData);
      setPedido(actualizado);
      setArchivo(null);
      setMensaje('Comprobante enviado. Lo revisaremos y actualizaremos el estado de tu pedido.');
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo subir el comprobante.');
    } finally {
      setSubiendo(false);
    }
  }

  async function confirmarRecibido() {
    if (!window.confirm('¿Confirmas que ya recibiste tu pedido?')) return;
    try {
      const actualizado = await apiTienda<Pedido>(`/tienda/pedidos/${pedido!.id}/confirmar-recibido`, { method: 'POST' });
      setPedido(actualizado);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo confirmar la recepción.');
    }
  }

  async function cancelarPedido() {
    if (!window.confirm('¿Cancelar este pedido?')) return;
    try {
      const actualizado = await apiTienda<Pedido>(`/tienda/pedidos/${pedido!.id}/cancelar`, { method: 'POST' });
      setPedido(actualizado);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo cancelar el pedido.');
    }
  }

  const pasoActual = pedido.estado === 'CANCELADO' ? -1 : PASOS.indexOf(pedido.estado);
  const linkWhatsapp = pedido.estado === 'PENDIENTE_PAGO' ? construirLinkWhatsapp(pedido) : null;

  return (
    <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:gap-12">
      <div>
        <h1 className="text-xl font-extrabold uppercase tracking-tight sm:text-2xl">Pedido {pedido.folio}</h1>
        <p className="mb-5 mt-1 text-xs text-muted-foreground">{new Date(pedido.createdAt).toLocaleString('es-MX')}</p>

        {/* Estado del pedido */}
        {pedido.estado === 'CANCELADO' ? (
          <p className="mb-6 font-semibold text-destructive">Este pedido fue cancelado.</p>
        ) : (
          <div className="mb-6 flex flex-wrap gap-2">
            {PASOS.map((paso, i) => (
              <span
                key={paso}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  i <= pasoActual ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {ESTADO_LABEL[paso]}
              </span>
            ))}
          </div>
        )}

        {/* Pago por WhatsApp */}
        {(pedido.estado === 'PENDIENTE_PAGO' || pedido.estado === 'EN_VALIDACION') && (
          <div className="mb-5 rounded-2xl bg-secondary/60 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Pago</h2>

            {pedido.comprobanteRechazadoMotivo && pedido.estado === 'PENDIENTE_PAGO' && (
              <p className="mb-3 text-sm text-destructive">
                Tu comprobante anterior no pudo validarse: {pedido.comprobanteRechazadoMotivo}. Por favor sube uno nuevo.
              </p>
            )}

            <div className="mb-1 text-sm">
              <span className="font-semibold">Total a pagar:</span> ${pedido.total}
            </div>
            <div className="mb-4 text-sm">
              <span className="font-semibold">Referencia:</span> {pedido.referenciaPago}
            </div>

            {pedido.estado === 'PENDIENTE_PAGO' &&
              (linkWhatsapp ? (
                <a href={linkWhatsapp} target="_blank" rel="noreferrer" className={`${claseBotonPrimario} mb-5 w-full sm:w-auto`}>
                  Continuar por WhatsApp
                </a>
              ) : (
                <p className="mb-5 text-sm text-muted-foreground">Contáctanos para recibir los datos de pago de tu pedido.</p>
              ))}

            {pedido.estado === 'EN_VALIDACION' ? (
              <p className="text-sm text-muted-foreground">
                Ya recibimos tu comprobante y lo estamos revisando. Te avisaremos en cuanto se confirme el pago.
              </p>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sube tu comprobante de pago
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  className="mb-3 block w-full text-sm"
                />
                <button className={`${claseBotonSecundario} w-full sm:w-auto`} disabled={!archivo || subiendo} onClick={subirComprobante}>
                  {subiendo ? 'Subiendo...' : 'Subir comprobante'}
                </button>
              </div>
            )}

            {pedido.estado === 'PENDIENTE_PAGO' && (
              <div className="mt-5 border-t border-border pt-4">
                <button onClick={cancelarPedido} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
                  Cancelar pedido
                </button>
              </div>
            )}
          </div>
        )}

        {pedido.estado === 'PAGADO' && (
          <p className="mb-5 rounded-2xl bg-secondary/60 p-5 text-sm">
            Tu pago fue confirmado. Estamos preparando tu pedido para enviarlo.
          </p>
        )}

        {pedido.estado === 'ENVIADO' && (
          <div className="mb-5 rounded-2xl bg-secondary/60 p-5">
            <p className="mb-3 text-sm">Tu pedido ya salió hacia la dirección de envío.</p>
            {pedido.paqueteria && (
              <div className="text-sm">
                <span className="font-semibold">Paquetería:</span> {pedido.paqueteria}
              </div>
            )}
            {pedido.numeroGuia && (
              <div className="mb-4 text-sm">
                <span className="font-semibold">Número de guía:</span> {pedido.numeroGuia}
              </div>
            )}
            <button className={`${claseBotonPrimario} w-full sm:w-auto`} onClick={confirmarRecibido}>
              Ya recibí mi pedido
            </button>
          </div>
        )}

        {pedido.estado === 'RECIBIDO' && (
          <p className="mb-5 rounded-2xl bg-secondary/60 p-5 text-sm">Pedido entregado. ¡Gracias por tu compra!</p>
        )}

        {mensaje && <p className="mb-4 text-sm">{mensaje}</p>}

        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Dirección de envío</h2>
        <p className="text-sm text-muted-foreground">
          {pedido.destinatario} — {pedido.calle} {pedido.numeroExt}
          {pedido.numeroInt ? ` Int. ${pedido.numeroInt}` : ''}, {pedido.colonia}, {pedido.municipio}, {pedido.estadoMx}, CP{' '}
          {pedido.codigoPostal}
        </p>
      </div>

      <div className="h-fit rounded-2xl bg-secondary/60 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide">Artículos</h2>
        <div className="space-y-3">
          {pedido.items.map((it) => (
            <div key={it.id} className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {it.variante.producto.nombre}
                {it.variante.talla || it.variante.color
                  ? ` (${[it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ')})`
                  : ''}{' '}
                × {it.cantidad}
              </span>
              <span className="whitespace-nowrap font-semibold">${it.subtotal}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-border pt-4 text-base font-bold">
          <span>Total</span>
          <span>${pedido.total}</span>
        </div>
      </div>
    </div>
  );
}
