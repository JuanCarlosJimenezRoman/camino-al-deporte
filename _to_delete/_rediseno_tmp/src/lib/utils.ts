import { type ClassValue, clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mantiene un elemento montado un poco más después de que `active` pasa a
 * false, para poder animar su salida (fade/slide) antes de quitarlo del DOM
 * — no depende de ninguna librería de animaciones (el proyecto no tiene
 * `tailwindcss-animate` instalado), solo transiciones CSS normales.
 * Usado por Dialog, Drawer y Toast.
 */
export function useDelayedUnmount(active: boolean, delayMs = 180) {
  const [shouldRender, setShouldRender] = useState(active);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (active) {
      setShouldRender(true);
    } else {
      timeout = setTimeout(() => setShouldRender(false), delayMs);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [active, delayMs]);
  return shouldRender;
}

/** true solo después de montar en el cliente — evita llamar a `createPortal`
 * durante el render en el servidor (donde `document` no existe). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
