'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { apiTienda, ApiError } from '@/lib/apiTienda';

interface Pedido {
  id: number;
  folio: string;
  estado: string;
  total: string;
  createdAt: string;
  items: { id: number; cantidad: number; variante: { producto: { nombre: string } } }[];
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'En revisión',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

export default function MisPedidosPage() {
  const { cliente, cargando } = useAuthCliente();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/pedidos');
      return;
    }
    apiTienda<Pedido[]>('/tienda/pedidos')
      .then(setPedidos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus pedidos.'));
  }, [cargando, cliente, router]);

  if (cargando || !cliente) return null;
  if (error) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Mis pedidos</h1>

      {pedidos === null && <p style={{ color: 'var(--color-muted)' }}>Cargando...</p>}
      {pedidos && pedidos.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>
          Todavía no tienes pedidos.{' '}
          <Link href="/tienda" style={{ color: 'var(--color-primary-dark)' }}>
            Ver catálogo
          </Link>
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Artículos</th>
            <th>Total</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pedidos?.map((p) => (
            <tr key={p.id}>
              <td>{p.folio}</td>
              <td>{new Date(p.createdAt).toLocaleDateString('es-MX')}</td>
              <td>{p.items.length} artículo(s)</td>
              <td>${p.total}</td>
              <td>{ESTADO_LABEL[p.estado] || p.estado}</td>
              <td>
                <Link href={`/tienda/pedidos/${p.id}`} className="btn-secondary btn">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
