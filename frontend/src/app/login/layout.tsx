import type { Metadata } from 'next';

// Mismo motivo que (admin)/layout.tsx: /login es el otro punto de entrada
// valido para instalar la app de personal (start_url del manifest de
// personal apunta aqui), asi que tambien debe anunciar ese manifest y no
// el de la tienda.
export const metadata: Metadata = {
  manifest: '/manifest-staff.webmanifest',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
