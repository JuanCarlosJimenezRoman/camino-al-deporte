import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { ReactNode } from 'react';

// Header minimalista del checkout (sección 42 del brief): solo logo + un
// mensaje de confianza, sin navegación, buscador, favoritos ni carrito —
// nada que distraiga de completar el pedido. Sin footer tampoco, a
// propósito (sección 73: la estructura del checkout no incluye uno).
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tienda-theme flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="h-[3px] w-full bg-gradient-to-r from-gold via-bronze to-gold" aria-hidden="true" />
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/tienda" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-full ring-1 ring-gold/30" />
            <span className="text-sm font-extrabold uppercase tracking-tight">Camino al Deporte</span>
          </Link>
          <div className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-bronze">
            <ShieldCheck className="h-4 w-4 text-gold" strokeWidth={1.75} />
            Compra segura
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
