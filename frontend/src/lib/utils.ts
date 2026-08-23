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

// Zona horaria del negocio — la misma constante (mismo valor) que
// ZONA_NEGOCIO en backend/src/utils/fechas.js. El navegador de quien ve la
// pantalla puede estar en cualquier zona horaria (un admin viendo el
// historial desde otra ciudad, por ejemplo), así que sin esto una misma
// fecha se vería distinta según quién la mire. Se fuerza aquí para que
// fechas y horas se muestren siempre en hora de México, sin importar el
// navegador.
export const ZONA_HORARIA_NEGOCIO = 'America/Mexico_City';

/** `new Date(fecha).toLocaleString('es-MX', ...)`, ya con la zona horaria
 * del negocio aplicada — usar para cualquier fecha+hora que se muestre en
 * pantalla (p. ej. Venta.createdAt, Pedido.createdAt). */
export function formatearFechaHora(
  fecha: string | number | Date,
  opciones: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(fecha).toLocaleString('es-MX', { timeZone: ZONA_HORARIA_NEGOCIO, ...opciones });
}

/** `new Date(fecha).toLocaleDateString('es-MX', ...)`, con zona horaria del
 * negocio — usar para fechas sin hora (p. ej. fecha límite de un apartado). */
export function formatearFecha(
  fecha: string | number | Date,
  opciones: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(fecha).toLocaleDateString('es-MX', { timeZone: ZONA_HORARIA_NEGOCIO, ...opciones });
}

/** `new Date(fecha).toLocaleTimeString('es-MX', ...)`, con zona horaria del
 * negocio — usar cuando solo se muestra la hora (p. ej. lista de ventas del
 * corte del día). */
export function formatearHora(
  fecha: string | number | Date,
  opciones: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(fecha).toLocaleTimeString('es-MX', { timeZone: ZONA_HORARIA_NEGOCIO, ...opciones });
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
