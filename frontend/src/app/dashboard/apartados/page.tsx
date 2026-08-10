'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProductoThumb, imagenPrincipal } from '@/components/ProductoThumb';

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
    talla: { valor: string } | null;
    producto: { nombre: string; precioVenta: string; imagenes?: { url: string }[] };
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
    talla: { valor: string } | null;
    producto: { nombre: string; imagenes?: { url: string }[] };
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
}

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

export default function ApartadosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
    api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia').then(setCuentas);
  }, []);

  async function cargar() {
    const qs = new URLSearchParams();
    if (filtroEstado) qs.set('estado', filtroEstado);
    const data = await api<Apartado[]>(`/apartados?${qs.toString()}`);
    setApartados(data);
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Apartados</h1>
        <button className="btn" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cerrar formulario' : '+ Nuevo apartado'}
        </button>
      </div>

      {mostrarForm && (
        <NuevoApartadoForm
          sucursales={sucursales}
          cuentas={cuentas}
          usuario={usuario}
          esAdmin={esAdmin}
          onCreado={() => {
            setMostrarForm(false);
            setMensaje('Apartado registrado.');
            cargar();
          }}
        />
      )}

      {mensaje && <p style={{ fontSize: 13, margin: '12px 0' }}>{mensaje}</p>}

      {adeudosPorCliente.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>Clientes con adeudo</h2>
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
                  <td>{cliente.nombre}</td>
                  <td>{cliente.telefono}</td>
                  <td>{cantidad}</td>
                  <td>${saldo.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>Estado:</label>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">Todos</option>
          <option value="ACTIVO">Activos</option>
          <option value="LIQUIDADO">Liquidados</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
      </div>

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
          {apartados.length === 0 && (
            <tr>
              <td colSpan={9} style={{ color: 'var(--color-muted)' }}>
                Sin apartados registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
    try {
      const datos = {
        monto: montoNum,
        metodoPago,
        cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? Number(cuentaTransferenciaId) : undefined,
      };
      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      await apiUpload(`/apartados/${apartado.id}/pagos`, formData);
      setMonto('');
      setMetodoPago('EFECTIVO');
      setCuentaTransferenciaId('');
      setComprobante(null);
      setMensaje('Abono registrado.');
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el abono.');
    } finally {
      setGuardando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm(`¿Cancelar el apartado ${apartado.folio}? El stock reservado se devolverá.`)) return;
    try {
      await api(`/apartados/${apartado.id}/cancelar`, { method: 'POST' });
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cancelar.');
    }
  }

  return (
    <>
      <tr>
        <td>{apartado.folio}</td>
        <td>
          {apartado.cliente.nombre}
          <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{apartado.cliente.telefono}</div>
        </td>
        <td>{apartado.sucursalVenta?.nombre}</td>
        <td>${apartado.total}</td>
        <td>${apartado.pagado.toFixed(2)}</td>
        <td>${apartado.saldoPendiente.toFixed(2)}</td>
        <td>{apartado.estado}</td>
        <td>{apartado.fechaLimite ? new Date(apartado.fechaLimite).toLocaleDateString('es-MX') : '—'}</td>
        <td>
          <button className="btn-secondary btn" onClick={onToggle}>
            {expandido ? 'Ocultar' : 'Ver'}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={9}>
            <div style={{ padding: 12, background: 'var(--color-panel)', borderRadius: 8 }}>
              <h3 style={{ fontSize: 13, marginBottom: 6 }}>Artículos</h3>
              <table style={{ marginBottom: 12 }}>
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
                        <ProductoThumb url={imagenPrincipal(it.variante.producto)} alt={it.variante.producto.nombre} />
                      </td>
                      <td>{it.variante.sku}</td>
                      <td>{it.variante.producto.nombre}</td>
                      <td>{it.variante.talla?.valor ?? '—'}</td>
                      <td>{it.sucursalStock?.nombre ?? '—'}</td>
                      <td>{it.cantidad}</td>
                      <td>${it.precioUnitario}</td>
                      <td>${it.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ fontSize: 13, marginBottom: 6 }}>Pagos / abonos</h3>
              {apartado.pagos.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Sin abonos todavía.</p>
              ) : (
                <table style={{ marginBottom: 12 }}>
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
                        <td>${p.monto}</td>
                        <td>
                          {p.metodoPago === 'EFECTIVO' ? 'Efectivo' : p.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                          {p.cuentaTransferencia ? ` (${p.cuentaTransferencia.nombre})` : ''}
                        </td>
                        <td>{p.registradoPor?.nombre}</td>
                        <td>{new Date(p.createdAt).toLocaleString('es-MX')}</td>
                        <td>
                          {p.comprobanteUrl ? (
                            <a href={p.comprobanteUrl} target="_blank" rel="noreferrer">
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

              {apartado.estado === 'ACTIVO' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 12, display: 'block' }}>Monto del abono</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      style={{ maxWidth: 120 }}
                    />
                  </div>
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
                        <label style={{ fontSize: 12, display: 'block' }}>Comprobante</label>
                        <input type="file" accept="image/*" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                      </div>
                    </>
                  )}
                  <button className="btn" onClick={registrarAbono} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Registrar abono'}
                  </button>
                  <button className="btn-secondary btn" onClick={cancelar}>
                    Cancelar apartado
                  </button>
                </div>
              )}

              {apartado.notas && (
                <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 10 }}>Notas: {apartado.notas}</p>
              )}
              {mensaje && <p style={{ fontSize: 13, marginTop: 10 }}>{mensaje}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulario de nuevo apartado
// ---------------------------------------------------------------------------

function NuevoApartadoForm({
  sucursales,
  cuentas,
  usuario,
  esAdmin,
  onCreado,
}: {
  sucursales: Sucursal[];
  cuentas: CuentaTransferencia[];
  usuario: { sucursalId?: number | null } | null;
  esAdmin: boolean;
  onCreado: () => void;
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
        imagenUrl: imagenPrincipal(existencia.variante.producto),
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

      await apiUpload('/apartados', formData);
      onCreado();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el apartado.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nuevo apartado</h2>

      {esAdmin && (
        <>
          <label style={{ fontSize: 13 }}>Sucursal que atiende</label>
          <select
            value={sucursalVentaId}
            onChange={(e) => setSucursalVentaId(e.target.value)}
            style={{ marginBottom: 12, maxWidth: 240 }}
          >
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </>
      )}

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
                      }}
                    >
                      {c.nombre} — {c.telefono}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>
                O captura un cliente nuevo:
              </div>
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
              <input
                placeholder="Email (opcional)"
                value={emailNuevo}
                onChange={(e) => setEmailNuevo(e.target.value)}
              />
            </>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 13, marginBottom: 6 }}>Detalles</h3>
          <label style={{ fontSize: 12 }}>Fecha límite (opcional)</label>
          <input
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <label style={{ fontSize: 12 }}>Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} style={{ width: '100%' }} />
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
                url={imagenPrincipal(existencias.find((e) => claveExistencia(e) === existenciaKey)?.variante.producto)}
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

      {carrito.length > 0 && <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Total: ${totalCarrito.toFixed(2)}</p>}

      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input type="checkbox" checked={conAnticipo} onChange={(e) => setConAnticipo(e.target.checked)} />
        Registrar un anticipo ahora
      </label>

      {conAnticipo && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 12, display: 'block' }}>Monto</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={montoAnticipo}
              onChange={(e) => setMontoAnticipo(e.target.value)}
              style={{ maxWidth: 120 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, display: 'block' }}>Método</label>
            <select value={metodoAnticipo} onChange={(e) => setMetodoAnticipo(e.target.value as typeof metodoAnticipo)}>
              {METODOS_PAGO.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
          {metodoAnticipo === 'TRANSFERENCIA' && (
            <>
              <div>
                <label style={{ fontSize: 12, display: 'block' }}>Cuenta</label>
                <select value={cuentaAnticipoId} onChange={(e) => setCuentaAnticipoId(e.target.value)}>
                  <option value="">Selecciona...</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block' }}>Comprobante</label>
                <input type="file" accept="image/*" onChange={(e) => setComprobanteAnticipo(e.target.files?.[0] || null)} />
              </div>
            </>
          )}
        </div>
      )}

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <button className="btn" onClick={crearApartado} disabled={guardando}>
        {guardando ? 'Guardando...' : 'Registrar apartado'}
      </button>
    </div>
  );
}
