import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalLabel,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Ej. "91 productos" — se muestra a la izquierda. */
  totalLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      <p className="text-sm text-muted-foreground">
        {totalLabel ? `${totalLabel} · ` : ''}Página {page} de {Math.max(totalPages, 1)}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
