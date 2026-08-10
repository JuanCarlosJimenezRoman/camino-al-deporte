'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';

interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
  activo: boolean;
  paraVentasOnline: boolean;
}

export default function MetodosPagoPage() {
  const { usuario } = useAuth();

  if (!puedeVer('cuentasTransferencia', usuario?.rol)) {
    return (
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Métodos de pago</h1>
        <p style={{ color: 'var(--color-muted)' }}>No tienes permiso para ver esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Métodos de pago</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14 }}>
        Administra las cuentas propias donde se reciben pagos por transferencia.
      </p>

      <CuentasTransferenciaCard />
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
    <div className="card">
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
