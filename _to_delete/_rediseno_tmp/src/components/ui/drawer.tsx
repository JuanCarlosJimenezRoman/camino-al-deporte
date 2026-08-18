'use client';

/**
 * Panel lateral (drawer/sheet), construido con React puro (portal + estado),
 * igual que dialog.tsx — sin dependencia externa nueva. Se usa para los
 * flujos de crear/editar que hoy son expansión inline en Productos,
 * Inventario, Ventas, Apartados; ese cambio de UI ocurre en las fases de
 * cada módulo, este componente solo queda listo para entonces.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, useDelayedUnmount, useMounted } from '@/lib/utils';

interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

function useDrawerContext(componente: string) {
  const ctx = React.useContext(DrawerContext);
  if (!ctx) throw new Error(`<${componente}> debe usarse dentro de <Drawer>`);
  return ctx;
}

export function Drawer({
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

  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

export function DrawerTrigger({
  asChild,
  children,
  ...props
}: { asChild?: boolean; children: React.ReactElement } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDrawerContext('DrawerTrigger');

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

export function DrawerContent({
  className,
  children,
  side = 'right',
  widthClassName = 'max-w-md',
}: {
  className?: string;
  children: React.ReactNode;
  side?: 'right' | 'left';
  widthClassName?: string;
}) {
  const { open, setOpen } = useDrawerContext('DrawerContent');
  const mounted = useMounted();
  const shouldRender = useDelayedUnmount(open, 200);
  const close = React.useCallback(() => setOpen(false), [setOpen]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        aria-hidden="true"
        onClick={close}
        className={cn('fixed inset-0 bg-black/40 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed inset-y-0 flex w-full flex-col bg-card text-card-foreground shadow-elevated transition-transform duration-200',
          widthClassName,
          side === 'right' ? 'right-0 border-l border-border' : 'left-0 border-r border-border',
          open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full',
          className
        )}
      >
        <button
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-3 border-b border-border', className)} {...props} />;
}

export function DrawerTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold leading-none pr-6', className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-border', className)}
      {...props}
    />
  );
}

export function useDrawer(defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);
  return { open, setOpen, onOpenChange: setOpen };
}
