'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const ESTADO_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  SOLICITADA: 'warning',
  RECIBIDA: 'success',
  CANCELADA: 'destructive',
};

interface Sucursal {
  id: number;
  nombre: string;
}

interface Existencia {
  id: number;
  sucursalId: number;
  stockActual: number;
  variante: { id: number; sku: string; talla: { valor: string } | null; producto: { nombre: string } };
}

interface Transferencia {
  id: number;
  folio: string;
  cantidad: number;
  estado: string;
  createdAt: string;
  variante: { sku: string; producto: { nombre: string }; talla: { valor: string } | null };
  sucursalOrigen: { nombre: string };
  sucursalDestino: { nombre: string };
  solicitadoPor: { nombre: string };
}

export default function TransferenciasPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [existenciasOrigen, setExistenciasOrigen] = useState<Existencia[]>([]);

  const [sucursalOrigenId, setSucursalOrigenId] = useState('');
  const [sucursalDestinoId, setSucursalDestinoId] = useState('');
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [s, t] = await Promise.all([
      api<Sucursal[]>('/sucursales'),
      api<Transferencia[]>('/transferencias'),
    ]);
    setSucursales(s);
    setTransferencias(t);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (!sucursalOrigenId) {
      setExistenciasOrigen([]);
      return;
    }
    api<Existencia[]>(`/inventario/existencias?sucursalId=${sucursalOrigenId}`).then(setExistenciasOrigen);
  }, [sucursalOrigenId]);

  async function crearTransferencia() {
    if (!sucursalOrigenId || !sucursalDestinoId || !varianteId) return;
    try {
      await api('/transferencias', {
        method: 'POST',
        body: JSON.stringify({
          varianteId: Number(varianteId),
          cantidad,
          sucursalOrigenId: Number(sucursalOrigenId),
          sucursalDestinoId: Number(sucursalDestinoId),
        }),
      });
      setMensaje('Transferencia creada. El stock ya se descontó del origen.');
      setVarianteId('');
      setCantidad(1);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la transferencia.');
    }
  }

  async function recibir(id: number) {
    try {
      await api(`/transferencias/${id}/recibir`, { method: 'POST' });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al confirmar la recepción.');
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm('¿Cancelar esta transferencia? El stock regresa a la sucursal de origen.')) return;
    try {
      await api(`/transferencias/${id}/cancelar`, { method: 'POST' });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cancelar.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Transferencias entre sucursales</h1>

      <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nueva transferencia</h2>

        <label style={{ fontSize: 13 }}>Sucursal origen</label>
        <select
          value={sucursalOrigenId}
          onChange={(e) => {
            setSucursalOrigenId(e.target.value);
            setVarianteId('');
          }}
          style={{ marginBottom: 10 }}
        >
          <option value="">Selecciona...</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 13 }}>Sucursal destino</label>
        <select value={sucursalDestinoId} onChange={(e) => setSucursalDestinoId(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {sucursales
            .filter((s) => String(s.id) !== sucursalOrigenId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
        </select>

        <label style={{ fontSize: 13 }}>Producto / SKU (stock disponible en origen)</label>
        <select value={varianteId} onChange={(e) => setVarianteId(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {existenciasOrigen
            .filter((e) => e.stockActual > 0)
            .map((e) => (
              <option key={e.id} value={e.variante.id}>
                {e.variante.producto.nombre} {e.variante.talla ? `(${e.variante.talla.valor})` : ''} —{' '}
                {e.variante.sku} — disponible: {e.stockActual}
              </option>
            ))}
        </select>

        <label style={{ fontSize: 13 }}>Cantidad</label>
        <div style={{ marginBottom: 12 }}>
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
        </div>

        {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

        <button className="btn" onClick={crearTransferencia} disabled={!sucursalOrigenId || !sucursalDestinoId || !varianteId}>
          Enviar
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Origen → Destino</th>
            <th>Estado</th>
            <th>Solicitó</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {transferencias.map((t) => (
            <tr key={t.id}>
              <td>{t.folio}</td>
              <td>
                {t.variante.producto.nombre} {t.variante.talla ? `(${t.variante.talla.valor})` : ''}
              </td>
              <td>{t.cantidad}</td>
              <td>
                {t.sucursalOrigen.nombre} → {t.sucursalDestino.nombre}
              </td>
              <td>
                <Badge variant={ESTADO_VARIANT[t.estado] || 'secondary'}>{t.estado}</Badge>
              </td>
              <td>{t.solicitadoPor?.nombre}</td>
              <td style={{ display: 'flex', gap: 6 }}>
                {t.estado === 'SOLICITADA' && (
                  <>
                    <button className="btn" onClick={() => recibir(t.id)}>
                      Recibir
                    </button>
                    <button className="btn-secondary btn" onClick={() => cancelar(t.id)}>
                      Cancelar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {transferencias.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                Sin transferencias todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
