'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppSidebar } from '@/components/AppSidebar';
import { Topbar } from '@/components/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useAuth();
  const router = useRouter();
  const [colapsado, setColapsado] = useState(false);

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login');
  }, [cargando, usuario, router]);

  if (cargando || !usuario) return null;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar collapsed={colapsado} onToggle={() => setColapsado((c) => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onToggleSidebar={() => setColapsado((c) => !c)} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
