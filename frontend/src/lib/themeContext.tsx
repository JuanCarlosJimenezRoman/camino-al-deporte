'use client';

/**
 * Modo oscuro — para toda la app (panel administrativo y tienda en línea).
 * No usa ninguna librería nueva (mismo criterio que el resto de los
 * componentes "hand-built" del rediseño): es un contexto chico que guarda
 * la preferencia en localStorage y la aplica agregando la clase "dark" a
 * <html> (no a un div interno) porque Dialog/Drawer/Toast/DropdownMenu/
 * Tooltip usan portals a document.body — si la clase solo viviera dentro
 * de un árbol específico, esos elementos flotantes se quedarían siempre
 * en modo claro.
 *
 * <ThemeProvider> se monta una sola vez en el layout raíz (app/layout.tsx),
 * así que la preferencia es una sola y se comparte entre /dashboard,
 * /tienda y /login — no hay temas separados por sección. Para evitar el
 * parpadeo "claro y luego oscuro" en el primer render (la tienda y el
 * login, a diferencia del dashboard, no tienen un gate async antes de
 * pintar contenido real), app/layout.tsx además inyecta un script inline
 * que aplica la clase "dark" a <html> antes de que el navegador pinte —
 * ver ese archivo. La clave de localStorage (STORAGE_KEY) debe coincidir
 * con la que usa ese script.
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
  // Lazy initializer: mantiene el estado de React en sync con la clase que
  // ya aplicó el script inline de app/layout.tsx antes del primer paint (o
  // con la preferencia guardada, si el script no corrió por lo que sea).
  const [tema, setTemaState] = React.useState<Tema>(leerTemaInicial);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      // ignorar si localStorage no está disponible
    }
    // Sin cleanup que quite la clase: <ThemeProvider> ahora vive en el
    // layout raíz y no se desmonta al navegar entre secciones, así que no
    // hay "salida de /dashboard" que deba revertir nada.
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
