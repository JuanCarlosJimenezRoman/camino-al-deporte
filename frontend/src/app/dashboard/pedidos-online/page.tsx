'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

interface Pedido {
  id: number;
  folio: string;
  estado: string;
  total: string;
  createdAt: string;
  cliente: { nombre: string; telefono: string };
  items: { id: number }[];
}

const ESTADOS = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'PENDIENTE_PAGO', etiqueta: 'Pendiente de pago' },
  { valor: 'EN_VALIDACION', etiqueta: 'En validación' },
  { valor: 'PAGADO', etiqueta: 'Pagado' },
  { valor: 'ENVIADO', etiqueta: 'Enviado' },
  { valor: 'RECIBIDO', etiqueta: 'Recibido' },
  { valor: 'CANCELADO', etiqueta: 'Cancelado' },
] as const;

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'En validación',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

export default function PedidosOnlinePage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
      setPedidos(await api<Pedido[]>(`/pedidos-online${qs}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pedidos.');
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Pedidos en línea</h1>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 200 }}>
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Artículos</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>{p.folio}</td>
              <td>
                {p.cliente?.nombre}
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.cliente?.telefono}</div>
              </td>
              <td>{p.items.length}</td>
              <td>${p.total}</td>
              <td>{ESTADO_LABEL[p.estado] || p.estado}</td>
              <td>{new Date(p.createdAt).toLocaleString('es-MX')}</td>
              <td>
                <Link href={`/dashboard/pedidos-online/${p.id}`} className="btn-secondary btn">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {pedidos.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--color-muted)' }}>
                Sin pedidos en línea todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
