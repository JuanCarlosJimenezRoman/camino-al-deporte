'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  sucursalId: number | null;
  sucursal: string | null;
}

interface Sucursal {
  id: number;
  nombre: string;
}

const ROLES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA'];

const ROL_LABEL: Record<string, string> = {
  ADMIN_PRINCIPAL: 'Administrador Principal',
  DESARROLLO: 'Desarrollo',
  INVENTARIO: 'Inventario',
  VENTAS: 'Ventas',
  CONSULTA: 'Consulta',
};

interface EdicionUsuario {
  rol: string;
  sucursalId: string;
}

export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('CONSULTA');
  const [sucursalId, setSucursalId] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<EdicionUsuario>({ rol: 'CONSULTA', sucursalId: '' });

  async function cargar() {
    const [u, s] = await Promise.all([api<Usuario[]>('/usuarios'), api<Sucursal[]>('/sucursales')]);
    setUsuarios(u);
    setSucursales(s);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    try {
      await api('/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          email,
          password,
          rol,
          sucursalId: sucursalId ? Number(sucursalId) : undefined,
        }),
      });
      setMensaje('Usuario creado.');
      setNombre('');
      setEmail('');
      setPassword('');
      setSucursalId('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear usuario.');
    }
  }

  function abrirEdicion(u: Usuario) {
    setEditandoId(u.id);
    setEdicion({ rol: u.rol, sucursalId: u.sucursalId ? String(u.sucursalId) : '' });
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          rol: edicion.rol,
          sucursalId: edicion.sucursalId ? Number(edicion.sucursalId) : null,
        }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar el usuario.');
    }
  }

  async function toggleActivo(u: Usuario) {
    if (u.id === yo?.id) {
      setMensaje('No puedes desactivar tu propia cuenta.');
      return;
    }
    const accion = u.activo ? 'quitarle el acceso a' : 'reactivar a';
    if (!window.confirm(`¿Seguro que quieres ${accion} ${u.nombre}?`)) return;
    try {
      await api(`/usuarios/${u.id}`, { method: 'PUT', body: JSON.stringify({ activo: !u.activo }) });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  async function restablecerPassword(u: Usuario) {
    const nueva = window.prompt(`Nueva contraseña temporal para ${u.nombre} (mínimo 8 caracteres):`);
    if (!nueva) return;
    if (nueva.length < 8) {
      setMensaje('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    try {
      await api(`/usuarios/${u.id}`, { method: 'PUT', body: JSON.stringify({ password: nueva }) });
      setMensaje(`Contraseña restablecida para ${u.nombre}.`);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al restablecer la contraseña.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Usuarios</h1>

      <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nuevo usuario</h2>

        <label style={{ fontSize: 13 }}>Nombre</label>
        <div style={{ marginBottom: 10 }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Email</label>
        <div style={{ marginBottom: 10 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Contraseña temporal</label>
        <div style={{ marginBottom: 10 }}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Rol</label>
        <div style={{ marginBottom: 10 }}>
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <label style={{ fontSize: 13 }}>Sucursal (opcional — vacío = ve todas)</label>
        <div style={{ marginBottom: 12 }}>
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Sin asignar</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

        <button className="btn" onClick={crear}>
          Crear usuario
        </button>
      </div>

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
              <td>{u.nombre}</td>
              <td>{u.email}</td>
              <td>
                {editandoId === u.id ? (
                  <select value={edicion.rol} onChange={(e) => setEdicion({ ...edicion, rol: e.target.value })}>
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
                    onChange={(e) => setEdicion({ ...edicion, sucursalId: e.target.value })}
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
                    <button className="btn" onClick={() => guardarEdicion(u.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary btn" onClick={() => abrirEdicion(u)}>
                      Editar acceso
                    </button>
                    <button className="btn-secondary btn" onClick={() => restablecerPassword(u)}>
                      Restablecer contraseña
                    </button>
                    <button
                      className="btn-secondary btn"
                      onClick={() => toggleActivo(u)}
                      disabled={u.id === yo?.id}
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
    </div>
  );
}
