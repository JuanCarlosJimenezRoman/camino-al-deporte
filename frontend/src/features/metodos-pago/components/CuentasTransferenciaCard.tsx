// Vista: bloque "Cuentas de transferencia" (CRUD + edición inline).

'use client';

import type { UseCuentasTransferenciaReturn } from '../usecuentastransferencia';

interface Props {
  cuentas: UseCuentasTransferenciaReturn;
}

export function CuentasTransferenciaCard({ cuentas }: Props) {
  const {
    cuentas: lista,
    cargando,
    mensaje,
    formNueva,
    setFormNueva,
    crear,
    creando,
    editandoId,
    editando,
    setEditando,
    abrirEdicion,
    cerrarEdicion,
    guardarEdicion,
    toggleActivo,
    toggleOnline,
  } = cuentas;

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 4 }}>Cuentas de transferencia</h2>
      <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 12 }}>
        Cuentas propias donde llegan los pagos por transferencia. Aparecen como opción al registrar una
        venta o un abono de apartado pagado por transferencia. Marca &quot;Tienda en línea&quot; en al menos una
        cuenta activa para que los clientes de la tienda puedan pagar por SPEI — sin eso, no se pueden
        crear pedidos en línea.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Etiqueta (ej. BBVA Tienda)"
          value={formNueva.nombre}
          onChange={(e) => setFormNueva({ ...formNueva, nombre: e.target.value })}
          style={{ maxWidth: 180 }}
        />
        <input
          placeholder="Banco"
          value={formNueva.banco ?? ''}
          onChange={(e) => setFormNueva({ ...formNueva, banco: e.target.value })}
          style={{ maxWidth: 140 }}
        />
        <input
          placeholder="Titular"
          value={formNueva.titular ?? ''}
          onChange={(e) => setFormNueva({ ...formNueva, titular: e.target.value })}
          style={{ maxWidth: 160 }}
        />
        <input
          placeholder="CLABE / número de cuenta"
          value={formNueva.numeroCuenta ?? ''}
          onChange={(e) => setFormNueva({ ...formNueva, numeroCuenta: e.target.value })}
          style={{ maxWidth: 200 }}
        />
        <button className="btn" onClick={crear} disabled={creando}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      {cargando ? (
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
      ) : (
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
            {lista.map((c) => (
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
                      <button className="btn" onClick={guardarEdicion}>
                        Guardar
                      </button>
                      <button className="btn-secondary btn" onClick={cerrarEdicion}>
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
                      <button className="btn-secondary btn" onClick={() => abrirEdicion(c)}>
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
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
                  Sin cuentas registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}