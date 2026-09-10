'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  notas: string | null;
  saldoFavor: string;
}

interface Sucursal {
  id: number;
  nombre: string;
}

interface ApartadoResumen {
  id: number;
  folio: string;
  estado: 'ACTIVO' | 'LIQUIDADO' | 'CANCELADO';
  total: string;
  pagado: number;
  saldoPendiente: number;
  createdAt: string;
}

interface CambioResumen {
  id: number;
  folio: string;
  totalDevuelto: string;
  totalNuevo: string;
  diferencia: string;
  estado: 'COMPLETADO' | 'CANCELADO';
  createdAt: string;
}

interface VentaResumen {
  id: number;
  folio: string;
  total: string;
  saldoAplicado: string;
  estado: 'COMPLETADA' | 'CANCELADA' | 'PENDIENTE';
  createdAt: string;
}

interface MovimientoSaldo {
  id: number;
  tipo: 'ABONO' | 'CONSUMO' | 'REVERSA';
  monto: string;
  saldoResultante: string;
  notas: string | null;
  createdAt: string;
  usuario: { nombre: string };
  sucursal: { nombre: string };
  cambio: { id: number; folio: string } | null;
  venta: { id: number; folio: string } | null;
}

interface ClienteDetalle extends Cliente {
  apartados: ApartadoResumen[];
  movimientosSaldo: MovimientoSaldo[];
  cambios: CambioResumen[];
  ventas: VentaResumen[];
}

const TIPO_MOVIMIENTO_LABEL: Record<MovimientoSaldo['tipo'], string> = {
  ABONO: 'Abono',
  CONSUMO: 'Consumo',
  REVERSA: 'Reversa',
};

const ESTADO_APARTADO_LABEL: Record<ApartadoResumen['estado'], string> = {
  ACTIVO: 'Activo',
  LIQUIDADO: 'Liquidado',
  CANCELADO: 'Cancelado',
};

function clienteVacio() {
  return { nombre: '', telefono: '', email: '', notas: '' };
}

