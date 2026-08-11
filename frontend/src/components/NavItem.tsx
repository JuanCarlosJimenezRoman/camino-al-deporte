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
  const activo = pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? String(children) : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 h-9 text-sm font-medium transition-colors mb-0.5',
        collapsed && 'md:justify-center md:px-0',
        activo
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
      )}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span className={cn('truncate', collapsed && 'md:hidden')}>{children}</span>
    </Link>
  );
}
