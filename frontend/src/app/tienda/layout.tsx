'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { Menu, X, ShoppingBag, User } from 'lucide-react';
import { AuthClienteProvider, useAuthCliente } from '@/lib/authCliente';
import { CarritoProvider, useCarrito } from '@/lib/carrito';
import { claseBotonPrimario, claseBotonSecundario } from '@/components/tienda/ui';

function BolsaIcono() {
  const { totalItems } = useCarrito();
  return (
    <Link href="/tienda/carrito" className="relative p-2" aria-label="Bolsa">
      <ShoppingBag className="h-6 w-6" strokeWidth={1.75} />
      {totalItems > 0 && (
        <span className="absolute right-0 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold leading-none text-background">
          {totalItems > 9 ? '9+' : totalItems}
        </span>
      )}
    </Link>
  );
}

function Header() {
  const { cliente, cargando, logout } = useAuthCliente();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrar = () => setMenuAbierto(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
          <button
            onClick={() => setMenuAbierto(true)}
            className="-ml-2 rounded-md p-2 md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" strokeWidth={1.75} />
          </button>

          <Link href="/tienda" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-full ring-1 ring-border sm:h-8 sm:w-8" />
            <span className="text-sm font-extrabold uppercase tracking-tight sm:text-base">Camino al Deporte</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/tienda" className="text-foreground/80 hover:text-foreground">
              Catálogo
            </Link>
            {cliente && (
              <Link href="/tienda/pedidos" className="text-foreground/80 hover:text-foreground">
                Mis pedidos
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-4 md:flex">
              {!cargando &&
                (cliente ? (
                  <>
                    <span className="text-sm text-muted-foreground">Hola, {cliente.nombre.split(' ')[0]}</span>
                    <button onClick={logout} className="text-sm font-medium underline-offset-4 hover:underline">
                      Salir
                    </button>
                  </>
                ) : (
                  <Link href="/tienda/login" className="text-sm font-medium underline-offset-4 hover:underline">
                    Iniciar sesión
                  </Link>
                ))}
            </div>
            <BolsaIcono />
          </div>
        </div>
      </header>

      {/* Menú móvil: overlay + panel deslizante desde la izquierda */}
      <div className={`fixed inset-0 z-50 md:hidden ${menuAbierto ? '' : 'pointer-events-none'}`} aria-hidden={!menuAbierto}>
        <div
          onClick={cerrar}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
            menuAbierto ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-background p-5 shadow-xl transition-transform duration-200 ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-6 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Menú</span>
            <button onClick={cerrar} className="rounded-md p-2" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 text-base font-medium">
            <Link href="/tienda" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
              Catálogo
            </Link>
            {cliente && (
              <Link href="/tienda/pedidos" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
                Mis pedidos
              </Link>
            )}
          </nav>

          <div className="border-t border-border pt-4">
            {!cargando &&
              (cliente ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" /> {cliente.nombre}
                  </div>
                  <button
                    onClick={() => {
                      cerrar();
                      logout();
                    }}
                    className={`${claseBotonSecundario} w-full`}
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : (
                <Link href="/tienda/login" onClick={cerrar} className={`${claseBotonPrimario} w-full`}>
                  Iniciar sesión
                </Link>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function TiendaLayout({ children }: { children: ReactNode }) {
  return (
    <AuthClienteProvider>
      <CarritoProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
        </div>
      </CarritoProvider>
    </AuthClienteProvider>
  );
}
