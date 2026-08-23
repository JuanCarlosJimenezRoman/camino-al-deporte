'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useAuthCliente } from '@/lib/authCliente';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { formatearFecha } from '@/lib/utils';
import { claseBotonPrimario, Estrellas } from '@/components/store/ui';

interface Pedido {
  id: number;
  folio: string;
  estado: string;
  total: string;
  createdAt: string;
  items: { id: number; cantidad: number; variante: { producto: { nombre: string } } }[];
  resena: { calificacionProducto: number; calificacionEnvio: number } | null;
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  EN_VALIDACION: 'En revisión',
  PAGADO: 'Pagado',
  ENVIADO: 'Enviado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

const ESTADO_ESTILO: Record<string, string> = {
  PENDIENTE_PAGO: 'bg-warning/15 text-warning',
  EN_VALIDACION: 'bg-warning/15 text-warning',
  PAGADO: 'bg-success/15 text-success',
  ENVIADO: 'bg-primary/15 text-primary',
  RECIBIDO: 'bg-success/15 text-success',
  CANCELADO: 'bg-destructive/15 text-destructive',
};

const ESTADOS_FINALES = new Set(['RECIBIDO', 'CANCELADO']);
const INTERVALO_ACTUALIZACION_MS = 15000;

export default function MisPedidosPage() {
  const { cliente, cargando } = useAuthCliente();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pedidosRef = useRef<Pedido[] | null>(null);

  function cargar() {
    return apiTienda<Pedido[]>('/tienda/pedidos')
      .then(setPedidos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus pedidos.'));
  }

  useEffect(() => {
    pedidosRef.current = pedidos;
  }, [pedidos]);

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/pedidos');
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, cliente, router]);

  // Actualiza los estados (badges) en automático mientras haya al menos un
  // pedido que todavía pueda cambiar, sin que el cliente recargue la página.
  useEffect(() => {
    if (cargando || !cliente) return;
    const intervalo = setInterval(() => {
      if (document.hidden) return;
      const lista = pedidosRef.current;
      const hayPendientes = lista === null || lista.some((p) => !ESTADOS_FINALES.has(p.estado));
      if (hayPendientes) apiTienda<Pedido[]>('/tienda/pedidos').then(setPedidos).catch(() => {});
    }, INTERVALO_ACTUALIZACION_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, cliente]);

  if (cargando || !cliente) return null;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold uppercase tracking-tight">Mis pedidos</h1>

      {pedidos === null && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {pedidos && pedidos.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Todavía no tienes pedidos.</p>
          <Link href="/tienda" className={`${claseBotonPrimario} mt-6 inline-flex`}>
            Ver catálogo
          </Link>
        </div>
      )}

      <div className="divide-y divide-border">
        {pedidos?.map((p) => (
          <Link key={p.id} href={`/tienda/pedidos/${p.id}`} className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{p.folio}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    ESTADO_ESTILO[p.estado] || 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {ESTADO_LABEL[p.estado] || p.estado}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatearFecha(p.createdAt)} · {p.items.length} artículo(s)
              </p>
              {p.estado === 'RECIBIDO' && (
                <div className="mt-1.5">
                  {p.resena ? (
                    <div className="flex items-center gap-1.5">
                      <Estrellas valor={p.resena.calificacionProducto} tamano="h-3.5 w-3.5" />
                      <span className="text-xs text-muted-foreground">Calificado</span>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-primary underline underline-offset-4">Calificar pedido</span>
                  )}
                </div>
              )}
            </div>
            <p className="whitespace-nowrap text-sm font-bold">${p.total}</p>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