export default function ClientesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(clienteVacio());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar(q?: string) {
    const data = await api<Cliente[]>(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setClientes(data);
  }

  useEffect(() => {
    cargar();
    if (esAdmin) api<Sucursal[]>('/sucursales').then(setSucursales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Búsqueda con debounce (mismo criterio que apartados/cambios).
  useEffect(() => {
    const t = setTimeout(() => {
      cargar(busqueda.trim() || undefined);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  async function cargarDetalle(id: number) {
    setCargandoDetalle(true);
    try {
      const data = await api<ClienteDetalle>(`/clientes/${id}`);
      setDetalle(data);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function toggleExpandir(id: number) {
    if (expandidoId === id) {
      setExpandidoId(null);
      setDetalle(null);
    } else {
      setExpandidoId(id);
      cargarDetalle(id);
    }
  }

  function abrirNuevo() {
    setEditandoId(null);
    setForm(clienteVacio());
    setMensaje(null);
    setMostrarForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditandoId(c.id);
    setForm({ nombre: c.nombre, telefono: c.telefono, email: c.email || '', notas: c.notas || '' });
    setMensaje(null);
    setMostrarForm(true);
  }

  async function guardarCliente() {
    if (!form.nombre.trim() || !form.telefono.trim()) {
      setMensaje('Nombre y teléfono son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        email: form.email || undefined,
        notas: form.notas || undefined,
      };
      if (editandoId) {
        await api(`/clientes/${editandoId}`, { method: 'PUT', body: JSON.stringify(datos) });
        setMensaje('Cliente actualizado.');
        setMostrarForm(false);
        cargar(busqueda.trim() || undefined);
        if (editandoId === expandidoId) cargarDetalle(editandoId);
      } else {
        await api('/clientes', { method: 'POST', body: JSON.stringify(datos) });
        setMensaje('Cliente creado.');
        setMostrarForm(false);
        cargar(busqueda.trim() || undefined);
      }
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al guardar el cliente.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22 }}>Clientes</h1>
        <button className="btn" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirNuevo())}>
          {mostrarForm ? 'Cerrar' : '+ Nuevo cliente'}
        </button>
      </div>

      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Aquí se administran los datos de contacto de cada cliente registrado, su saldo a favor (generado por
        cambios de producto y consumido en ventas o cambios futuros — ver módulo Cambios) y su historial de
        apartados, cambios y ventas.
      </p>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
        />
      </div>

      {mensaje && !mostrarForm && <p style={{ fontSize: 13, marginBottom: 16 }}>{mensaje}</p>}

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>{editandoId ? 'Editar cliente' : 'Nuevo cliente'}</h2>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Teléfono</label>
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
          </div>

          <label style={{ fontSize: 13 }}>Email (opcional)</label>
          <div style={{ marginBottom: 10 }}>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <label style={{ fontSize: 13 }}>Notas (opcional)</label>
          <div style={{ marginBottom: 12 }}>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} style={{ width: '100%' }} />
          </div>

          {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

          <button className="btn" onClick={guardarCliente} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th>Saldo a favor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <ClienteFila
              key={c.id}
              cliente={c}
              expandido={expandidoId === c.id}
              detalle={expandidoId === c.id ? detalle : null}
              cargandoDetalle={expandidoId === c.id && cargandoDetalle}
              esAdmin={esAdmin}
              sucursales={sucursales}
              sucursalUsuarioId={usuario?.sucursalId ?? null}
              onToggle={() => toggleExpandir(c.id)}
              onEditar={() => abrirEdicion(c)}
              onCambio={() => {
                cargarDetalle(c.id);
                cargar(busqueda.trim() || undefined);
              }}
            />
          ))}
          {clientes.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--color-muted)' }}>
                Sin clientes registrados todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClienteFila({
  cliente,
  expandido,
  detalle,
  cargandoDetalle,
  esAdmin,
  sucursales,
  sucursalUsuarioId,
  onToggle,
  onEditar,
  onCambio,
}: {
  cliente: Cliente;
  expandido: boolean;
  detalle: ClienteDetalle | null;
  cargandoDetalle: boolean;
  esAdmin: boolean;
  sucursales: Sucursal[];
  sucursalUsuarioId: number | null;
  onToggle: () => void;
  onEditar: () => void;
  onCambio: () => void;
}) {
  const [tipoAjuste, setTipoAjuste] = useState<'ABONO' | 'CONSUMO'>('ABONO');
  const [montoAjuste, setMontoAjuste] = useState('');
  const [notasAjuste, setNotasAjuste] = useState('');
  const [sucursalAjusteId, setSucursalAjusteId] = useState('');
  const [mensajeAjuste, setMensajeAjuste] = useState<string | null>(null);
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  useEffect(() => {
    if (sucursalUsuarioId) setSucursalAjusteId(String(sucursalUsuarioId));
    else if (sucursales[0]) setSucursalAjusteId(String(sucursales[0].id));
  }, [sucursales, sucursalUsuarioId]);

  async function registrarAjuste() {
    const montoNum = Number(montoAjuste);
    if (!montoNum || montoNum <= 0) {
      setMensajeAjuste('Indica un monto válido.');
      return;
    }
    if (!notasAjuste.trim()) {
      setMensajeAjuste('Indica el motivo del ajuste.');
      return;
    }
    if (!sucursalAjusteId) {
      setMensajeAjuste('Indica la sucursal.');
      return;
    }
    setGuardandoAjuste(true);
    try {
      await api(`/clientes/${cliente.id}/ajustar-saldo`, {
        method: 'POST',
        body: JSON.stringify({
          tipo: tipoAjuste,
          monto: montoNum,
          notas: notasAjuste.trim(),
          sucursalId: Number(sucursalAjusteId),
        }),
      });
      setMontoAjuste('');
      setNotasAjuste('');
      setMensajeAjuste('Ajuste registrado.');
      onCambio();
    } catch (err) {
      setMensajeAjuste(err instanceof ApiError ? err.message : 'Error al registrar el ajuste.');
    } finally {
      setGuardandoAjuste(false);
    }
  }

  function origenMovimiento(m: MovimientoSaldo) {
    if (m.cambio) return `Cambio ${m.cambio.folio}`;
    if (m.venta) return `Venta ${m.venta.folio}`;
    return 'Ajuste manual';
  }

  return (
    <>
      <tr>
        <td>{cliente.nombre}</td>
        <td>{cliente.telefono}</td>
        <td>{cliente.email || '—'}</td>
        <td>${Number(cliente.saldoFavor).toFixed(2)}</td>
        <td style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn" onClick={onToggle}>
            {expandido ? 'Ocultar' : 'Ver'}
          </button>
          <button className="btn-secondary btn" onClick={onEditar}>
            Editar
          </button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={5}>
            <div style={{ padding: 12, background: 'var(--color-panel)', borderRadius: 8 }}>
              {cargandoDetalle || !detalle ? (
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
              ) : (
                <>
                  {detalle.notas && (
                    <p style={{ fontSize: 13, marginBottom: 12 }}>
                      <strong>Notas:</strong> {detalle.notas}
                    </p>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Saldo a favor actual: ${Number(detalle.saldoFavor).toFixed(2)}
                  </h3>

                  {esAdmin && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, display: 'block' }}>Ajuste</label>
                        <select value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value as typeof tipoAjuste)}>
                          <option value="ABONO">Abonar saldo</option>
                          <option value="CONSUMO">Descontar saldo</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, display: 'block' }}>Monto</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={montoAjuste}
                          onChange={(e) => setMontoAjuste(e.target.value)}
                          style={{ maxWidth: 120 }}
                        />
                      </div>
                      {sucursales.length > 0 && (
                        <div>
                          <label style={{ fontSize: 12, display: 'block' }}>Sucursal</label>
                          <select value={sucursalAjusteId} onChange={(e) => setSucursalAjusteId(e.target.value)}>
                            {sucursales.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label style={{ fontSize: 12, display: 'block' }}>Motivo</label>
                        <input value={notasAjuste} onChange={(e) => setNotasAjuste(e.target.value)} placeholder="Cortesía, corrección..." />
                      </div>
                      <button className="btn" onClick={registrarAjuste} disabled={guardandoAjuste}>
                        {guardandoAjuste ? 'Guardando...' : 'Registrar ajuste'}
                      </button>
                    </div>
                  )}
                  {mensajeAjuste && <p style={{ fontSize: 13, marginBottom: 12 }}>{mensajeAjuste}</p>}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Movimientos de saldo ({detalle.movimientosSaldo.length})
                  </h3>
                  {detalle.movimientosSaldo.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Sin movimientos todavía.</p>
                  ) : (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Monto</th>
                          <th>Saldo resultante</th>
                          <th>Origen</th>
                          <th>Motivo</th>
                          <th>Registrado por</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.movimientosSaldo.map((m) => (
                          <tr key={m.id}>
                            <td>{TIPO_MOVIMIENTO_LABEL[m.tipo]}</td>
                            <td>${Number(m.monto).toFixed(2)}</td>
                            <td>${Number(m.saldoResultante).toFixed(2)}</td>
                            <td>{origenMovimiento(m)}</td>
                            <td>{m.notas || '—'}</td>
                            <td>{m.usuario?.nombre} ({m.sucursal?.nombre})</td>
                            <td>{formatearFechaHora(m.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>Apartados ({detalle.apartados.length})</h3>
                  {detalle.apartados.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Sin apartados registrados.</p>
                  ) : (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th>Folio</th>
                          <th>Estado</th>
                          <th>Total</th>
                          <th>Pagado</th>
                          <th>Saldo pendiente</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.apartados.map((a) => (
                          <tr key={a.id}>
                            <td>{a.folio}</td>
                            <td>{ESTADO_APARTADO_LABEL[a.estado]}</td>
                            <td>${Number(a.total).toFixed(2)}</td>
                            <td>${a.pagado.toFixed(2)}</td>
                            <td>${a.saldoPendiente.toFixed(2)}</td>
                            <td>{formatearFechaHora(a.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>Cambios ({detalle.cambios.length})</h3>
                  {detalle.cambios.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Sin cambios registrados.</p>
                  ) : (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th>Folio</th>
                          <th>Total devuelto</th>
                          <th>Total nuevo</th>
                          <th>Diferencia</th>
                          <th>Estado</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.cambios.map((c) => (
                          <tr key={c.id}>
                            <td>{c.folio}</td>
                            <td>${Number(c.totalDevuelto).toFixed(2)}</td>
                            <td>${Number(c.totalNuevo).toFixed(2)}</td>
                            <td>${Number(c.diferencia).toFixed(2)}</td>
                            <td>{c.estado === 'COMPLETADO' ? 'Completado' : 'Cancelado'}</td>
                            <td>{formatearFechaHora(c.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>Ventas ({detalle.ventas.length})</h3>
                  {detalle.ventas.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Sin ventas registradas a nombre de este cliente.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Folio</th>
                          <th>Total</th>
                          <th>Saldo aplicado</th>
                          <th>Estado</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.ventas.map((v) => (
                          <tr key={v.id}>
                            <td>{v.folio}</td>
                            <td>${Number(v.total).toFixed(2)}</td>
                            <td>${Number(v.saldoAplicado).toFixed(2)}</td>
                            <td>{v.estado === 'COMPLETADA' ? 'Completada' : v.estado === 'CANCELADA' ? 'Cancelada' : 'Pendiente'}</td>
                            <td>{formatearFechaHora(v.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
