'use client';

// Página 404 global: Next.js la muestra automáticamente para cualquier ruta
// que no coincida con nada dentro de app/ (o cuando algún page.tsx llama a
// notFound() explícitamente). Vive en la raíz de app/ a propósito — así
// cubre tanto /tienda/* como /dashboard/* y cualquier URL suelta, sin tener
// que duplicarla dentro de cada route group. Como cuelga del layout raíz
// (RootLayout envuelve todo en <AuthProvider>), sí podemos usar useAuth acá
// para mandar al visitante a un lugar sensato según si tiene sesión o no,
// igual que hace app/page.tsx con la redirección de la raíz del dominio.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SearchX } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { usuario, cargando } = useAuth();
  const router = useRouter();
  const destinoInicio = !cargando && usuario ? '/dashboard' : '/tienda';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <SearchX className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Error 404</p>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          No encontramos esta página
        </h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          La dirección que intentas abrir no existe o fue movida. Revisa el enlace o vuelve a un
          lugar conocido.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => router.back()}>
          Regresar
        </Button>
        <Link href={destinoInicio}>
          <Button>Ir al inicio</Button>
        </Link>
      </div>
    </div>
  );
}
