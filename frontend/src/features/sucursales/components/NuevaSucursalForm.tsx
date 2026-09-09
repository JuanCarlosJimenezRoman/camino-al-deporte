'use client';

import { useState } from 'react';
import type { NuevaSucursalInput } from '../types';

interface Props {
  mensaje: string | null;
  onCrear: (data: NuevaSucursalInput) => Promise<boolean> | boolean;
}

export function NuevaSucursalForm({ mensaje, onCrear }: Props) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');

  async function handleCrear() {
    const ok = await onCrear({
      nombre,
      codigo: codigo || undefined,
      direccion: direccion || undefined,
      telefono: telefono || undefined,
    });
    if (ok) {
      setNombre('');
      setCodigo('');
      setDireccion('');
      setTelefono('');
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nueva sucursal</h2>

      <label style={{ fontSize: 13 }}>Nombre</label>
      <div style={{ marginBottom: 10 }}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sucursal Centro" />
      </div>

      <label style={{ fontSize: 13 }}>Código (opcional)</label>
      <div style={{ marginBottom: 10 }}>
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="CENTRO" />
      </div>

      <label style={{ fontSize: 13 }}>Dirección (opcional)</label>
      <div style={{ marginBottom: 10 }}>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </div>

      <label style={{ fontSize: 13 }}>WhatsApp de la sucursal (opcional)</label>
      <div style={{ marginBottom: 12 }}>
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="10 dígitos, ej. 5512345678"
        />
        <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
          Se usa para mandar el ticket digital de compra al cliente. Si se deja vacío, se usa el WhatsApp
          general de la tienda.
        </p>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <button className="btn" onClick={handleCrear} disabled={!nombre}>
        Crear sucursal
      </button>
    </div>
  );
}
