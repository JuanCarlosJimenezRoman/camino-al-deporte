'use client';

/**
 * Modo oscuro — solo para el panel administrativo (/dashboard). No usa
 * ninguna librería nueva (mismo criterio que el resto de los componentes
 * "hand-built" del rediseño): es un contexto chico que guarda la
 * preferencia en localStorage y la aplica agregando la clase "dark" a
 * <html> (no a un div interno) porque Dialog/Drawer/Toast/DropdownMenu/
 * Tooltip usan portals a document.body — si la clase solo viviera dentro
 * del árbol del dashboard, esos elementos flotantes se quedarían siempre
 * en modo claro.
 *
 * Como <ThemeProvider> solo se monta dentro de DashboardLayout, la clase
 * se agrega cuando el usuario entra a /dashboard y se quita al salir (o al
 * cerrar sesión hacia /login) — /tienda y /login nunca se ven afectados.
 */

import * as React from 'react';

type Tema = 'light' | 'dark';

interface ThemeContextValue {
  tema: Tema;
  setTema: (t: Tema) => void;
  alternarTema: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'cad-theme';

function leerTemaInicial(): Tema {
  if (typeof window === 'undefined') return 'light';
  try {
    const guardado = window.localStorage.getItem(STORAGE_KEY);
    if (guardado === 'light' || guardado === 'dark') return guardado;
  } catch {
    // localStorage no disponible (modo privado, permisos, etc.) — seguimos
    // con la preferencia del sistema operativo como respaldo.
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: se ejecuta en el primer render (antes del primer
  // paint visible, ya que DashboardLayout ya retrasa el contenido real
  // hasta que termina de resolverse la sesión), así que no hay parpadeo
  // de "claro, luego oscuro" al entrar al panel.
  const [tema, setTemaState] = React.useState<Tema>(leerTemaInicial);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      // ignorar si localStorage no está disponible
    }
    // Al desmontar el proveedor (el usuario sale de /dashboard) quitamos la
    // clase para no dejar /login o /tienda en modo oscuro por accidente.
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [tema]);

  const setTema = React.useCallback((t: Tema) => setTemaState(t), []);
  const alternarTema = React.useCallback(() => setTemaState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const value = React.useMemo(() => ({ tema, setTema, alternarTema }), [tema, setTema, alternarTema]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
