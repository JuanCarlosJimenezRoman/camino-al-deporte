'use client';

import { ButtonHTMLAttributes } from 'react';
import { Minus, Plus, Star } from 'lucide-react';

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

// Selector/despliegue de calificación en estrellas (1-5), usado en la reseña
// de pedidos. Sin onChange es de solo lectura (para mostrar una calificación
// ya enviada).
export function Estrellas({
  valor,
  onChange,
  tamano = 'h-6 w-6',
}: {
  valor: number;
  onChange?: (n: number) => void;
  tamano?: string;
}) {
  const soloLectura = !onChange;
  return (
    <div className="inline-flex items-center gap-1" role={soloLectura ? undefined : 'radiogroup'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={soloLectura}
          onClick={() => onChange?.(n)}
          aria-label={`${n} de 5 estrellas`}
          className={soloLectura ? 'cursor-default' : 'cursor-pointer'}
        >
          <Star
            className={tamano}
            strokeWidth={1.5}
            // Color explícito (no clases de Tailwind con opacidad sobre
            // variables CSS): así la estrella vacía siempre se ve claramente
            // distinta de la llena, sin depender de que el modificador de
            // opacidad resuelva bien.
            color={n <= valor ? '#111827' : '#d1d5db'}
            fill={n <= valor ? '#111827' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}
