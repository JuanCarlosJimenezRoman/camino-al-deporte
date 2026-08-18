'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiUpload, ApiError } from '@/lib/api';
import { ProductoThumb, imagenPrincipal } from '@/components/admin/ProductoThumb';

interface Pedido {
  id: number;
  folio: string;
  estado: string;
  total: string;
  origen: 'TIENDA_ONLINE' | 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TELEFONO' | 'OTRO';
  createdAt: string;
  cliente: { nombre: string; telefono: string };
  items: { id: number }[];
  cuponDescuento?: string;
  descuentoManualMonto?: string;
}

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
// veces si más de un proveedor tiene stock de ella en esa sucursal — mismo
// criterio que app/dashboard/apartados/page.tsx.
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

const ESTADOS = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'PENDIENTE_PAGO', etiqueta: 'Pendiente de pago' },
  { valor: 'EN_VALIDACION', etiqueta: 'En validación' },
  { valor: 'PAGADO', etiqueta: 'Pagado' },
  { valor: 'ENVIADO', etiqueta: 'Enviado' },
  { valor: 'RECIBIDO', etiqueta: 'Recibido' },
  { valor: 'CANCELADO', etiqueta: 'Cancelado' },
] as const;

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'En validación',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

const ORIGEN_LABEL: Record<string, string> = {
  TIENDA_ONLINE: 'Tienda en línea',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TELEFONO: 'Teléfono',
  OTRO: 'Otro canal',
};

// Canales manuales que puede elegir un vendedor al capturar un pedido a
// mano — no incluye TIENDA_ONLINE, que solo lo genera el checkout de la
// tienda (ver enum OrigenPedido en schema.prisma).
const ORIGENES_MANUALES = ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEFONO', 'OTRO'] as const;

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

