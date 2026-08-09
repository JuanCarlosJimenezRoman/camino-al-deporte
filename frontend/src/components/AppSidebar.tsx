'use client';

import {
  Home,
  Package,
  Layers,
  Warehouse,
  ArrowLeftRight,
  ShoppingCart,
  Store,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  LucideIcon,
} from 'lucide-react';
import { useAuth, puedeVer, Rol } from '@/lib/auth';
import { NavItem } from './NavItem';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface Seccion {
  titulo: string;
  items: NavLink[];
}

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { usuario } = useAuth();
  const rol = usuario?.rol as Rol | undefined;

  const secciones: Seccion[] = [
    {
      titulo: 'General',
      items: [{ href: '/dashboard', label: 'Inicio', icon: Home }],
    },
    {
      titulo: 'Catálogo',
      items: [
        puedeVer('productos', rol) && { href: '/dashboard/productos', label: 'Productos', icon: Package },
        puedeVer('catalogos', rol) && { href: '/dashboard/catalogos', label: 'Marcas y tallas', icon: Layers },
      ].filter(Boolean) as NavLink[],
    },
    {
      titulo: 'Operación',
      items: [
        puedeVer('inventario', rol) && { href: '/dashboard/inventario', label: 'Inventario', icon: Warehouse },
        puedeVer('ventas', rol) && { href: '/dashboard/ventas', label: 'Ventas', icon: ShoppingCart },
        puedeVer('transferencias', rol) && {
          href: '/dashboard/transferencias',
          label: 'Transferencias',
          icon: ArrowLeftRight,
        },
      ].filter(Boolean) as NavLink[],
    },
    {
      titulo: 'Organización',
      items: [
        puedeVer('sucursales', rol) && { href: '/dashboard/sucursales', label: 'Sucursales', icon: Store },
        puedeVer('usuarios', rol) && { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users },
      ].filter(Boolean) as NavLink[],
    },
  ].filter((s) => s.items.length > 0);

  return (
    <aside
      className={`shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center h-16 px-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-camino-al-deporte.jpg"
            alt="Camino al Deporte"
            className="w-8 h-8 rounded-md object-cover shrink-0 border border-sidebar-border"
          />
          {!collapsed && (
            <span className="font-semibold text-sm leading-tight truncate">Camino al Deporte</span>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {secciones.map((seccion) => (
          <div key={seccion.titulo} className="mb-4">
            {!collapsed && (
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40">
                {seccion.titulo}
              </div>
            )}
            {seccion.items.map((item) => (
              <NavItem key={item.href} href={item.href} icon={item.icon} collapsed={collapsed}>
                {item.label}
              </NavItem>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 rounded-lg px-3 h-9 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Colapsar menú</span>}
        </button>
      </div>
    </aside>
  );
}
