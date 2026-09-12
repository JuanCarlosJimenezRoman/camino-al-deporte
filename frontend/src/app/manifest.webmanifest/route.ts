import { NextResponse } from 'next/server';
import { obtenerIdentidadNegocio } from '@/lib/identidadNegocio';

// Manifest del PWA de la tienda pública. Antes era public/manifest.webmanifest
// (archivo estático) — se movió a un route handler porque un archivo público
// no puede leer el nombre configurado en /dashboard/configuracion; este usa
// el mismo endpoint que ConfigNegocioProvider y generateMetadata (ver
// lib/identidadNegocio.ts).
//
// Los íconos se quedan fijos: personalizarlos por negocio requeriría generar
// PNG reales a partir del logo subido (192/512/maskable), que es un cambio
// aparte. Mientras tanto, cada deploy nuevo reemplaza los archivos en
// public/icons/ igual que hoy.
export async function GET() {
  const { nombre } = await obtenerIdentidadNegocio();

  return NextResponse.json(
    {
      name: nombre,
      short_name: nombre,
      description: 'Gestión de inventarios y ventas',
      start_url: '/',
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
