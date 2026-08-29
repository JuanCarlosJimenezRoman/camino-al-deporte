'use client';

import { useEffect } from 'react';

// Registra el service worker (public/sw.js) despues del primer render.
// Solo existe para que Chrome/Android ofrezcan "Instalar app" desde el
// menu o la barra de direcciones; ver sw.js para el detalle de que
// cachea (casi nada, a proposito).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Silencioso: si falla el registro, la app sigue funcionando
        // normal como sitio web, solo sin opcion de instalar.
      });
    }
  }, []);

  return null;
}
