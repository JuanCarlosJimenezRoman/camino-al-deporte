'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';

interface Marca {
  id: number;
  nombre: string;
  activo: boolean;
}
interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
}
interface Modelo {
  id: number;
  nombre: string;
  marcaId: number;
  activo: boolean;
}
interface Talla {
  id: number;
  valor: string;
  tipo: string;
  orden: number;
}
interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
  activo: boolean;
  paraVentasOnline: boolean;
}

export default function CatalogosPage() {
  const { usuario } = useAuth();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Catálogos</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14 }}>
        Marcas, modelos, categorías y tallas se usan para clasificar los productos. Los cambios aquí
        aparecen de inmediato en el formulario de "Nuevo producto".
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <MarcasCard />
        <CategoriasCard />
        <ModelosCard />
        <TallasCard />
        {puedeVer('cuentasTransferencia', usuario?.rol) && <CuentasTransferenciaCard />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cuentas de transferencia (dónde se reciben los pagos por transferencia)
// ---------------------------------------------------------------------------

function CuentasTransferenciaCard() {
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [nombre, setNombre] = useState('');
  const [banco, setBanco] = useState('');
  const [titular, setTitular] = useState('');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editando, setEditando] = useState({ nombre: '', banco: '', titular: '', numeroCuenta: '' });
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCuentas(await api<CuentaTransferencia[]>('/catalogos/cuentas-transferencia?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api('/catalogos/cuentas-transferencia', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          banco: banco.trim() || undefined,
          titular: titular.trim() || undefined,
          numeroCuenta: numeroCuenta.trim() || undefined,
        }),
      });
      setNombre('');
      setBanco('');
      setTitular('');
      setNumeroCuenta('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la cuenta.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/cuentas-transferencia/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: editando.nombre,
          banco: editando.banco || undefined,
          titular: editando.titular || undefined,
          numeroCuenta: editando.numeroCuenta || undefined,
        }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la cuenta.');
    }
  }

  async function toggleActivo(c: CuentaTransferencia) {
    try {
      await api(`/catalogos/cuentas-transferencia/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !c.activo }),
      });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  async function toggleOnline(c: CuentaTransferencia) {
    try {
      await api(`/catalogos/cuentas-transferencia/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ paraVentasOnline: !c.paraVentasOnline }),
      });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <h2 style={{ fontSize: 15, marginBottom: 4 }}>Cuentas de transferencia</h2>
      <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 12 }}>
        Cuentas propias donde llegan los pagos por transferencia. Aparecen como opción al registrar una
        venta o un abono de apartado pagado por transferencia. Marca "Tienda en línea" en al menos una
        cuenta activa para que los clientes de la tienda puedan pagar por SPEI — sin eso, no se pueden
        crear pedidos en línea.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Etiqueta (ej. BBVA Tienda)" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ maxWidth: 180 }} />
        <input placeholder="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} style={{ maxWidth: 140 }} />
        <input placeholder="Titular" value={titular} onChange={(e) => setTitular(e.target.value)} style={{ maxWidth: 160 }} />
        <input
          placeholder="CLABE / número de cuenta"
          value={numeroCuenta}
          onChange={(e) => setNumeroCuenta(e.target.value)}
          style={{ maxWidth: 200 }}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <table>
        <thead>
          <tr>
            <th>Etiqueta</th>
            <th>Banco</th>
            <th>Titular</th>
            <th>Cuenta / CLABE</th>
            <th>Tienda en línea</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => (
            <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
              {editandoId === c.id ? (
                <>
                  <td>
                    <input
                      value={editando.nombre}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                      style={{ maxWidth: 160 }}
                    />
                  </td>
                  <td>
                    <input
                      value={editando.banco}
                      onChange={(e) => setEditando({ ...editando, banco: e.target.value })}
                      style={{ maxWidth: 120 }}
                    />
                  </td>
                  <td>
                    <input
                      value={editando.titular}
                      onChange={(e) => setEditando({ ...editando, titular: e.target.value })}
                      style={{ maxWidth: 140 }}
                    />
                  </td>
                  <td>
                    <input
                      value={editando.numeroCuenta}
                      onChange={(e) => setEditando({ ...editando, numeroCuenta: e.target.value })}
                      style={{ maxWidth: 180 }}
                    />
                  </td>
                  <td>{c.paraVentasOnline ? 'Sí' : 'No'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" onClick={() => guardarEdicion(c.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td>{c.nombre}</td>
                  <td>{c.banco || '—'}</td>
                  <td>{c.titular || '—'}</td>
                  <td>{c.numeroCuenta || '—'}</td>
                  <td>{c.paraVentasOnline ? 'Sí' : 'No'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary btn"
                      onClick={() => {
                        setEditandoId(c.id);
                        setEditando({
                          nombre: c.nombre,
                          banco: c.banco || '',
                          titular: c.titular || '',
                          numeroCuenta: c.numeroCuenta || '',
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button className="btn-secondary btn" onClick={() => toggleActivo(c)}>
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn-secondary btn" onClick={() => toggleOnline(c)}>
                      {c.paraVentasOnline ? 'Quitar de tienda' : 'Usar en tienda'}
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {cuentas.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                Sin cuentas registradas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marcas
// ---------------------------------------------------------------------------

function MarcasCard() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setMarcas(await api<Marca[]>('/catalogos/marcas?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api('/catalogos/marcas', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
      setNombre('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la marca.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/marcas/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: editandoNombre }) });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la marca.');
    }
  }

  async function toggleActivo(m: Marca) {
    try {
      await api(`/catalogos/marcas/${m.id}`, { method: 'PUT', body: JSON.stringify({ activo: !m.activo }) });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Marcas</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nueva marca (ej. Nike)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {marcas.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: m.activo ? 1 : 0.5,
            }}
          >
            {editandoId === m.id ? (
              <>
                <input
                  value={editandoNombre}
                  onChange={(e) => setEditandoNombre(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => guardarEdicion(m.id)}>
                  Guardar
                </button>
                <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14 }}>{m.nombre}</span>
                <button
                  className="btn-secondary btn"
                  onClick={() => {
                    setEditandoId(m.id);
                    setEditandoNombre(m.nombre);
                  }}
                >
                  Editar
                </button>
                <button className="btn-secondary btn" onClick={() => toggleActivo(m)}>
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </div>
        ))}
        {marcas.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin marcas todavía.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

function CategoriasCard() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCategorias(await api<Categoria[]>('/catalogos/categorias?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api('/catalogos/categorias', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
      setNombre('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la categoría.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/categorias/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: editandoNombre }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar.');
    }
  }

  async function toggleActivo(c: Categoria) {
    try {
      await api(`/catalogos/categorias/${c.id}`, { method: 'PUT', body: JSON.stringify({ activo: !c.activo }) });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Categorías</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nueva categoría (ej. Calzado)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {categorias.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: c.activo ? 1 : 0.5,
            }}
          >
            {editandoId === c.id ? (
              <>
                <input
                  value={editandoNombre}
                  onChange={(e) => setEditandoNombre(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => guardarEdicion(c.id)}>
                  Guardar
                </button>
                <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14 }}>{c.nombre}</span>
                <button
                  className="btn-secondary btn"
                  onClick={() => {
                    setEditandoId(c.id);
                    setEditandoNombre(c.nombre);
                  }}
                >
                  Editar
                </button>
                <button className="btn-secondary btn" onClick={() => toggleActivo(c)}>
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </div>
        ))}
        {categorias.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin categorías todavía.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modelos (dependen de una marca)
// ---------------------------------------------------------------------------

function ModelosCard() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaId, setMarcaId] = useState('');
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    api<Marca[]>('/catalogos/marcas').then((data) => {
      setMarcas(data);
      if (data[0]) setMarcaId(String(data[0].id));
    });
  }, []);

  async function cargarModelos() {
    if (!marcaId) return;
    setModelos(await api<Modelo[]>(`/catalogos/modelos?marcaId=${marcaId}&todas=1`));
  }

  useEffect(() => {
    cargarModelos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaId]);

  async function crear() {
    if (!nombre.trim() || !marcaId) return;
    try {
      await api('/catalogos/modelos', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim(), marcaId: Number(marcaId) }),
      });
      setNombre('');
      cargarModelos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el modelo.');
    }
  }

  async function toggleActivo(m: Modelo) {
    try {
      await api(`/catalogos/modelos/${m.id}`, { method: 'PUT', body: JSON.stringify({ activo: !m.activo }) });
      cargarModelos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Modelos</h2>

      <label style={{ fontSize: 13 }}>Marca</label>
      <div style={{ marginBottom: 10 }}>
        <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nuevo modelo (ej. Air Max)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear} disabled={!marcaId}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {modelos.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: m.activo ? 1 : 0.5,
            }}
          >
            <span style={{ flex: 1, fontSize: 14 }}>{m.nombre}</span>
            <button className="btn-secondary btn" onClick={() => toggleActivo(m)}>
              {m.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ))}
        {modelos.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin modelos para esta marca.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tallas (agrupadas por tipo: calzado, ropa, etc.)
// ---------------------------------------------------------------------------

function TallasCard() {
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState('calzado');
  const [orden, setOrden] = useState('0');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoValor, setEditandoValor] = useState('');
  const [editandoOrden, setEditandoOrden] = useState('0');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setTallas(await api<Talla[]>('/catalogos/tallas'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!valor.trim() || !tipo.trim()) return;
    try {
      await api('/catalogos/tallas', {
        method: 'POST',
        body: JSON.stringify({ valor: valor.trim(), tipo: tipo.trim(), orden: Number(orden) || 0 }),
      });
      setValor('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la talla.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/tallas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ valor: editandoValor, orden: Number(editandoOrden) || 0 }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la talla.');
    }
  }

  const tiposExistentes = Array.from(new Set(tallas.map((t) => t.tipo)));
  const grupos = tiposExistentes.length > 0 ? tiposExistentes : [tipo];

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Tallas</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Valor (ej. 9.5)"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          style={{ maxWidth: 100 }}
        />
        <input
          placeholder="Tipo (ej. calzado)"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <input
          type="number"
          placeholder="Orden"
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          style={{ maxWidth: 80 }}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      {grupos.map((g) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4 }}>
            {g}
          </div>
          {tallas
            .filter((t) => t.tipo === g)
            .map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {editandoId === t.id ? (
                  <>
                    <input
                      value={editandoValor}
                      onChange={(e) => setEditandoValor(e.target.value)}
                      style={{ maxWidth: 100 }}
                    />
                    <input
                      type="number"
                      value={editandoOrden}
                      onChange={(e) => setEditandoOrden(e.target.value)}
                      style={{ maxWidth: 80 }}
                    />
                    <button className="btn" onClick={() => guardarEdicion(t.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14 }}>{t.valor}</span>
                    <button
                      className="btn-secondary btn"
                      onClick={() => {
                        setEditandoId(t.id);
                        setEditandoValor(t.valor);
                        setEditandoOrden(String(t.orden));
                      }}
                    >
                      Editar
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      ))}
      {tallas.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin tallas todavía.</p>}
    </div>
  );
}
