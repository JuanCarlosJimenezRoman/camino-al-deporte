'use client';

/**
 * Modal centrado, construido con React puro (portal + estado), sin
 * dependencia de @radix-ui/react-dialog: el proyecto no tenía ningún
 * componente de modal/drawer y no fue posible instalar paquetes nuevos en
 * este entorno (registro de npm bloqueado), así que se implementa con lo
 * que ya está disponible. La API imita la forma habitual de un Dialog
 * (Dialog/DialogTrigger/DialogContent/...) para que se sienta igual de
 * fácil de usar.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, useDelayedUnmount, useMounted } from '@/lib/utils';

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(componente: string) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error(`<${componente}> debe usarse dentro de <Dialog>`);
  return ctx;
}

export function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({
  asChild,
  children,
  ...props
}: { asChild?: boolean; children: React.ReactElement } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDialogContext('DialogTrigger');

  if (asChild) {
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        children.props.onClick?.(e);
        setOpen(true);
      },
    });
  }

  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen(true);
      }}
    >
      {children}
    </button>
  );
}

/** Bloquea el scroll del body y cierra con Escape mientras el overlay esté
 * abierto — comportamiento estándar de cualquier modal. */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
}

export function DialogContent({
  className,
  children,
  showClose = true,
}: {
  className?: string;
  children: React.ReactNode;
  showClose?: boolean;
}) {
  const { open, setOpen } = useDialogContext('DialogContent');
  const mounted = useMounted();
  const shouldRender = useDelayedUnmount(open, 160);
  const close = React.useCallback(() => setOpen(false), [setOpen]);
  useOverlayBehavior(open, close);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={close}
        className={cn('fixed inset-0 bg-black/40 transition-opacity duration-150', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-card border border-border bg-card text-card-foreground shadow-elevated',
          'transition-all duration-150',
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
          className
        )}
      >
        {showClose && (
          <button
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-1', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold leading-none pr-6', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 mt-2 border-t border-border', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function useDialog(defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);
  return { open, setOpen, onOpenChange: setOpen };
}
