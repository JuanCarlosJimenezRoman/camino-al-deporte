'use client';

import { useState } from 'react';
import { ROLES, ROL_LABEL } from '../constants';
import type { NuevoUsuarioInput, Sucursal } from '../types';

interface Props {
  sucursales: Sucursal[];
  mensaje: string | null;
  onCrear: (data: NuevoUsuarioInput) => Promise<boolean> | boolean;
}

export function NuevoUsuarioForm({ sucursales, mensaje, onCrear }: Props) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('CONSULTA');
  const [sucursalId, setSucursalId] = useState('');

  async function handleCrear() {
    const ok = await onCrear({
      nombre,
      email,
      password,
      rol,
      sucursalId: sucursalId ? Number(sucursalId) : undefined,
    });
    if (ok) {
      setNombre('');
      setEmail('');
      setPassword('');
      setSucursalId('');
    }
  }

  return (
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

      <button className="btn" onClick={handleCrear}>
        Crear usuario
      </button>
    </div>
  );
}
