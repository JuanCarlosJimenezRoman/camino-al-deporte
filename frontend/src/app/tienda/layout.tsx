'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { AuthClienteProvider, useAuthCliente } from '@/lib/authCliente';
import { CarritoProvider, useCarrito } from '@/lib/carrito';

function Header() {
  const { cliente, cargando, logout } = useAuthCliente();
  const { totalItems } = useCarrito();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Link href="/tienda" style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
        Camino al Deporte
      </Link>

      <nav style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 14 }}>
        <Link href="/tienda" style={{ textDecoration: 'none' }}>
          Catálogo
        </Link>
        <Link href="/tienda/carrito" style={{ textDecoration: 'none' }}>
          Carrito{totalItems > 0 ? ` (${totalItems})` : ''}
        </Link>

        {cargando ? null : cliente ? (
          <>
            <Link href="/tienda/pedidos" style={{ textDecoration: 'none' }}>
              Mis pedidos
            </Link>
            <span style={{ color: 'var(--color-muted)' }}>{cliente.nombre}</span>
            <button className="btn-secondary btn" onClick={logout}>
              Salir
            </button>
          </>
        ) : (
          <Link href="/tienda/login" className="btn-secondary btn">
            Iniciar sesión
          </Link>
        )}
      </nav>
    </header>
  );
}

export default function TiendaLayout({ children }: { children: ReactNode }) {
  return (
    <AuthClienteProvider>
      <CarritoProvider>
        <div style={{ minHeight: '100vh' }}>
          <Header />
          <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
        </div>
      </CarritoProvider>
    </AuthClienteProvider>
  );
}