export default function PedidosOnlinePage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
      setPedidos(await api<Pedido[]>(`/pedidos-online${qs}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pedidos.');
    }
  }

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Pedidos</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 200 }}>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cerrar formulario' : '+ Nuevo pedido manual'}
          </button>
        </div>
      </div>

      {mostrarForm && (
        <NuevoPedidoManualForm
          sucursales={sucursales}
          cuentas={cuentas}
          onCreado={() => {
            setMostrarForm(false);
            setMensaje('Pedido manual registrado.');
            cargar();
          }}
        />
      )}

      {mensaje && <p style={{ fontSize: 13, margin: '12px 0' }}>{mensaje}</p>}
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Canal</th>
            <th>Artículos</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>{p.folio}</td>
              <td>
                {p.cliente?.nombre}
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.cliente?.telefono}</div>
              </td>
              <td>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: p.origen === 'TIENDA_ONLINE' ? 'var(--color-panel)' : 'var(--color-accent-muted, #e0f2ea)',
                    border: '1px solid var(--color-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ORIGEN_LABEL[p.origen] || p.origen}
                </span>
              </td>
              <td>{p.items.length}</td>
              <td>
                ${p.total}
                {(Number(p.cuponDescuento) > 0 || Number(p.descuentoManualMonto) > 0) && (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>con descuento</div>
                )}
              </td>
              <td>{ESTADO_LABEL[p.estado] || p.estado}</td>
              <td>{new Date(p.createdAt).toLocaleString('es-MX')}</td>
              <td>
                <Link href={`/dashboard/pedidos-online/${p.id}`} className="btn-secondary btn">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {pedidos.length === 0 && (
            <tr>
              <td colSpan={8} style={{ color: 'var(--color-muted)' }}>
                Sin pedidos todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de nuevo pedido manual (WhatsApp, Instagram, Facebook, teléfono)
// ---------------------------------------------------------------------------
//
// Mismo patrón que NuevoApartadoForm en app/dashboard/apartados/page.tsx:
// buscar/dar de alta cliente por teléfono, elegir artículos por sucursal de
// stock con su precio, y un carrito antes de confirmar. Además captura la
// dirección de envío y el método de pago, que un apartado no necesita.

function NuevoPedidoManualForm({
  sucursales,
  cuentas,
  onCreado,
}: {
  sucursales: Sucursal[];
  cuentas: CuentaTransferencia[];
  onCreado: () => void;
}) {
  const [origen, setOrigen] = useState<(typeof ORIGENES_MANUALES)[number]>('WHATSAPP');

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

  // Dirección de envío
  const [destinatario, setDestinatario] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [calle, setCalle] = useState('');
  const [numeroExt, setNumeroExt] = useState('');
  const [numeroInt, setNumeroInt] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estadoMx, setEstadoMx] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [referencias, setReferencias] = useState('');
  const [costoEnvio, setCostoEnvio] = useState('0');
  const [notas, setNotas] = useState('');

  // Pago
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [cuentaTransferenciaId, setCuentaTransferenciaId] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [marcarPagado, setMarcarPagado] = useState(false);

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

  const totalArticulos = carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
  const totalConEnvio = totalArticulos + (Number(costoEnvio) || 0);

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

  async function crearPedido() {
    if (carrito.length === 0) {
      setMensaje('Agrega al menos un artículo.');
      return;
    }
    if (!clienteSeleccionado && !(nombreNuevo.trim() && telefonoNuevo.trim())) {
      setMensaje('Selecciona un cliente existente o captura nombre y teléfono para uno nuevo.');
      return;
    }
    if (
      !destinatario.trim() ||
      !telefonoContacto.trim() ||
      !calle.trim() ||
      !numeroExt.trim() ||
      !colonia.trim() ||
      !municipio.trim() ||
      !estadoMx.trim() ||
      !codigoPostal.trim()
    ) {
      setMensaje('Completa la dirección de envío (destinatario, teléfono, calle, número, colonia, municipio, estado y código postal).');
      return;
    }
    if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
      setMensaje('Elige a qué cuenta se hizo (o se hará) la transferencia.');
      return;
    }

    setGuardando(true);
    setMensaje(null);
    try {
      const datos: Record<string, unknown> = {
        origen,
        destinatario: destinatario.trim(),
        telefonoContacto: telefonoContacto.trim(),
        calle: calle.trim(),
        numeroExt: numeroExt.trim(),
        numeroInt: numeroInt.trim() || undefined,
        colonia: colonia.trim(),
        municipio: municipio.trim(),
        estadoMx: estadoMx.trim(),
        codigoPostal: codigoPostal.trim(),
        referencias: referencias.trim() || undefined,
        notas: notas.trim() || undefined,
        costoEnvio: Number(costoEnvio) || 0,
        metodoPago,
        cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
        marcarPagado: marcarPagado || undefined,
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

      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      await apiUpload('/pedidos-online', formData);
      onCreado();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el pedido.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nuevo pedido manual</h2>

      <label style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
        Canal por el que llegó
        <select
          value={origen}
          onChange={(e) => setOrigen(e.target.value as typeof origen)}
          style={{ display: 'block', maxWidth: 220, marginTop: 4 }}
        >
          {ORIGENES_MANUALES.map((o) => (
            <option key={o} value={o}>
              {ORIGEN_LABEL[o]}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Cliente</h3>
          {clienteSeleccionado ? (
            <div style={{ fontSize: 14, marginBottom: 6 }}>
              {clienteSeleccionado.nombre} — {clienteSeleccionado.telefono}{' '}
              <button className="btn-secondary btn" onClick={() => setClienteSeleccionado(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                placeholder="Buscar por nombre o teléfono..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              {resultadosCliente.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {resultadosCliente.map((c) => (
                    <div
                      key={c.id}
                      style={{ fontSize: 13, padding: '4px 0', cursor: 'pointer' }}
                      onClick={() => {
                        setClienteSeleccionado(c);
                        setResultadosCliente([]);
                        setBusquedaCliente('');
                        setDestinatario((actual) => actual || c.nombre);
                        setTelefonoContacto((actual) => actual || c.telefono);
                      }}
                    >
                      {c.nombre} — {c.telefono}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>O captura un cliente nuevo:</div>
              <input
                placeholder="Nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <input
                placeholder="Teléfono"
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <input placeholder="Email (opcional)" value={emailNuevo} onChange={(e) => setEmailNuevo(e.target.value)} />
            </>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Dirección de envío</h3>
          <input
            placeholder="Destinatario"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <input
            placeholder="Teléfono de contacto"
            value={telefonoContacto}
            onChange={(e) => setTelefonoContacto(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input placeholder="Calle" value={calle} onChange={(e) => setCalle(e.target.value)} style={{ flex: 2 }} />
            <input placeholder="Núm. ext." value={numeroExt} onChange={(e) => setNumeroExt(e.target.value)} style={{ flex: 1 }} />
            <input placeholder="Núm. int." value={numeroInt} onChange={(e) => setNumeroInt(e.target.value)} style={{ flex: 1 }} />
          </div>
          <input placeholder="Colonia" value={colonia} onChange={(e) => setColonia(e.target.value)} style={{ marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input placeholder="Municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} style={{ flex: 1 }} />
            <input placeholder="Estado" value={estadoMx} onChange={(e) => setEstadoMx(e.target.value)} style={{ flex: 1 }} />
            <input placeholder="C.P." value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} style={{ flex: 1 }} />
          </div>
          <input
            placeholder="Referencias (opcional)"
            value={referencias}
            onChange={(e) => setReferencias(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <label style={{ fontSize: 12 }}>Costo de envío</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={costoEnvio}
            onChange={(e) => setCostoEnvio(e.target.value)}
            style={{ display: 'block', maxWidth: 120, marginBottom: 6 }}
          />
          <label style={{ fontSize: 12 }}>Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} style={{ width: '100%' }} />
        </div>
      </div>

      <h3 style={{ fontSize: 13, marginBottom: 6 }}>Artículos (pueden venir de cualquier sucursal)</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Sucursal de stock</label>
          <select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Buscar SKU / producto</label>
          <input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Producto</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
            <select value={existenciaKey} onChange={(e) => setExistenciaKey(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">Selecciona...</option>
              {existencias.map((e) => (
                <option key={claveExistencia(e)} value={claveExistencia(e)}>
                  {e.variante.producto.nombre} {e.variante.talla ? `(${e.variante.talla.valor})` : ''} — {e.variante.sku} —{' '}
                  {e.proveedor?.nombre ?? 'sin proveedor'} — stock: {e.stockActual}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Cantidad</label>
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ maxWidth: 80 }} />
        </div>
        <button className="btn-secondary btn" onClick={agregarAlCarrito} disabled={!existenciaKey}>
          Agregar
        </button>
      </div>

      {carrito.length > 0 && (
        <table style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th></th>
              <th>Artículo</th>
              <th>Sucursal</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carrito.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <ProductoThumb url={it.imagenUrl} alt={it.descripcion} />
                </td>
                <td>{it.descripcion}</td>
                <td>{it.sucursalStockNombre}</td>
                <td>{it.cantidad}</td>
                <td>${it.precioUnitario.toFixed(2)}</td>
                <td>${(it.cantidad * it.precioUnitario).toFixed(2)}</td>
                <td>
                  <button className="btn-secondary btn" onClick={() => quitarDelCarrito(idx)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {carrito.length > 0 && (
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Artículos: ${totalArticulos.toFixed(2)} + envío ${(Number(costoEnvio) || 0).toFixed(2)} = Total: ${totalConEnvio.toFixed(2)}
        </p>
      )}

      <h3 style={{ fontSize: 13, marginBottom: 6 }}>Pago</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Método</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}>
            {METODOS_PAGO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        {metodoPago === 'TRANSFERENCIA' && (
          <>
            <div>
              <label style={{ fontSize: 12, display: 'block' }}>Cuenta</label>
              <select value={cuentaTransferenciaId} onChange={(e) => setCuentaTransferenciaId(e.target.value)}>
                <option value="">Selecciona...</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, display: 'block' }}>Comprobante (si ya lo mandó por chat)</label>
              <input type="file" accept="image/*" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
            </div>
          </>
        )}
      </div>

      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <input type="checkbox" checked={marcarPagado} onChange={(e) => setMarcarPagado(e.target.checked)} />
        Ya se cobró — marcar el pedido como pagado de una vez
      </label>
      {!marcarPagado && (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: -8, marginBottom: 12 }}>
          {metodoPago === 'TRANSFERENCIA'
            ? 'Se guardará pendiente de pago (o en validación, si adjuntaste el comprobante) hasta confirmarlo desde el detalle del pedido.'
            : 'Se guardará pendiente de pago hasta marcarlo como pagado desde el detalle del pedido.'}
        </p>
      )}

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <button className="btn" onClick={crearPedido} disabled={guardando}>
        {guardando ? 'Guardando...' : 'Registrar pedido'}
      </button>
    </div>
  );
}
