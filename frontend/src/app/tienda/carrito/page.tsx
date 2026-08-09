'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCarrito } from '@/lib/carrito';
import { useAuthCliente } from '@/lib/authCliente';

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
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Carrito</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          Tu carrito está vacío.{' '}
          <Link href="/tienda" style={{ color: 'var(--color-primary-dark)' }}>
            Ver catálogo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Carrito</h1>

      <table style={{ marginBottom: 20 }}>
        <thead>
          <tr>
            <th></th>
            <th>Producto</th>
            <th>Precio</th>
            <th>Cantidad</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.varianteId}>
              <td>
                <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--color-border)', overflow: 'hidden' }}>
                  {i.imagenUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imagenUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              </td>
              <td>
                {i.nombre}
                {i.talla || i.color ? ` (${[i.talla, i.color].filter(Boolean).join(' / ')})` : ''}
              </td>
              <td>${i.precioVenta.toFixed(2)}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={i.stockDisponible}
                  value={i.cantidad}
                  onChange={(e) => actualizarCantidad(i.varianteId, Number(e.target.value))}
                  style={{ width: 70 }}
                />
              </td>
              <td>${(i.precioVenta * i.cantidad).toFixed(2)}</td>
              <td>
                <button className="btn-secondary btn" onClick={() => quitar(i.varianteId)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Total: ${total.toFixed(2)}</div>
        <button className="btn" disabled={cargando} onClick={irACheckout}>
          Continuar con el pedido
        </button>
      </div>
    </div>
  );
}
