import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { Activity } from 'lucide-react';

export interface ActivityItem {
  id: string;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'neutral';
  title: string;
  detail?: string;
  timestamp: string;
}

const TONE_CLASSES: Record<NonNullable<ActivityItem['tone']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  neutral: 'bg-secondary text-muted-foreground',
};

/** Feed tipo "actividad reciente" — combina eventos de distintos orígenes
 * (ventas, apartados, notificaciones) ya traídos por el llamador; este
 * componente solo los pinta, no hace fetch. */
export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Sin actividad todavía"
        description="Aquí verás ventas, apartados y movimientos recientes en cuanto ocurran."
      />
    );
  }

  return (
    <ul className={cn('space-y-4', className)}>
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE_CLASSES[item.tone ?? 'neutral'])}>
            <item.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate">{item.title}</p>
            {item.detail && <p className="text-sm text-muted-foreground truncate">{item.detail}</p>}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">{item.timestamp}</span>
        </li>
      ))}
    </ul>
  );
}
