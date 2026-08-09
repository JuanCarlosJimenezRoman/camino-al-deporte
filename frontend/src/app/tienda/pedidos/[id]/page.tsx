'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { apiTienda, apiTiendaUpload, ApiError } from '@/lib/apiTienda';

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

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!pedido) return <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>;

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Pedido {pedido.folio}</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 20 }}>
          {new Date(pedido.createdAt).toLocaleString('es-MX')}
        </p>

        {/* Estado del pedido */}
        {pedido.estado === 'CANCELADO' ? (
          <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginBottom: 20 }}>Este pedido fue cancelado.</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {PASOS.map((paso, i) => (
              <div
                key={paso}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: i <= pasoActual ? 'var(--color-primary)' : 'var(--color-border)',
                  color: i <= pasoActual ? 'white' : 'var(--color-muted)',
                }}
              >
                {ESTADO_LABEL[paso]}
              </div>
            ))}
          </div>
        )}

        {/* Pago SPEI */}
        {(pedido.estado === 'PENDIENTE_PAGO' || pedido.estado === 'EN_VALIDACION') && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Pago por SPEI</h2>

            {pedido.comprobanteRechazadoMotivo && pedido.estado === 'PENDIENTE_PAGO' && (
              <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>
                Tu comprobante anterior no pudo validarse: {pedido.comprobanteRechazadoMotivo}. Por favor sube uno nuevo.
              </p>
            )}

            <div style={{ fontSize: 14, marginBottom: 4 }}>
              <strong>Total a pagar:</strong> ${pedido.total}
            </div>
            {pedido.cuentaTransferencia && (
              <>
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Banco:</strong> {pedido.cuentaTransferencia.banco || pedido.cuentaTransferencia.nombre}
                </div>
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>CLABE / cuenta destino:</strong> {pedido.cuentaTransferencia.numeroCuenta || '—'}
                </div>
                {pedido.cuentaTransferencia.titular && (
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    <strong>Titular:</strong> {pedido.cuentaTransferencia.titular}
                  </div>
                )}
              </>
            )}
            <div style={{ fontSize: 14, marginBottom: 12 }}>
              <strong>Referencia / concepto:</strong> {pedido.referenciaPago}
            </div>

            {pedido.estado === 'EN_VALIDACION' ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Ya recibimos tu comprobante y lo estamos revisando. Te avisaremos en cuanto se confirme el pago.
              </p>
            ) : (
              <>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Sube tu comprobante de pago</label>
                <div style={{ margin: '4px 0 10px' }}>
                  <input type="file" accept="image/*" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
                </div>
                <button className="btn" disabled={!archivo || subiendo} onClick={subirComprobante}>
                  {subiendo ? 'Subiendo...' : 'Subir comprobante'}
                </button>
              </>
            )}

            {pedido.estado === 'PENDIENTE_PAGO' && (
              <div style={{ marginTop: 16 }}>
                <button className="btn-secondary btn" onClick={cancelarPedido}>
                  Cancelar pedido
                </button>
              </div>
            )}
          </div>
        )}

        {pedido.estado === 'PAGADO' && (
          <p className="card" style={{ marginBottom: 20 }}>
            Tu pago fue confirmado. Estamos preparando tu pedido para enviarlo.
          </p>
        )}

        {pedido.estado === 'ENVIADO' && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ marginBottom: 12 }}>Tu pedido ya salió hacia la dirección de envío.</p>
            {pedido.paqueteria && (
              <div style={{ fontSize: 14 }}>
                <strong>Paquetería:</strong> {pedido.paqueteria}
              </div>
            )}
            {pedido.numeroGuia && (
              <div style={{ fontSize: 14, marginBottom: 12 }}>
                <strong>Número de guía:</strong> {pedido.numeroGuia}
              </div>
            )}
            <button className="btn" onClick={confirmarRecibido}>
              Ya recibí mi pedido
            </button>
          </div>
        )}

        {pedido.estado === 'RECIBIDO' && (
          <p className="card" style={{ marginBottom: 20 }}>
            Pedido entregado. ¡Gracias por tu compra!
          </p>
        )}

        {mensaje && <p style={{ fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}

        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Dirección de envío</h2>
        <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 24 }}>
          {pedido.destinatario} — {pedido.calle} {pedido.numeroExt}
          {pedido.numeroInt ? ` Int. ${pedido.numeroInt}` : ''}, {pedido.colonia}, {pedido.municipio}, {pedido.estadoMx}, CP{' '}
          {pedido.codigoPostal}
        </p>
      </div>

      <div className="card" style={{ height: 'fit-content' }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Artículos</h2>
        {pedido.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span>
              {it.variante.producto.nombre}
              {it.variante.talla || it.variante.color
                ? ` (${[it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ')})`
                : ''}{' '}
              × {it.cantidad}
            </span>
            <span>${it.subtotal}</span>
          </div>
        ))}
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            marginTop: 10,
            paddingTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 700,
          }}
        >
          <span>Total</span>
          <span>${pedido.total}</span>
        </div>
      </div>
    </div>
  );
}
