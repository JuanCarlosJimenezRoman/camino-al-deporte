'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { usuario, cargando } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    // El dominio raíz lo puede visitar cualquier cliente (ej. si borra
    // "/tienda" de la URL) — a un visitante sin sesión de empleado lo
    // mandamos al catálogo público, no al login del personal. El login
    // sigue existiendo en /login, solo que ya no es lo primero que ve
    // cualquiera que llegue al dominio.
    router.replace(usuario ? '/dashboard' : '/tienda');
  }, [cargando, usuario, router]);

  return null;
}
