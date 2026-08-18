'use client';

import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn, useMounted } from '@/lib/utils';
import { useToast, dismissToast, type ToastVariant } from './use-toast';

const ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
};

const TONE_CLASSES: Record<ToastVariant, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/** Se monta una sola vez, en el layout del dashboard. */
export function Toaster() {
  const { toasts } = useToast();
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.variant ?? 'default'];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-card border border-border bg-card p-4 shadow-elevated',
              'animate-in fade-in slide-in-from-bottom-2'
            )}
          >
            <Icon className={cn('w-4.5 h-4.5 mt-0.5 shrink-0', TONE_CLASSES[t.variant ?? 'default'])} />
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-sm font-semibold leading-tight">{t.title}</p>}
              {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Cerrar notificación"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
