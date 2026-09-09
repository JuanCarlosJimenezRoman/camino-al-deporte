'use client';

import { ROLES, ROL_LABEL } from '../constants';
import type { EdicionUsuario, Sucursal, Usuario } from '../types';

interface Props {
  usuarios: Usuario[];
  sucursales: Sucursal[];
  yoId: number | undefined;
  editandoId: number | null;
  edicion: EdicionUsuario;
  onEdicionChange: (patch: Partial<EdicionUsuario>) => void;
  onAbrirEdicion: (u: Usuario) => void;
  onCancelarEdicion: () => void;
  onGuardarEdicion: (id: number) => void;
  onToggleActivo: (u: Usuario) => void;
  onRestablecerPassword: (u: Usuario) => void;
}

export function UsuariosTable({
  usuarios,
  sucursales,
  yoId,
  editandoId,
  edicion,
  onEdicionChange,
  onAbrirEdicion,
  onCancelarEdicion,
  onGuardarEdicion,
  onToggleActivo,
  onRestablecerPassword,
}: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Sucursal</th>
          <th>Activo</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {usuarios.map((u) => (
          <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.5 }}>
            <td>
              {editandoId === u.id ? (
                <input value={edicion.nombre} onChange={(e) => onEdicionChange({ nombre: e.target.value })} />
              ) : (
                u.nombre
              )}
            </td>
            <td>
              {editandoId === u.id ? (
                <input
                  type="email"
                  value={edicion.email}
                  onChange={(e) => onEdicionChange({ email: e.target.value })}
                />
              ) : (
                u.email
              )}
            </td>
            <td>
              {editandoId === u.id ? (
                <select value={edicion.rol} onChange={(e) => onEdicionChange({ rol: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROL_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                ROL_LABEL[u.rol] || u.rol
              )}
            </td>
            <td>
              {editandoId === u.id ? (
                <select
                  value={edicion.sucursalId}
                  onChange={(e) => onEdicionChange({ sucursalId: e.target.value })}
                >
                  <option value="">Sin asignar</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                u.sucursal || '—'
              )}
            </td>
            <td>{u.activo ? 'Sí' : 'No'}</td>
            <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {editandoId === u.id ? (
                <>
                  <button className="btn" onClick={() => onGuardarEdicion(u.id)}>
                    Guardar
                  </button>
                  <button className="btn-secondary btn" onClick={onCancelarEdicion}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary btn" onClick={() => onAbrirEdicion(u)}>
                    Editar acceso
                  </button>
                  <button className="btn-secondary btn" onClick={() => onRestablecerPassword(u)}>
                    Restablecer contraseña
                  </button>
                  <button
                    className="btn-secondary btn"
                    onClick={() => onToggleActivo(u)}
                    disabled={u.id === yoId}
                  >
                    {u.activo ? 'Quitar acceso' : 'Reactivar'}
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
