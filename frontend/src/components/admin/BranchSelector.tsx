'use client';

import { Check, ChevronDown, Store } from 'lucide-react';
import { useBranch } from '@/lib/branchContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

/**
 * Selector de sucursal del topbar — solo para vistas de consulta
 * (Inventario, Reportes, y a futuro Productos). No afecta Ventas ni
 * Apartados, que conservan su propio selector transaccional. Ver
 * lib/branchContext.tsx.
 */
export function BranchSelector() {
  const { sucursales, sucursalId, setSucursalId, sucursalActual, cargando, puedeVerTodas } = useBranch();

  // Si el usuario no es admin y solo hay una sucursal para elegir, no tiene
  // sentido mostrar un selector (no hay nada que cambiar).
  if (cargando || sucursales.length === 0) return null;
  if (!puedeVerTodas && sucursales.length <= 1) return null;

  const etiqueta = sucursalId === null ? 'Todas las sucursales' : sucursalActual?.nombre ?? 'Sucursal';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border px-2.5 h-9 text-sm font-medium hover:bg-secondary transition-colors max-w-[180px]">
          <Store className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate">{etiqueta}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sucursal</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {puedeVerTodas && (
          <DropdownMenuItem onClick={() => setSucursalId(null)} className="justify-between">
            Todas las sucursales
            {sucursalId === null && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        )}
        {sucursales.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => setSucursalId(s.id)} className="justify-between">
            {s.nombre}
            {sucursalId === s.id && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
