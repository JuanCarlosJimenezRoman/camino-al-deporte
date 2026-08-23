'use client';

// Header global de la tienda — reemplaza el <Header> que antes vivía inline
// en (store)/tienda/layout.tsx. Conserva toda la lógica existente (auth de
// cliente, contadores de carrito/favoritos, menú móvil) y le suma: barra de
// confianza, búsqueda global, navegación por categoría (real, derivada del
// catálogo — ver lib/catalogo.tsx) y un botón de cuenta con menú.
//
// Deliberadamente NO incluye "Ofertas" en la navegación: el catálogo no
// tiene precio de comparación/descuento, así que no hay nada real que esa
// sección pudiera listar (ver brief, sección 67 "no inventar descuentos").
// Tampoco usa nombres de categoría fijos como "Hombre/Mujer/Niños": esta
// tienda no garantiza tener esa taxonomía (género es, cuando existe, un
// campo personalizado, no una Categoria) — la nav usa las categorías reales
// del catálogo.

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, ShoppingBag, Heart, User, Search as SearchIcon, LogOut, Package, Sun, Moon } from 'lucide-react';
import { useAuthCliente } from '@/lib/authCliente';
import { useCarrito } from '@/lib/carrito';
import { useFavoritos } from '@/lib/favoritos';
import { useCatalogo } from '@/lib/catalogo';
import { useTheme } from '@/lib/themeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { claseBotonIcono, claseContadorIcono, claseBotonPrimario, claseBotonSecundario } from './ui';
import { SearchOverlay } from './SearchOverlay';

const MAX_CATEGORIAS_NAV = 4;

function TrustBar() {
  const items = ['Envíos a todo México', 'Compra segura', 'Apartados disponibles', 'Recoge en sucursal'];
  return (
    <div className="hidden border-b border-border bg-secondary/60 sm:block">
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-2 px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:px-6 lg:px-8">
        {items.map((texto, i) => (
          <span key={texto} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            {texto}
          </span>
        ))}
      </div>
    </div>
  );
}

function BolsaIcono() {
  const { totalItems } = useCarrito();
  return (
    <Link href="/tienda/carrito" className={claseBotonIcono} aria-label="Bolsa">
      <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
      {totalItems > 0 && <span className={claseContadorIcono}>{totalItems > 9 ? '9+' : totalItems}</span>}
    </Link>
  );
}

function FavoritosIcono() {
  const { ids } = useFavoritos();
  return (
    <Link href="/tienda/favoritos" className={claseBotonIcono} aria-label="Favoritos">
      <Heart className="h-5 w-5" strokeWidth={1.75} />
      {ids.size > 0 && <span className={claseContadorIcono}>{ids.size > 9 ? '9+' : ids.size}</span>}
    </Link>
  );
}

function TemaIcono() {
  const { tema, alternarTema } = useTheme();
  return (
    <button
      type="button"
      onClick={alternarTema}
      className={claseBotonIcono}
      aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {tema === 'dark' ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
    </button>
  );
}

function CuentaMenu() {
  const { cliente, cargando, logout } = useAuthCliente();

  if (cargando) return <div className={claseBotonIcono} aria-hidden="true" />;

  if (!cliente) {
    return (
      <Link href="/tienda/login" className={claseBotonIcono} aria-label="Iniciar sesión">
        <User className="h-5 w-5" strokeWidth={1.75} />
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={claseBotonIcono} aria-label={`Cuenta de ${cliente.nombre}`}>
          <User className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="animate-fade-in">
        <DropdownMenuLabel>Hola, {cliente.nombre.split(' ')[0]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/tienda/perfil">Mi perfil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/tienda/pedidos">
            <Package className="h-4 w-4" /> Mis pedidos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} className="text-destructive">
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StoreHeader() {
  const { cliente, cargando, logout } = useAuthCliente();
  const { categorias } = useCatalogo();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const cerrar = () => setMenuAbierto(false);

  const categoriasNav = categorias.slice(0, MAX_CATEGORIAS_NAV);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <TrustBar />

        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
          <button onClick={() => setMenuAbierto(true)} className="-ml-2 rounded-md p-2 lg:hidden" aria-label="Abrir menú">
            <Menu className="h-6 w-6" strokeWidth={1.75} />
          </button>

          <Link href="/tienda" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-full ring-1 ring-border sm:h-8 sm:w-8" />
            <span className="text-sm font-extrabold uppercase tracking-tight sm:text-base">Camino al Deporte</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium lg:flex">
            <Link href="/tienda" className="text-foreground/80 transition-colors hover:text-foreground">
              Tienda
            </Link>
            <Link href="/tienda/productos" className="text-foreground/80 transition-colors hover:text-foreground">
              Catálogo
            </Link>
            {categoriasNav.map((c) => (
              <Link
                key={c.nombre}
                href={`/tienda/productos?categoria=${encodeURIComponent(c.nombre)}`}
                className="text-foreground/80 transition-colors hover:text-foreground"
              >
                {c.nombre}
              </Link>
            ))}
            <Link href="/tienda#marcas" className="text-foreground/80 transition-colors hover:text-foreground">
              Marcas
            </Link>
          </nav>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <button onClick={() => setBuscadorAbierto(true)} className={claseBotonIcono} aria-label="Buscar">
              <SearchIcon className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <TemaIcono />
            <FavoritosIcono />
            <BolsaIcono />
            <div className="hidden lg:block">
              <CuentaMenu />
            </div>
          </div>
        </div>
      </header>

      <SearchOverlay open={buscadorAbierto} onClose={() => setBuscadorAbierto(false)} />

      {/* Menú móvil: overlay + panel deslizante desde la izquierda */}
      <div className={`fixed inset-0 z-50 lg:hidden ${menuAbierto ? '' : 'pointer-events-none'}`} aria-hidden={!menuAbierto}>
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

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto text-base font-medium">
            <Link href="/tienda" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
              Tienda
            </Link>
            <Link href="/tienda/productos" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
              Catálogo
            </Link>
            {categoriasNav.map((c) => (
              <Link
                key={c.nombre}
                href={`/tienda/productos?categoria=${encodeURIComponent(c.nombre)}`}
                onClick={cerrar}
                className="rounded-lg px-3 py-3 hover:bg-secondary"
              >
                {c.nombre}
              </Link>
            ))}
            <Link href="/tienda#marcas" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
              Marcas
            </Link>
            <div className="my-2 border-t border-border" />
            {cliente && (
              <Link href="/tienda/pedidos" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
                Mis pedidos
              </Link>
            )}
            <Link href="/tienda/favoritos" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
              Favoritos
            </Link>
            {cliente && (
              <Link href="/tienda/perfil" onClick={cerrar} className="rounded-lg px-3 py-3 hover:bg-secondary">
                Mi perfil
              </Link>
            )}
          </nav>

          <div className="border-t border-border pt-4">
            {!cargando &&
              (cliente ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" /> {cliente.nombre}
                  </p>
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
