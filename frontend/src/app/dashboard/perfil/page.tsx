'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ROL_LABEL: Record<string, string> = {
  ADMIN_PRINCIPAL: 'Administrador Principal',
  DESARROLLO: 'Desarrollo',
  INVENTARIO: 'Inventario',
  VENTAS: 'Ventas',
  CONSULTA: 'Consulta',
};

export default function PerfilPage() {
  const { usuario, actualizarUsuario } = useAuth();

  const [nombre, setNombre] = useState(usuario?.nombre || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [mensajeDatos, setMensajeDatos] = useState<string | null>(null);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [mensajePassword, setMensajePassword] = useState<string | null>(null);

  if (!usuario) return null;

  async function guardarDatos() {
    setMensajeDatos(null);
    if (!nombre.trim()) {
      setMensajeDatos('El nombre no puede estar vacío.');
      return;
    }
    setGuardandoDatos(true);
    try {
      await api('/auth/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nombre, email }),
      });
      actualizarUsuario({ nombre, email });
      setMensajeDatos('Datos actualizados.');
    } catch (err) {
      setMensajeDatos(err instanceof ApiError ? err.message : 'Error al actualizar los datos.');
    } finally {
      setGuardandoDatos(false);
    }
  }

  async function cambiarPassword() {
    setMensajePassword(null);
    if (passwordNueva.length < 8) {
      setMensajePassword('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setMensajePassword('Las contraseñas nuevas no coinciden.');
      return;
    }
    setGuardandoPassword(true);
    try {
      await api('/auth/perfil/password', {
        method: 'PUT',
        body: JSON.stringify({ passwordActual, passwordNueva }),
      });
      setMensajePassword('Contraseña actualizada.');
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordConfirmar('');
    } catch (err) {
      setMensajePassword(err instanceof ApiError ? err.message : 'Error al cambiar la contraseña.');
    } finally {
      setGuardandoPassword(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Mi perfil</h1>

      <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Mis datos</h2>

        <label style={{ fontSize: 13 }}>Nombre</label>
        <div style={{ marginBottom: 10 }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Email</label>
        <div style={{ marginBottom: 10 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <label style={{ fontSize: 13 }}>Rol</label>
        <div style={{ marginBottom: 12 }}>
          <input value={ROL_LABEL[usuario.rol] || usuario.rol} disabled />
        </div>

        {mensajeDatos && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensajeDatos}</p>}

        <button className="btn" onClick={guardarDatos} disabled={guardandoDatos}>
          Guardar datos
        </button>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Cambiar contraseña</h2>

        <label style={{ fontSize: 13 }}>Contraseña actual</label>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
          />
        </div>

        <label style={{ fontSize: 13 }}>Contraseña nueva</label>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
          />
        </div>

        <label style={{ fontSize: 13 }}>Confirmar contraseña nueva</label>
        <div style={{ marginBottom: 12 }}>
          <input
            type="password"
            value={passwordConfirmar}
            onChange={(e) => setPasswordConfirmar(e.target.value)}
          />
        </div>

        {mensajePassword && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensajePassword}</p>}

        <button className="btn" onClick={cambiarPassword} disabled={guardandoPassword}>
          Cambiar contraseña
        </button>
      </div>
    </div>
  );
}
