'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useCarrito } from '@/lib/carrito';
import { useAuthCliente } from '@/lib/authCliente';
import { Stepper, claseBotonPrimario } from '@/components/tienda/ui';

export default function CarritoPage() {
  const { items, actualizarCantidad, quitar, total } = useCarrito();
  const { cliente, cargando } = useAuthCliente();
  const router = useRouter();

  function irACheckout() {
    if (!cliente) {
      router.push('/tienda/login?siguiente=/tienda/checkout');
      return;
    }
    router.push('/tienda/checkout');
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-extrabold uppercase tracking-tight">Tu bolsa está vacía</h1>
        <p className="mt-2 text-sm text-muted-foreground">Explora el catálogo y encuentra tu próximo par.</p>
        <Link href="/tienda" className={`${claseBotonPrimario} mt-6 inline-flex`}>
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-32 md:pb-0">
      <h1 className="mb-6 text-2xl font-extrabold uppercase tracking-tight">Bolsa ({items.length})</h1>

      <div className="divide-y divide-border">
        {items.map((i) => (
          <div key={i.varianteId} className="flex gap-4 py-5">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary sm:h-28 sm:w-28">
              {i.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.imagenUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold leading-tight">{i.nombre}</p>
                  {(i.talla || i.color) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{[i.talla, i.color].filter(Boolean).join(' / ')}</p>
                  )}
                </div>
                <p className="whitespace-nowrap text-sm font-bold">${(i.precioVenta * i.cantidad).toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between">
                <Stepper cantidad={i.cantidad} max={i.stockDisponible} onChange={(n) => actualizarCantidad(i.varianteId, n)} />
                <button
                  onClick={() => quitar(i.varianteId)}
                  className="p-2 text-muted-foreground hover:text-destructive"
                  aria-label="Quitar del carrito"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resumen en escritorio, en el flujo normal */}
      <div className="mt-6 hidden items-center justify-end gap-6 md:flex">
        <p className="text-lg font-bold">Total: ${total.toFixed(2)}</p>
        <button className={claseBotonPrimario} disabled={cargando} onClick={irACheckout}>
          Continuar con el pedido
        </button>
      </div>

      {/* Barra fija en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-4 md:hidden">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="text-base font-bold">${total.toFixed(2)}</span>
        </div>
        <button className={`${claseBotonPrimario} w-full`} disabled={cargando} onClick={irACheckout}>
          Continuar con el pedido
        </button>
      </div>
    </div>
  );
}
