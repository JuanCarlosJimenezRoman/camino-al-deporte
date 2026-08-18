'use client';

/**
 * Tabs simples (sin @radix-ui/react-tabs, no disponible en este entorno).
 * Estilo subrayado con acento de marca en el tab activo — nunca fondo
 * sólido, para no repetir el problema del sidebar (regla 4/17 del rediseño).
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(componente: string) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error(`<${componente}> debe usarse dentro de <Tabs>`);
  return ctx;
}

export function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [valueState, setValueState] = React.useState(defaultValue ?? '');
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : valueState;

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setValueState(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-5 border-b border-border overflow-x-auto', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: { value: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { value: active, setValue } = useTabsContext('TabsTrigger');
  const selected = active === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => setValue(value)}
      className={cn(
        'relative shrink-0 whitespace-nowrap px-0.5 py-3 text-sm font-medium transition-colors',
        '-mb-px border-b-2',
        selected ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: { value: string } & React.HTMLAttributes<HTMLDivElement>) {
  const { value: active } = useTabsContext('TabsContent');
  if (active !== value) return null;
  return (
    <div role="tabpanel" className={cn('pt-4', className)} {...props}>
      {children}
    </div>
  );
}
