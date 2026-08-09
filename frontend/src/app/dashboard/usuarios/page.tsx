'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
}

const ROLES = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA'];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('CONSULTA');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setUsuarios(await api<Usuario[]>('/usuarios'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    try {
      await api('/usuarios', {
        method: 'POST',
        body: JSON.stringify({ nombre, email, password, rol }),
      });
      setMensaje('Usuario creado.');
      setNombre('');
      setEmail('');
      setPassword('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear usuario.');
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
        <div style={{ marginBottom: 12 }}>
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
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
            <th>Activo</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td>
              <td>{u.email}</td>
              <td>{u.rol}</td>
              <td>{u.activo ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
