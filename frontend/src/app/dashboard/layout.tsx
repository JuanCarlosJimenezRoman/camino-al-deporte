'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppSidebar } from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [colapsado, setColapsado] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login');
  }, [cargando, usuario, router]);

  // Si el usuario navega a otra sección, cerramos el menú móvil automáticamente.
  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [pathname]);

  if (cargando || !usuario) return null;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar
        collapsed={colapsado}
        mobileOpen={menuMovilAbierto}
        onToggleCollapse={() => setColapsado((c) => !c)}
        onCloseMobile={() => setMenuMovilAbierto(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenMobileMenu={() => setMenuMovilAbierto(true)} />
        <main className="flex-1 p-3 sm:p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
