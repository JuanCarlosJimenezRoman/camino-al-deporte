'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, User as UserIcon, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificacionesBell } from '@/components/NotificacionesBell';
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
  const pathname = usePathname();
  const router = useRouter();
  const titulo = TITULOS[pathname] || 'Camino al Deporte';

  return (
    <header className="flex h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card px-3 sm:px-6 sticky top-0 z-30">
      <Button variant="ghost" size="icon" onClick={onOpenMobileMenu} className="md:hidden">
        <Menu className="w-4 h-4" />
      </Button>

      <div className="flex-1 min-w-0">
        <h1 className="text-sm sm:text-base font-semibold leading-none truncate">{titulo}</h1>
      </div>

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
