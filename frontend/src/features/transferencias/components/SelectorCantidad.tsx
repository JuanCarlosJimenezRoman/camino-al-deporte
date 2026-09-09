'use client';

interface Props {
  cantidad: number;
  onCambiar: (nueva: number) => void;
  min?: number;
  max?: number;
}

export function SelectorCantidad({ cantidad, onCambiar, min = 1, max }: Props) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onCambiar(cantidad - 1)}
        disabled={cantidad <= min}
        aria-label="Quitar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="text-sm font-semibold leading-none">−</span>
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{cantidad}</span>
      <button
        type="button"
        onClick={() => onCambiar(cantidad + 1)}
        disabled={max !== undefined && cantidad >= max}
        aria-label="Agregar uno"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="text-sm font-semibold leading-none">+</span>
      </button>
    </div>
  );
}