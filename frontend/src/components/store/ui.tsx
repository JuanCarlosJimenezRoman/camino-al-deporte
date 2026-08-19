'use client';

import { ButtonHTMLAttributes } from 'react';
import { Minus, Plus, Star } from 'lucide-react';
import { cn, formatoMoneda } from '@/lib/utils';
import { tonoPorStock } from '@/components/ui/status-badge';

// Estilos compartidos por toda la tienda (cliente). Son independientes de
// las clases .btn/.card y de <StatusBadge> del panel de administración a
// propósito: la tienda usa un lenguaje visual propio (pills grandes,
// tipografía editorial, mucho espacio) — ver brief de rediseño, sección 76
// ("el CRM y la tienda pueden compartir marca/color/tipografía, pero NO la
// misma experiencia"). Reutilizamos sí la LÓGICA de color por estado
// (tonoPorStock) para que "qué cuenta como stock bajo" nunca se defina dos
// veces con criterios distintos entre panel y tienda.

// El naranja de marca (--primary) se reserva para el CTA principal y para
// selección activa (ver sección 4 del brief) — por eso el botón primario ya
// no es negro, y los chips/tallas seleccionados también usan este color.
export const claseBotonPrimario =
  'inline-flex items-center justify-center rounded-full bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';

export const claseBotonSecundario =
  'inline-flex items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:border-foreground disabled:pointer-events-none disabled:opacity-40';

// Botón fantasma para acciones secundarias dentro de tarjetas/paneles (ej.
// "Vista rápida"), donde un pill con borde se sentiría demasiado pesado.
export const claseBotonFantasma =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-background/95 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground shadow-elevated backdrop-blur transition hover:bg-background disabled:pointer-events-none disabled:opacity-40';

// Botones de solo ícono del header (buscar/favoritos/carrito/menú), con su
// contador opcional (badge naranja arriba a la derecha — "indicador
// importante", ver sección 4 del brief).
export const claseBotonIcono =
  'relative flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary';

export const claseContadorIcono =
  'absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground';

// Tipografía editorial reutilizable: ojo/eyebrow (texto pequeño arriba de un
// título) y título de sección (grande, en mayúsculas, sobrio).
export const claseOjo = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
export const claseTituloSeccion = 'text-lg font-bold uppercase tracking-tight sm:text-xl';
export const claseTituloHero = 'text-3xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl';

// Campos de formulario (checkout, login, registro) — antes cada pantalla
// definía su propia versión local de estas dos clases.
export const claseCampoTienda =
  'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none transition-colors focus:border-foreground';
export const claseEtiquetaCampo = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

// Chip reutilizado por filtros y por el selector de talla: mismo criterio
// visual para "seleccionado" (borde+fondo naranja) y "agotado" (tachado,
// deshabilitado) en toda la tienda — evita que cada pantalla reinvente el
// ternario de estados.
export function claseChip({ seleccionado = false, agotado = false }: { seleccionado?: boolean; agotado?: boolean } = {}) {
  if (agotado) {
    return 'cursor-not-allowed rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground/40 line-through';
  }
  return cn(
    'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors duration-150',
    seleccionado ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-foreground'
  );
}

// Badges de producto (NUEVO / ÚLTIMAS UNIDADES / AGOTADO) — solo estados que
// se pueden calcular con datos reales (fecha de creación, stock real). Nada
// de "MÁS VENDIDO" u "OFERTA": el catálogo hoy no expone ventas ni precio de
// comparación, y el brief prohíbe inventar esos datos (ver sección 67).
const CLASE_BADGE_BASE = 'inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide';
export const claseBadgeNuevo = cn(CLASE_BADGE_BASE, 'bg-foreground text-background');
export const claseBadgeUltimas = cn(CLASE_BADGE_BASE, 'bg-warning text-warning-foreground');
export const claseBadgeAgotado = cn(CLASE_BADGE_BASE, 'bg-secondary text-muted-foreground');

/** Traduce el stock real a la etiqueta que ve el cliente. Reutiliza
 * tonoPorStock (misma definición de "stock bajo" que el panel interno) pero
 * con copy propio de tienda ("Últimas unidades" en vez de "Stock bajo"). */
export function estadoStockTienda(stockTotal: number): {
  texto: string;
  tono: 'success' | 'warning' | 'destructive';
} {
  const tono = tonoPorStock(stockTotal, 5) as 'success' | 'warning' | 'destructive';
  if (stockTotal <= 0) return { texto: 'Agotado', tono };
  if (tono === 'warning') return { texto: stockTotal === 1 ? 'Última pieza' : `Últimas ${stockTotal} unidades`, tono };
  return { texto: 'Disponible', tono };
}

/** Precio con formato de moneda consistente en toda la tienda. Solo pinta
 * "precio anterior" y "% de descuento" si de verdad se le pasa un
 * precioAnterior mayor al precio actual — no hay ningún llamador hoy que
 * invente uno (el catálogo no tiene precio de comparación todavía), queda
 * listo para cuando sí exista ese dato. */
export function PriceTag({
  precio,
  precioAnterior,
  tamano = 'base',
  className,
}: {
  precio: number | string;
  precioAnterior?: number | string | null;
  tamano?: 'sm' | 'base' | 'lg';
  className?: string;
}) {
  const actual = Number(precio);
  const anterior = precioAnterior != null ? Number(precioAnterior) : null;
  const hayDescuento = anterior != null && anterior > actual;
  const porcentaje = hayDescuento ? Math.round(((anterior! - actual) / anterior!) * 100) : 0;

  const tamanos = {
    sm: 'text-sm font-bold',
    base: 'text-base font-bold',
    lg: 'text-2xl font-extrabold sm:text-3xl',
  } as const;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <span className={tamanos[tamano]}>{formatoMoneda(actual)}</span>
      {hayDescuento && (
        <>
          <span className="text-sm text-muted-foreground line-through">{formatoMoneda(anterior!)}</span>
          <span className="text-xs font-bold text-destructive">-{porcentaje}%</span>
        </>
      )}
    </div>
  );
}

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
