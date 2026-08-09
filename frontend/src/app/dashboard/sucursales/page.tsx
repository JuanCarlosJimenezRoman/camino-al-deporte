'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Sucursal {
  id: number;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  esBodegaCentral: boolean;
}

interface ExistenciaDetalle {
  id: number;
  stockActual: number;
  stockMinimo: number;
  variante: {
    sku: string;
    talla: { valor: string } | null;
    producto: { nombre: string; marca: { nombre: string }; categoria: { nombre: string } };
  };
}

export default function SucursalesPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [existencias, setExistencias] = useState<ExistenciaDetalle[]>([]);

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargarSucursales() {
    const data = await api<Sucursal[]>('/sucursales');
    setSucursales(data);
    if (!seleccionada && data.length > 0) setSeleccionada(data[0].id);
  }

  useEffect(() => {
    cargarSucursales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seleccionada) return;
    api<{ existencias: ExistenciaDetalle[] }>(`/sucursales/${seleccionada}`).then((data) =>
      setExistencias(data.existencias)
    );
  }, [seleccionada]);

  async function crearSucursal() {
    try {
      await api('/sucursales', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          codigo: codigo || undefined,
          direccion: direccion || undefined,
        }),
      });
      setMensaje('Sucursal creada.');
      setNombre('');
      setCodigo('');
      setDireccion('');
      cargarSucursales();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la sucursal.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Sucursales</h1>

      {esAdmin && (
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
          <div style={{ marginBottom: 12 }}>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>

          {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

          <button className="btn" onClick={crearSucursal} disabled={!nombre}>
            Crear sucursal
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {sucursales.map((s) => (
          <button
            key={s.id}
            className={s.id === seleccionada ? 'btn' : 'btn-secondary btn'}
            onClick={() => setSeleccionada(s.id)}
          >
            {s.nombre}
            {s.esBodegaCentral ? ' ⭐' : ''}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Productos en esta sucursal</h2>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Marca</th>
            <th>Talla</th>
            <th>SKU</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {existencias.map((e) => (
            <tr key={e.id}>
              <td>{e.variante.producto.nombre}</td>
              <td>{e.variante.producto.marca.nombre}</td>
              <td>{e.variante.talla?.valor ?? '—'}</td>
              <td>{e.variante.sku}</td>
              <td className={e.stockActual <= e.stockMinimo ? 'stock-bajo' : ''}>{e.stockActual}</td>
            </tr>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas en esta sucursal.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
