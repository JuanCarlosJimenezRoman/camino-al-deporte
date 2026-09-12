import { NextResponse } from 'next/server';
import { obtenerIdentidadNegocio } from '@/lib/identidadNegocio';

// Manifest del PWA de personal (panel/login) — ver comentarios en
// (admin)/layout.tsx y login/layout.tsx sobre por qué es un manifest
// separado del de la tienda. Antes era public/manifest-staff.webmanifest;
// se movió a un route handler por el mismo motivo que manifest.webmanifest/
// route.ts: necesita el nombre configurado en /dashboard/configuracion, que
// un archivo estático no puede leer.
export async function GET() {
  const { nombre, iniciales } = await obtenerIdentidadNegocio();

  return NextResponse.json(
    {
      name: `${nombre} - Panel`,
      short_name: `Panel ${iniciales}`,
      description: 'Panel de inventarios y ventas para personal',
      start_url: '/login',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#FAFAFA',
      theme_color: '#FF4E00',
      lang: 'es-MX',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}
