'use client';

/**
 * Store mínimo de toasts (sin @radix-ui/react-toast, no disponible en este
 * entorno). Patrón singleton simple: un arreglo en memoria + listeners: se
 * llama `toast({ title, description, variant })` desde cualquier
 * componente cliente y el <Toaster/> montado en el layout se encarga de
 * pintarlo.
 */

import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

export function toast(options: Omit<ToastItem, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const duration = options.duration ?? 4000;
  toasts = [...toasts, { id, ...options }];
  emit();
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [state, setState] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return { toasts: state, toast, dismiss: dismissToast };
}
