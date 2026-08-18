import { cn } from '@/lib/utils';
import { Badge } from './badge';

/**
 * Envuelve Badge con los tonos semánticos fijos que pide el rediseño:
 * naranja = acción/marca (no se usa aquí), verde = disponible/correcto,
 * amarillo = atención/pendiente, rojo = problema/agotado, gris = info
 * secundaria. Un solo lugar para no repetir "qué color es cada estado" en
 * cada página.
 */
export type EstadoTono = 'success' | 'warning' | 'destructive' | 'neutral' | 'primary';

const DOT_CLASSES: Record<EstadoTono, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
};

const BADGE_VARIANT: Record<EstadoTono, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  neutral: 'secondary',
  primary: 'default',
};

export function StatusBadge({
  tono,
  children,
  withDot = true,
  className,
}: {
  tono: EstadoTono;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={BADGE_VARIANT[tono]} className={cn('gap-1.5', className)}>
      {withDot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tono])} />}
      {children}
    </Badge>
  );
}

/** Mapea los estados de stock más comunes de la app a un tono, para no
 * repetir el if/else en cada tabla (Productos, Inventario, etc.). */
export function tonoPorStock(stock: number, minimo = 5): EstadoTono {
  if (stock <= 0) return 'destructive';
  if (stock <= minimo) return 'warning';
  return 'success';
}

export function etiquetaPorStock(stock: number, minimo = 5): string {
  if (stock <= 0) return 'Agotado';
  if (stock <= minimo) return 'Stock bajo';
  return 'Disponible';
}
