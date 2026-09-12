'use client';

// Configuración de marca del negocio (white-label): nombre, iniciales y logo
// que se leen de ConfiguracionTienda (endpoint público) para que el panel y
// el login dejen de asumir "Camino al Deporte" y reflejen lo que se configuró
// en /dashboard/configuracion. Vive en un provider del layout raíz para que
// esté disponible en toda la app (admin, login y, a futuro, tienda).

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

export interface ConfigNegocio {
  nombre: string;
  iniciales: string;
  logoUrl: string | null;
}

const DEFAULTS: ConfigNegocio = { nombre: 'Camino al Deporte', iniciales: 'CD', logoUrl: null };

interface ConfigNegocioContextValue {
  config: ConfigNegocio;
  cargando: boolean;
}

const ConfigNegocioContext = createContext<ConfigNegocioContextValue>({
  config: DEFAULTS,
  cargando: true,
});

export function ConfigNegocioProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigNegocio>(DEFAULTS);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ nombreNegocio: string; iniciales: string; logoTicketUrl: string | null }>('/configuracion-tienda/publica')
      .then((data) => {
        setConfig({
          nombre: data.nombreNegocio || DEFAULTS.nombre,
          iniciales: data.iniciales || DEFAULTS.iniciales,
          logoUrl: data.logoTicketUrl || null,
        });
      })
      .catch(() => {
        // Sin acceso / sin red: se queda con los valores por defecto.
      })
      .finally(() => setCargando(false));
  }, []);

  return <ConfigNegocioContext.Provider value={{ config, cargando }}>{children}</ConfigNegocioContext.Provider>;
}

export function useConfigNegocio() {
  return useContext(ConfigNegocioContext);
}
