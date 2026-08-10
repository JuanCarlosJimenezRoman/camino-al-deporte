'use client';

import { useEffect, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';

interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
  notas: string | null;
  activo: boolean;
}

interface PagoProveedor {
  id: number;
  monto: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  concepto: string | null;
  comprobanteUrl: string | null;
  registradoPor: { nombre: string };
  createdAt: string;
}

interface ProveedorDetalle extends Proveedor {
  variantes: {
    id: number;
    sku: string;
    talla: { valor: string } | null;
    producto: { nombre: string };
  }[];
  pagos: PagoProveedor[];
  totalPagado: number;
}

const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;

function proveedorVacio() {
  return { nombre: '', contacto: '', telefono: '', banco: '', titular: '', numeroCuenta: '', notas: '' };
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<ProveedorDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(proveedorVacio());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const data = await api<Proveedor[]>('/proveedores?todas=1');
    setProveedores(data);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cargarDetalle(id: number) {
    setCargandoDetalle(true);
    try {
      const data = await api<ProveedorDetalle>(`/proveedores/${id}`);
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
    setForm(proveedorVacio());
    setMostrarForm(true);
  }

  function abrirEdicion(p: Proveedor) {
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre,
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      banco: p.banco || '',
      titular: p.titular || '',
      numeroCuenta: p.numeroCuenta || '',
      notas: p.notas || '',
    });
    setMostrarForm(true);
  }

  async function guardarProveedor() {
    if (!form.nombre.trim()) {
      setMensaje('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        contacto: form.contacto || undefined,
        telefono: form.telefono || undefined,
        banco: form.banco || undefined,
        titular: form.titular || undefined,
        numeroCuenta: form.numeroCuenta || undefined,
        notas: form.notas || undefined,
      };
      if (editandoId) {
        await api(`/proveedores/${editandoId}`, { method: 'PUT', body: JSON.stringify(datos) });
        setMensaje('Proveedor actualizado.');
      } else {
        await api('/proveedores', { method: 'POST', body: JSON.stringify(datos) });
        setMensaje('Proveedor creado.');
      }
      setMostrarForm(false);
      cargar();
      if (editandoId !== null && editandoId === expandidoId) cargarDetalle(editandoId);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: Proveedor) {
    await api(`/proveedores/${p.id}`, { method: 'PUT', body: JSON.stringify({ activo: !p.activo }) });
    cargar();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Proveedores</h1>
        <button className="btn" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirNuevo())}>
          {mostrarForm ? 'Cerrar' : '+ Nuevo proveedor'}
        </button>
      </div>

      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Cada variante (talla/color) de un producto puede tener su propio proveedor asignado — útil cuando el
        mismo modelo lo surten distintos proveedores según el número. Al registrar una entrada de inventario
        también puedes indicar de qué proveedor vino ese lote.
      </p>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>{editandoId ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>

          <label style={{ fontSize: 13 }}>Nombre</label>
          <div style={{ marginBottom: 10 }}>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Distribuidora XYZ" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Contacto</label>
              <input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} placeholder="Nombre de quién atiende" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Teléfono</label>
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>
            Cuenta bancaria del proveedor (a dónde transferirle al pagarle):
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Banco</label>
              <input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13 }}>Titular</label>
              <input value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
            </div>
          </div>
          <label style={{ fontSize: 13 }}>CLABE / número de cuenta</label>
          <div style={{ marginBottom: 10 }}>
            <input value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })} />
          </div>

          <label style={{ fontSize: 13 }}>Notas (opcional)</label>
          <div style={{ marginBottom: 12 }}>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} style={{ width: '100%' }} />
          </div>

          {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

          <button className="btn" onClick={guardarProveedor} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Contacto</th>
            <th>Teléfono</th>
            <th>Cuenta</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proveedores.map((p) => (
            <ProveedorFila
              key={p.id}
              proveedor={p}
              expandido={expandidoId === p.id}
              detalle={expandidoId === p.id ? detalle : null}
              cargandoDetalle={expandidoId === p.id && cargandoDetalle}
              onToggle={() => toggleExpandir(p.id)}
              onEditar={() => abrirEdicion(p)}
              onToggleActivo={() => toggleActivo(p)}
              onPagoRegistrado={() => cargarDetalle(p.id)}
            />
          ))}
          {proveedores.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin proveedores registrados todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProveedorFila({
  proveedor,
  expandido,
  detalle,
  cargandoDetalle,
  onToggle,
  onEditar,
  onToggleActivo,
  onPagoRegistrado,
}: {
  proveedor: Proveedor;
  expandido: boolean;
  detalle: ProveedorDetalle | null;
  cargandoDetalle: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onToggleActivo: () => void;
  onPagoRegistrado: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'>('EFECTIVO');
  const [concepto, setConcepto] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function registrarPago() {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    if (metodoPago === 'TRANSFERENCIA' && !comprobante) {
      setMensaje('Falta la foto del comprobante.');
      return;
    }

    setGuardando(true);
    try {
      const datos = { monto: montoNum, metodoPago, concepto: concepto || undefined };
      const formData = new FormData();
      formData.append('datos', JSON.stringify(datos));
      if (comprobante) formData.append('comprobante', comprobante);

      await apiUpload(`/proveedores/${proveedor.id}/pagos`, formData);
      setMonto('');
      setMetodoPago('EFECTIVO');
      setConcepto('');
      setComprobante(null);
      setMensaje('Pago registrado.');
      onPagoRegistrado();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el pago.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <tr style={{ opacity: proveedor.activo ? 1 : 0.5 }}>
        <td>{proveedor.nombre}</td>
        <td>{proveedor.contacto || '—'}</td>
        <td>{proveedor.telefono || '—'}</td>
        <td>{proveedor.numeroCuenta ? `${proveedor.banco || ''} ${proveedor.numeroCuenta}` : '—'}</td>
        <td>{proveedor.activo ? 'Activo' : 'Inactivo'}</td>
        <td style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn" onClick={onToggle}>
            {expandido ? 'Ocultar' : 'Ver'}
          </button>
          <button className="btn-secondary btn" onClick={onEditar}>
            Editar
          </button>
          <button className="btn-secondary btn" onClick={onToggleActivo}>
            {proveedor.activo ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={6}>
            <div style={{ padding: 12, background: 'var(--color-panel)', borderRadius: 8 }}>
              {cargandoDetalle || !detalle ? (
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
              ) : (
                <>
                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Productos que surte ({detalle.variantes.length})
                  </h3>
                  {detalle.variantes.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
                      Todavía no tiene variantes asignadas. Se asignan desde Productos.
                    </p>
                  ) : (
                    <div style={{ marginBottom: 12, fontSize: 13 }}>
                      {detalle.variantes.map((v) => (
                        <div key={v.id} style={{ padding: '2px 0' }}>
                          {v.producto.nombre} {v.talla ? `(${v.talla.valor})` : ''} — {v.sku}
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Pagos — total pagado: ${detalle.totalPagado.toFixed(2)}
                  </h3>
                  {detalle.pagos.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Sin pagos registrados.</p>
                  ) : (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th>Monto</th>
                          <th>Método</th>
                          <th>Concepto</th>
                          <th>Registrado por</th>
                          <th>Fecha</th>
                          <th>Comprobante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.pagos.map((pg) => (
                          <tr key={pg.id}>
                            <td>${pg.monto}</td>
                            <td>
                              {pg.metodoPago === 'EFECTIVO' ? 'Efectivo' : pg.metodoPago === 'TARJETA' ? 'Tarjeta' : 'Transferencia'}
                            </td>
                            <td>{pg.concepto || '—'}</td>
                            <td>{pg.registradoPor?.nombre}</td>
                            <td>{new Date(pg.createdAt).toLocaleString('es-MX')}</td>
                            <td>
                              {pg.comprobanteUrl ? (
                                <a href={pg.comprobanteUrl} target="_blank" rel="noreferrer">
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

                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: 12, display: 'block' }}>Monto a pagar</label>
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
                    <div>
                      <label style={{ fontSize: 12, display: 'block' }}>Concepto (opcional)</label>
                      <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Reabasto de..." style={{ maxWidth: 180 }} />
                    </div>
                    {metodoPago === 'TRANSFERENCIA' && (
                      <div>
                        <label style={{ fontSize: 12, display: 'block' }}>Comprobante</label>
                        <input type="file" accept="image/*" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                      </div>
                    )}
                    <button className="btn" onClick={registrarPago} disabled={guardando}>
                      {guardando ? 'Guardando...' : 'Registrar pago'}
                    </button>
                  </div>
                  {mensaje && <p style={{ fontSize: 13, marginTop: 10 }}>{mensaje}</p>}
                  {proveedor.numeroCuenta && metodoPago === 'TRANSFERENCIA' && (
                    <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
                      Transferir a: {proveedor.banco || ''} · {proveedor.titular || ''} · {proveedor.numeroCuenta}
                    </p>
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
