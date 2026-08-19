'use client';

// Layout raíz de /tienda/*: SOLO contexto (auth, carrito, favoritos,
// catálogo) y el Toaster global — nada de header/footer aquí. La UI del
// header/footer completo vive en (shop)/layout.tsx; checkout tiene su
// propio layout con header minimalista (ver checkout/layout.tsx y sección
// 42 del brief: "el checkout debe ser MUCHO más sencillo que el resto de la
// tienda, sin toda la navegación"). Ambos hijos siguen compartiendo la
// misma sesión de carrito/auth/favoritos porque cuelgan del mismo provider,
// aquí arriba.

import { ReactNode } from 'react';
import { AuthClienteProvider } from '@/lib/authCliente';
import { CarritoProvider } from '@/lib/carrito';
import { FavoritosProvider } from '@/lib/favoritos';
import { CatalogoProvider } from '@/lib/catalogo';
import { Toaster } from '@/components/ui/toast';

export default function TiendaLayout({ children }: { children: ReactNode }) {
  return (
    <AuthClienteProvider>
      <FavoritosProvider>
        <CarritoProvider>
          <CatalogoProvider>
            {children}
            <Toaster />
          </CatalogoProvider>
        </CarritoProvider>
      </FavoritosProvider>
    </AuthClienteProvider>
  );
}
