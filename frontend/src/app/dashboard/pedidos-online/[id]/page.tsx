'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

function Estrellas({ valor }: { valor: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= valor ? 'var(--color-warning, #d97706)' : 'none'}
          color={n <= valor ? 'var(--color-warning, #d97706)' : 'var(--color-border)'}
        />
      ))}
    </span>
  );
}

interface ProveedorInfo {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
}

interface PedidoItem {
  id: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  variante: {
    sku: string;
    talla: { valor: string } | null;
    color: string | null;
    producto: { nombre: string; imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[] };
  };
  sucursalStock: { nombre: string };
  proveedor: ProveedorInfo | null;
}

interface Pedido {
  id: number;
  folio: string;
  estado: 'PENDIENTE_PAGO' | 'EN_VALIDACION' | 'PAGADO' | 'ENVIADO' | 'RECIBIDO' | 'CANCELADO';
  total: string;
  costoEnvio: string;
  cliente: { nombre: string; telefono: string; email: string | null };
  destinatario: string;
  telefonoContacto: string;
  calle: string;
  numeroExt: string;
  numeroInt: string | null;
  colonia: string;
  municipio: string;
  estadoMx: string;
  codigoPostal: string;
  referencias: string | null;
  notas: string | null;
  cuentaTransferencia: { nombre: string; numeroCuenta: string | null } | null;
  referenciaPago: string;
  comprobanteUrl: string | null;
  comprobanteRechazadoMotivo: string | null;
  validadoPor: { nombre: string } | null;
  proveedorPagoConfirmado: ProveedorInfo | null;
  paqueteria: string | null;
  numeroGuia: string | null;
  // Cupón de código aplicado por el cliente al armar el pedido.
  cuponCodigo: string | null;
  cuponDescuento: string;
  // Descuento manual que el negocio activa después de creado el pedido
  // (ver POST /pedidos-online/:id/aplicar-descuento).
  descuentoManualTipo: 'PORCENTAJE' | 'MONTO' | null;
  descuentoManualValor: string | null;
  descuentoManualMonto: string;
  descuentoManualNotas: string | null;
  descuentoConfirmadoWhatsapp: boolean;
  descuentoAplicadoPor: { nombre: string } | null;
  items: PedidoItem[];
  createdAt: string;
  resena: {
    calificacionProducto: number;
    calificacionEnvio: number;
    comentario: string | null;
    fotos: { id: number; url: string }[];
  } | null;
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'En validación',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

export default function PedidoOnlineDetallePage() {
  const params = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [paqueteria, setPaqueteria] = useState('');
  const [numeroGuia, setNumeroGuia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [cuentaReceptora, setCuentaReceptora] = useState(''); // '' = cuenta de la tienda

  // Formulario para activar/editar el descuento manual post-pedido.
  const [mostrarFormDescuento, setMostrarFormDescuento] = useState(false);
  const [tipoDescuento, setTipoDescuento] = useState<'PORCENTAJE' | 'MONTO'>('PORCENTAJE');
  const [valorDescuento, setValorDescuento] = useState('');
  const [notasDescuento, setNotasDescuento] = useState('');

  async function cargar() {
    try {
      const data = await api<Pedido>(`/pedidos-online/${params.id}`);
      setPedido(data);
      setPaqueteria(data.paqueteria || '');
      setNumeroGuia(data.numeroGuia || '');
      setCuentaReceptora(data.proveedorPagoConfirmado ? String(data.proveedorPagoConfirmado.id) : '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el pedido.');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!pedido) return <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>;

  // Proveedores involucrados en este pedido (uno o varios artículos pueden
  // venir de proveedores distintos), sin duplicar por id.
  const proveedoresPedido: ProveedorInfo[] = [];
  for (const it of pedido.items) {
    if (it.proveedor && !proveedoresPedido.some((p) => p.id === it.proveedor!.id)) {
      proveedoresPedido.push(it.proveedor);
    }
  }

  async function accion(ruta: string, body?: object) {
    setProcesando(true);
    setMensaje(null);
    try {
      const actualizado = await api<Pedido>(`/pedidos-online/${pedido!.id}/${ruta}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setPedido(actualizado);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
    } finally {
      setProcesando(false);
    }
  }

  function rechazarComprobante() {
    const motivo = window.prompt('¿Por qué se rechaza el comprobante? (ej. el monto no coincide)');
    if (!motivo) return;
    accion('rechazar-comprobante', { motivo });
  }

  function cancelarPedido() {
    if (!window.confirm('¿Cancelar este pedido? El stock reservado regresará al inventario.')) return;
    accion('cancelar');
  }

  async function activarDescuento() {
    if (!valorDescuento || Number(valorDescuento) <= 0) {
      setMensaje('Captura un valor de descuento mayor a cero.');
      return;
    }
    await accion('aplicar-descuento', { tipoDescuento, valor: Number(valorDescuento), notas: notasDescuento || undefined });
    setMostrarFormDescuento(false);
    setValorDescuento('');
    setNotasDescuento('');
  }

  function quitarDescuento() {
    if (!window.confirm('¿Quitar el descuento de este pedido? El total volverá a su monto original.')) return;
    accion('quitar-descuento');
  }

  function confirmarDescuentoWhatsapp() {
    accion('confirmar-descuento-whatsapp');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Pedido {pedido.folio}</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 16 }}>
          {new Date(pedido.createdAt).toLocaleString('es-MX')} — {ESTADO_LABEL[pedido.estado]}
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Cliente</h2>
          <div style={{ fontSize: 14 }}>{pedido.cliente.nombre}</div>
          <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>
            {pedido.cliente.telefono} {pedido.cliente.email ? `· ${pedido.cliente.email}` : ''}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Dirección de envío</h2>
          <div style={{ fontSize: 14 }}>{pedido.destinatario} — {pedido.telefonoContacto}</div>
          <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>
            {pedido.calle} {pedido.numeroExt}
            {pedido.numeroInt ? ` Int. ${pedido.numeroInt}` : ''}, {pedido.colonia}, {pedido.municipio}, {pedido.estadoMx}, CP{' '}
            {pedido.codigoPostal}
          </div>
          {pedido.referencias && <div style={{ fontSize: 13, marginTop: 4 }}>Referencias: {pedido.referencias}</div>}
          {pedido.notas && <div style={{ fontSize: 13, marginTop: 4 }}>Notas: {pedido.notas}</div>}
        </div>

        {proveedoresPedido.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>
              {proveedoresPedido.length === 1 ? 'Proveedor de este pedido' : 'Proveedores de este pedido'}
            </h2>
            {proveedoresPedido.map((p) => (
              <div key={p.id} style={{ fontSize: 14, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {[p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto/teléfono registrado'}
                </div>
                <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  {p.numeroCuenta ? `${p.banco || ''} · ${p.titular || ''} · ${p.numeroCuenta}` : 'Sin cuenta bancaria registrada'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pago por SPEI</h2>
          <div style={{ fontSize: 14 }}>
            <strong>Cuenta:</strong> {pedido.cuentaTransferencia?.nombre} ({pedido.cuentaTransferencia?.numeroCuenta || '—'})
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            <strong>Referencia esperada:</strong> {pedido.referenciaPago}
          </div>

          {pedido.comprobanteUrl ? (
            <a href={pedido.comprobanteUrl} target="_blank" rel="noreferrer" className="btn-secondary btn">
              Ver comprobante subido
            </a>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>El cliente todavía no sube su comprobante.</p>
          )}

          {pedido.comprobanteRechazadoMotivo && (
            <p style={{ fontSize: 13, color: 'var(--color-danger)', marginTop: 8 }}>
              Último rechazo: {pedido.comprobanteRechazadoMotivo}
            </p>
          )}

          {pedido.validadoPor && (
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>
              Validado por {pedido.validadoPor.nombre}
              {pedido.proveedorPagoConfirmado
                ? ` — transferencia recibida por ${pedido.proveedorPagoConfirmado.nombre}`
                : ' — transferencia recibida en la cuenta de la tienda'}
            </p>
          )}

          {pedido.estado === 'EN_VALIDACION' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                ¿A qué cuenta llegó la transferencia?
              </label>
              <select
                value={cuentaReceptora}
                onChange={(e) => setCuentaReceptora(e.target.value)}
                style={{ marginBottom: 10, maxWidth: 320 }}
              >
                <option value="">Cuenta de la tienda ({pedido.cuentaTransferencia?.nombre || 'sin especificar'})</option>
                {proveedoresPedido.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}{p.numeroCuenta ? ` — ${p.numeroCuenta}` : ''}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn"
                  disabled={procesando}
                  onClick={() =>
                    accion('validar-pago', {
                      proveedorPagoConfirmadoId: cuentaReceptora ? Number(cuentaReceptora) : null,
                    })
                  }
                >
                  Confirmar transferencia recibida
                </button>
                <button className="btn-secondary btn" disabled={procesando} onClick={rechazarComprobante}>
                  Rechazar comprobante
                </button>
              </div>
            </div>
          )}
        </div>

        {(pedido.estado === 'PENDIENTE_PAGO' || Number(pedido.descuentoManualMonto) > 0) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>Descuento</h2>

            {Number(pedido.descuentoManualMonto) > 0 ? (
              <div>
                <div style={{ fontSize: 14 }}>
                  {pedido.descuentoManualTipo === 'PORCENTAJE'
                    ? `${pedido.descuentoManualValor}% de descuento`
                    : `Descuento fijo de $${pedido.descuentoManualValor}`}{' '}
                  — se descontaron <strong>${pedido.descuentoManualMonto}</strong>
                </div>
                {pedido.descuentoManualNotas && (
                  <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
                    Nota: {pedido.descuentoManualNotas}
                  </div>
                )}
                {pedido.descuentoAplicadoPor && (
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                    Activado por {pedido.descuentoAplicadoPor.nombre}
                  </div>
                )}
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  {pedido.descuentoConfirmadoWhatsapp ? (
                    <span style={{ color: '#1e7e34', fontWeight: 600 }}>✓ Confirmado con el cliente por WhatsApp</span>
                  ) : (
                    <span style={{ color: '#a15c00' }}>Todavía no se le confirma al cliente por WhatsApp</span>
                  )}
                </div>

                {pedido.estado === 'PENDIENTE_PAGO' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {!pedido.descuentoConfirmadoWhatsapp && (
                      <button className="btn" disabled={procesando} onClick={confirmarDescuentoWhatsapp}>
                        Marcar confirmado por WhatsApp
                      </button>
                    )}
                    <button
                      className="btn-secondary btn"
                      disabled={procesando}
                      onClick={() => {
                        setMostrarFormDescuento(true);
                        setTipoDescuento((pedido.descuentoManualTipo as 'PORCENTAJE' | 'MONTO') || 'PORCENTAJE');
                        setValorDescuento(pedido.descuentoManualValor || '');
                        setNotasDescuento(pedido.descuentoManualNotas || '');
                      }}
                    >
                      Editar
                    </button>
                    <button className="btn-secondary btn" disabled={procesando} onClick={quitarDescuento}>
                      Quitar descuento
                    </button>
                  </div>
                )}
              </div>
            ) : (
              pedido.estado === 'PENDIENTE_PAGO' &&
              !mostrarFormDescuento && (
                <button className="btn" onClick={() => setMostrarFormDescuento(true)}>
                  Activar descuento
                </button>
              )
            )}

            {pedido.estado === 'PENDIENTE_PAGO' && mostrarFormDescuento && (
              <div style={{ marginTop: Number(pedido.descuentoManualMonto) > 0 ? 12 : 0 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13 }}>Tipo</label>
                    <select value={tipoDescuento} onChange={(e) => setTipoDescuento(e.target.value as 'PORCENTAJE' | 'MONTO')}>
                      <option value="PORCENTAJE">Porcentaje (%)</option>
                      <option value="MONTO">Monto fijo ($)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13 }}>Valor {tipoDescuento === 'PORCENTAJE' ? '(%)' : '($)'}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={valorDescuento}
                      onChange={(e) => setValorDescuento(e.target.value)}
                    />
                  </div>
                </div>
                <label style={{ fontSize: 13 }}>Nota (opcional, uso interno)</label>
                <div style={{ marginBottom: 8, marginTop: 4 }}>
                  <input
                    value={notasDescuento}
                    onChange={(e) => setNotasDescuento(e.target.value)}
                    placeholder="Ej. modelo con descuento por promoción de agosto"
                  />
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>
                  Recuerda confirmarle el descuento al cliente por WhatsApp antes de que haga la transferencia.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" disabled={procesando} onClick={activarDescuento}>
                    Guardar descuento
                  </button>
                  <button
                    className="btn-secondary btn"
                    disabled={procesando}
                    onClick={() => {
                      setMostrarFormDescuento(false);
                      setValorDescuento('');
                      setNotasDescuento('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {pedido.estado === 'PAGADO' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>Marcar como enviado</h2>
            <label style={{ fontSize: 13 }}>Paquetería (opcional)</label>
            <div style={{ marginBottom: 8, marginTop: 4 }}>
              <input value={paqueteria} onChange={(e) => setPaqueteria(e.target.value)} placeholder="Ej. Estafeta" />
            </div>
            <label style={{ fontSize: 13 }}>Número de guía (opcional)</label>
            <div style={{ marginBottom: 12, marginTop: 4 }}>
              <input value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} />
            </div>
            <button
              className="btn"
              disabled={procesando}
              onClick={() =>
                accion('marcar-enviado', { paqueteria: paqueteria || undefined, numeroGuia: numeroGuia || undefined })
              }
            >
              Marcar como enviado
            </button>
          </div>
        )}

        {pedido.estado === 'ENVIADO' && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              {pedido.paqueteria ? `Paquetería: ${pedido.paqueteria}. ` : ''}
              {pedido.numeroGuia ? `Guía: ${pedido.numeroGuia}.` : ''}
            </p>
            <button className="btn" disabled={procesando} onClick={() => accion('marcar-recibido')}>
              Marcar como recibido
            </button>
          </div>
        )}

        {['PENDIENTE_PAGO', 'EN_VALIDACION', 'PAGADO'].includes(pedido.estado) && (
          <button className="btn-secondary btn" disabled={procesando} onClick={cancelarPedido}>
            Cancelar pedido
          </button>
        )}

        {mensaje && <p style={{ fontSize: 13, marginTop: 12 }}>{mensaje}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'fit-content' }}>
      <div className="card" style={{ height: 'fit-content' }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Artículos</h2>
        {pedido.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <ProductoThumb
              url={imagenPrincipal(it.variante.producto, it.variante.color)}
              alt={it.variante.producto.nombre}
            />
            <div style={{ flex: 1, fontSize: 13 }}>
              <div>{it.variante.producto.nombre}</div>
              <div style={{ color: 'var(--color-muted)' }}>
                {[it.variante.talla?.valor, it.variante.color].filter(Boolean).join(' / ')} · {it.variante.sku} · sale de{' '}
                {it.sucursalStock?.nombre}
              </div>
              <div style={{ color: 'var(--color-muted)' }}>Proveedor: {it.proveedor?.nombre || 'sin asignar'}</div>
              <div>
                {it.cantidad} × ${it.precioUnitario} = ${it.subtotal}
              </div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 10, paddingTop: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)' }}>
            <span>Subtotal</span>
            <span>${pedido.items.reduce((acc, it) => acc + Number(it.subtotal), 0).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', marginTop: 4 }}>
            <span>Envío</span>
            <span>${pedido.costoEnvio}</span>
          </div>
          {Number(pedido.cuponDescuento) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', marginTop: 4 }}>
              <span>Cupón {pedido.cuponCodigo}</span>
              <span>-${pedido.cuponDescuento}</span>
            </div>
          )}
          {Number(pedido.descuentoManualMonto) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', marginTop: 4 }}>
              <span>Descuento</span>
              <span>-${pedido.descuentoManualMonto}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6 }}>
            <span>Total</span>
            <span>${pedido.total}</span>
          </div>
        </div>
      </div>

      {pedido.resena && (
        <div className="card" style={{ height: 'fit-content' }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Reseña del cliente</h2>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--color-muted)', marginBottom: 2 }}>Producto</div>
              <Estrellas valor={pedido.resena.calificacionProducto} />
            </div>
            <div>
              <div style={{ color: 'var(--color-muted)', marginBottom: 2 }}>Envío</div>
              <Estrellas valor={pedido.resena.calificacionEnvio} />
            </div>
          </div>
          {pedido.resena.comentario && <p style={{ fontSize: 14, marginBottom: 10 }}>{pedido.resena.comentario}</p>}
          {pedido.resena.fotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pedido.resena.fotos.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                  <img src={f.url} alt="Foto del paquete recibido" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
