import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
