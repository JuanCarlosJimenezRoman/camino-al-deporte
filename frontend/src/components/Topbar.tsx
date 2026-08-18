'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, User as UserIcon, Settings, Search, HelpCircle, ChevronRight, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/themeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { NotificacionesBell } from '@/components/NotificacionesBell';
import { BranchSelector } from '@/components/BranchSelector';
import { GlobalSearchDialog } from '@/components/GlobalSearchDialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const TITULOS: Record<string, string> = {
  '/dashboard': 'Inicio',
  '/dashboard/productos': 'Productos',
  '/dashboard/productos/importar': 'Importar / exportar productos',
  '/dashboard/catalogos': 'Marcas y tallas',
  '/dashboard/proveedores': 'Proveedores',
  '/dashboard/inventario': 'Inventario',
  '/dashboard/inventario/historial': 'Historial de inventario',
  '/dashboard/ventas': 'Ventas',
  '/dashboard/ventas/corte-dia': 'Corte del día',
  '/dashboard/ventas/historial': 'Historial de ventas',
  '/dashboard/apartados': 'Apartados',
  '/dashboard/metodos-pago': 'Métodos de pago',
  '/dashboard/transferencias': 'Transferencias',
  '/dashboard/sucursales': 'Sucursales',
  '/dashboard/usuarios': 'Usuarios',
  '/dashboard/perfil': 'Mi perfil',
  '/dashboard/solicitudes': 'Solicitudes',
};

const ROL_LABEL: Record<string, string> = {
  ADMIN_PRINCIPAL: 'Administrador Principal',
  DESARROLLO: 'Desarrollo',
  INVENTARIO: 'Inventario',
  VENTAS: 'Ventas',
  CONSULTA: 'Consulta',
};

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { usuario, logout } = useAuth();
  const { tema, alternarTema } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const titulo = TITULOS[pathname] || 'Camino al Deporte';
  const esInicio = pathname === '/dashboard';
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

  // Atajo global ⌘K / Ctrl K para abrir el buscador — funciona en
  // cualquier pantalla del panel, no solo cuando el input tiene foco.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscadorAbierto(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="flex h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card px-3 sm:px-6 sticky top-0 z-30">
      <Button variant="ghost" size="icon" onClick={onOpenMobileMenu} className="md:hidden">
        <Menu className="w-4 h-4" />
      </Button>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            Inicio
          </Link>
          {!esInicio && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">{titulo}</span>
            </>
          )}
        </nav>
      </div>

      {/* Buscador global — shell visual, abre el dialog de búsqueda */}
      <button
        onClick={() => setBuscadorAbierto(true)}
        className="hidden md:flex items-center gap-2 w-64 rounded-lg border border-border bg-secondary/60 px-3 h-9 text-sm text-muted-foreground hover:border-primary/40 hover:bg-secondary transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">Buscar productos, SKU, marca…</span>
        <kbd className="hidden lg:inline-flex items-center rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium">
          ⌘K
        </kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setBuscadorAbierto(true)}>
        <Search className="w-4 h-4" />
      </Button>
      <GlobalSearchDialog open={buscadorAbierto} onOpenChange={setBuscadorAbierto} />

      <BranchSelector />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            onClick={alternarTema}
          >
            {tema === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ayuda">
            <HelpCircle className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ayuda</TooltipContent>
      </Tooltip>

      {usuario && <NotificacionesBell />}

      {usuario && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium">{usuario.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {ROL_LABEL[usuario.rol] || usuario.rol}
                </span>
              </div>
              <Avatar>
                <AvatarFallback>{iniciales(usuario.nombre) || <UserIcon className="w-4 h-4" />}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span>{usuario.nombre}</span>
              <span className="text-xs font-normal text-muted-foreground">{usuario.email}</span>
              <Badge className="mt-1 w-fit">{ROL_LABEL[usuario.rol] || usuario.rol}</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/perfil')}>
              <Settings className="w-4 h-4" />
              Mi perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
