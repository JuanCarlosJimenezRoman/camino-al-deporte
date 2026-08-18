'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NavItem({
  href,
  icon: Icon,
  collapsed,
  onNavigate,
  children,
}: {
  href: string;
  icon?: LucideIcon;
  collapsed?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // "/dashboard" solo se marca activo en el home exacto; el resto de
  // secciones también se marca activo en sus subrutas (ej. una pestaña
  // dentro de /dashboard/productos/algo) para que el resaltado no se apague
  // al entrar a una pantalla anidada.
  const activo = href === '/dashboard' ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? String(children) : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 h-9 text-sm font-medium transition-colors mb-0.5',
        collapsed && 'md:justify-center md:px-0',
        activo
          ? 'bg-primary/8 text-foreground'
          : 'text-sidebar-foreground/70 hover:bg-secondary hover:text-sidebar-foreground'
      )}
    >
      {/* Acento lateral — nunca fondo naranja sólido, solo un indicador
          delgado + el ícono en color de marca. */}
      {activo && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />}
      {Icon && <Icon className={cn('w-4 h-4 shrink-0', activo ? 'text-primary' : 'text-sidebar-foreground/50')} />}
      <span className={cn('truncate', collapsed && 'md:hidden')}>{children}</span>
    </Link>
  );
}
