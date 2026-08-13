'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Sucursal {
  id: number;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  // WhatsApp propio de la sucursal, usado como remitente del ticket digital
  // de compra. Si una sucursal no tiene uno capturado, el ticket cae al
  // WhatsApp general de la tienda (ver /dashboard/metodos-pago).
  telefono: string | null;
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
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Edición del WhatsApp de la sucursal seleccionada (independiente del
  // formulario de "nueva sucursal" de arriba).
  const [telefonoEdicion, setTelefonoEdicion] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [mensajeTelefono, setMensajeTelefono] = useState<string | null>(null);

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

  // Al cambiar de sucursal seleccionada, refleja su WhatsApp actual en el
  // campo de edición.
  useEffect(() => {
    const s = sucursales.find((s) => s.id === seleccionada);
    setTelefonoEdicion(s?.telefono || '');
    setMensajeTelefono(null);
  }, [seleccionada, sucursales]);

  async function crearSucursal() {
    try {
      await api('/sucursales', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          codigo: codigo || undefined,
          direccion: direccion || undefined,
          telefono: telefono || undefined,
        }),
      });
      setMensaje('Sucursal creada.');
      setNombre('');
      setCodigo('');
      setDireccion('');
      setTelefono('');
      cargarSucursales();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la sucursal.');
    }
  }

  // Guarda el WhatsApp de la sucursal seleccionada. Se deja aparte del
  // formulario de "nueva sucursal" porque lo normal es venir aquí a cambiarlo
  // más adelante (ej. cuando cada sucursal tenga su propio número), no solo
  // al crearla.
  async function guardarTelefono() {
    if (!seleccionada) return;
    setGuardandoTelefono(true);
    setMensajeTelefono(null);
    try {
      await api(`/sucursales/${seleccionada}`, {
        method: 'PUT',
        body: JSON.stringify({ telefono: telefonoEdicion || null }),
      });
      setMensajeTelefono('WhatsApp de la sucursal actualizado.');
      cargarSucursales();
    } catch (err) {
      setMensajeTelefono(err instanceof ApiError ? err.message : 'Error al actualizar el WhatsApp.');
    } finally {
      setGuardandoTelefono(false);
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

      {esAdmin && seleccionada && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>WhatsApp de esta sucursal</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
            Número desde el que se manda el ticket digital de compra a los clientes de esta sucursal. Déjalo vacío
            para seguir usando el WhatsApp general de la tienda.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={telefonoEdicion}
              onChange={(e) => setTelefonoEdicion(e.target.value)}
              placeholder="10 dígitos, ej. 5512345678"
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={guardarTelefono} disabled={guardandoTelefono}>
              {guardandoTelefono ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {mensajeTelefono && <p style={{ fontSize: 13, marginTop: 8 }}>{mensajeTelefono}</p>}
        </div>
      )}

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
