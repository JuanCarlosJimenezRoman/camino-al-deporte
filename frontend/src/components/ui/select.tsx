import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Select estilizado. Se apoya en un <select> nativo real (accesibilidad y
 * comportamiento gratis en cualquier dispositivo, incluido móvil) con un
 * wrapper que dibuja el mismo look que Input/Button y un ícono de flecha
 * encima — no usa @radix-ui/react-select (no disponible en este entorno).
 * Mismo patrón que ya usan las páginas actuales (option/value), por lo que
 * se puede adoptar sin cambiar la forma en que cada página maneja su
 * estado de filtro.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-border bg-input pl-3 pr-8 text-sm text-foreground',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
    </div>
  )
);
Select.displayName = 'Select';

export { Select };
