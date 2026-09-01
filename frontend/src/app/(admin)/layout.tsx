import type { Metadata } from 'next';

// Este grupo (admin) hoy solo contiene /dashboard/**, pero cualquier ruta
// futura que cuelgue de aqui hereda el manifest de personal en vez del de
// la tienda (public/manifest.webmanifest, que manda a /tienda si no hay sesion).
// Motivo: si el personal instala la app desde dentro del panel, el icono
// debe abrir siempre en /login (o /dashboard si ya hay sesion), nunca en
// el catalogo publico. Ver public/manifest-staff.webmanifest.
export const metadata: Metadata = {
  manifest: '/manifest-staff.webmanifest',
};

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
