import { ReactNode } from 'react';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreFooter } from '@/components/store/StoreFooter';

// Layout de la tienda "completa" (todo excepto checkout): header con nav,
// búsqueda y barra de confianza, y footer. Vive en un grupo de rutas
// `(shop)` separado de `checkout/` para que checkout pueda tener su propio
// header minimalista sin heredar este — ver tienda/layout.tsx.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <StoreHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <StoreFooter />
    </div>
  );
}
