import { type ClassValue, clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formato de moneda para toda la tienda en línea (antes cada pantalla hacía
// `$${precio}` a mano, sin separador de miles — "$2899" en vez de "$2,899").
// Sin decimales cuando el precio es un entero (el caso normal, precios en
// pesos completos); si algún día hay centavos, sí se muestran.
export function formatoMoneda(valor: number | string): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) return '$0';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numero);
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
