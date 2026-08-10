'use client';

import { ButtonHTMLAttributes } from 'react';
import { Minus, Plus } from 'lucide-react';

// Estilos de botón compartidos por toda la tienda (cliente). Son
// independientes de las clases .btn/.card del panel de administración a
// propósito: la tienda usa un lenguaje visual propio (pills, tipografía en
// mayúsculas, look inspirado en apps de e-commerce como Nike) sin arriesgar
// el estilo del dashboard interno.
export const claseBotonPrimario =
  'inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-background transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';

export const claseBotonSecundario =
  'inline-flex items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:border-foreground disabled:pointer-events-none disabled:opacity-40';

export function BotonPrimario({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${claseBotonPrimario} ${className}`} />;
}

export function BotonSecundario({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${claseBotonSecundario} ${className}`} />;
}

// Contador +/- reutilizado en el carrito y en el detalle de producto. Con
// botones táctiles grandes en vez de un <input type="number">, mucho más
// cómodo de usar en móvil.
export function Stepper({
  cantidad,
  min = 1,
  max,
  onChange,
}: {
  cantidad: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, cantidad - 1))}
        disabled={cantidad <= min}
        aria-label="Disminuir cantidad"
        className="flex h-9 w-9 items-center justify-center text-foreground disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold">{cantidad}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, cantidad + 1))}
        disabled={cantidad >= max}
        aria-label="Aumentar cantidad"
        className="flex h-9 w-9 items-center justify-center text-foreground disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
