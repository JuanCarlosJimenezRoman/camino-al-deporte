import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider } from '@/lib/themeContext';
import './globals.css';

// Tailwind ya listaba "Inter" como fallback en la pila de fuentes, pero
// nunca se cargaba de verdad (sin next/font, sin <link>) — el sitio caía en
// la fuente del sistema. Se carga aquí, una sola vez para toda la app (panel
// y tienda comparten tipografía por diseño, ver brief de rediseño), como
// variable CSS para no forzar un <div> extra ni romper el font-family que ya
// define globals.css.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Camino al Deporte',
  description: 'Gestión de inventarios y ventas',
};

// Script inline que aplica la clase "dark" a <html> ANTES del primer paint
// (se ejecuta bloqueando, en <head>, antes de que React hidrate nada). Sin
// esto, /tienda y /login mostrarían un parpadeo de tema claro y luego
// oscuro para quien ya guardó "dark" como preferencia: a diferencia de
// /dashboard (que retrasa su contenido real hasta resolver la sesión),
// estas rutas pintan de inmediato. <ThemeProvider> (lib/themeContext.tsx)
// hace exactamente el mismo cálculo del lado de React para mantener su
// estado en sync — la clave de localStorage ('cad-theme') debe coincidir
// con STORAGE_KEY ahí.
const SCRIPT_TEMA_INICIAL = `(function () {
  try {
    var t = localStorage.getItem('cad-theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
