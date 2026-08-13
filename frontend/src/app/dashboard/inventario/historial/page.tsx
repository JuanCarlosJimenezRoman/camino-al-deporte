'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';

interface Sucursal {
  id: number;
  nombre: string;
}

interface Proveedor {
  id: number;
  nombre: string;
}

type TipoMovimiento =
  | 'ENTRADA'
  | 'SALIDA'
  | 'AJUSTE'
  | 'VENTA'
  | 'DEVOLUCION'
  | 'TRANSFERENCIA_SALIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'APARTADO'
  | 'PEDIDO_ONLINE';

interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string | null;
  createdAt: string;
  usuario: { nombre: string; email: string } | null;
  sucursal: { nombre: string };
  proveedor: { nombre: string } | null;
  variante: {
    sku: string;
    color: string | null;
    talla: { valor: string } | null;
    producto: { nombre: string };
  };
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
  APARTADO: 'Apartado',
  PEDIDO_ONLINE: 'Pedido en línea',
};

export default function HistorialInventarioPage() {
  const { usuario } = useAuth();
  const puedeVerHistorial = puedeVer('inventarioHistorial', usuario?.rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [tipo, setTipo] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<Sucursal[]>('/sucursales').then(setSucursales);
    api<Proveedor[]>('/proveedores').then(setProveedores).catch(() => {});
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (sucursalId) qs.set('sucursalId', sucursalId);
      if (tipo) qs.set('tipo', tipo);
      if (proveedorId) qs.set('proveedorId', proveedorId);
      if (fechaInicio) qs.set('fechaInicio', fechaInicio);
      if (fechaFin) qs.set('fechaFin', fechaFin);
      if (busqueda) qs.set('skuOProducto', busqueda);
      const data = await api<Movimiento[]>(`/inventario/movimientos?${qs.toString()}`);
      setMovimientos(data);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (puedeVerHistorial) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerHistorial]);

  if (!puedeVerHistorial) {
    return <p style={{ fontSize: 14 }}>No tienes permiso para ver esta sección.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Historial de inventario</h1>
        <Link href="/dashboard/inventario" className="btn-secondary btn">
          Volver a inventario
        </Link>
      </div>

      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        Registro completo de todas las entradas, salidas y ajustes de stock, con fecha y quién los hizo.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 190 }}>
          <option value="">Todos los tipos</option>
          {(Object.keys(TIPO_LABEL) as TipoMovimiento[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={{ maxWidth: 190 }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input
          placeholder="Buscar por SKU o producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && cargar()}
          style={{ maxWidth: 220 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>Desde:</label>
        <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ maxWidth: 160 }} />
        <label style={{ fontSize: 13 }}>Hasta:</label>
        <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ maxWidth: 160 }} />
        <button className="btn" onClick={cargar}>
          Filtrar
        </button>
      </div>

      {cargando && <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>}

      {!cargando && (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Sucursal</th>
              <th>Proveedor</th>
              <th>Motivo</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.createdAt).toLocaleString('es-MX')}</td>
                <td>{TIPO_LABEL[m.tipo] || m.tipo}</td>
                <td>
                  {m.variante?.producto?.nombre}
                  {m.variante?.talla ? ` (${m.variante.talla.valor})` : ''} — {m.variante?.sku}
                </td>
                <td style={{ color: m.cantidad < 0 ? 'var(--color-danger, #b91c1c)' : undefined }}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td>{m.sucursal?.nombre}</td>
                <td>{m.proveedor?.nombre || '—'}</td>
                <td>{m.motivo || '—'}</td>
                <td>{m.usuario?.nombre || '—'}</td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--color-muted)' }}>
                  Sin movimientos en el periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
