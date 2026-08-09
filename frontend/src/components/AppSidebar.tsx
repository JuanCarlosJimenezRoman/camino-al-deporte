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
  CalendarClock,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  X,
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
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
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
        puedeVer('apartados', rol) && { href: '/dashboard/apartados', label: 'Apartados', icon: CalendarClock },
        puedeVer('pedidosOnline', rol) && {
          href: '/dashboard/pedidos-online',
          label: 'Pedidos en línea',
          icon: Globe,
        },
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
    <>
      {/* Fondo oscuro detrás del menú cuando está abierto en móvil */}
      <div
        onClick={onCloseMobile}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-sidebar text-sidebar-foreground
          border-r border-sidebar-border flex flex-col transition-transform duration-200
          lg:static lg:translate-x-0 lg:z-auto lg:transition-[width] lg:duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        <div className="flex items-center justify-between h-16 px-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-camino-al-deporte.jpg"
              alt="Camino al Deporte"
              className="w-8 h-8 rounded-md object-cover shrink-0 border border-sidebar-border"
            />
            <span className={`font-semibold text-sm leading-tight truncate ${collapsed ? 'lg:hidden' : ''}`}>
              Camino al Deporte
            </span>
          </div>
          <button onClick={onCloseMobile} className="lg:hidden p-1.5 rounded-md hover:bg-sidebar-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {secciones.map((seccion) => (
            <div key={seccion.titulo} className="mb-4">
              <div
                className={`px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40 ${
                  collapsed ? 'lg:hidden' : ''
                }`}
              >
                {seccion.titulo}
              </div>
              {seccion.items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  collapsed={collapsed}
                  onNavigate={onCloseMobile}
                >
                  {item.label}
                </NavItem>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-2 hidden lg:block">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center gap-3 rounded-lg px-3 h-9 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
            {!collapsed && <span>Colapsar menú</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
