// Sub-hook: bloque "Cuentas de proveedores" (solo lectura).
// El dominio real es `proveedores` — este hook vive acá porque la pantalla
// lo embebe, pero reusa el tipo desde features/proveedores/types.

'use client';

import { useEffect, useState } from 'react';
import { listarProveedores } from '@/features/proveedores/api';
import type { Proveedor } from '@/features/proveedores/types';

export interface UseProveedoresCuentasReturn {
  proveedores: Proveedor[];
  cargando: boolean;
}

export function useProveedoresCuentas(enabled: boolean = true): UseProveedoresCuentasReturn {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setCargando(false);
      return;
    }
    listarProveedores(true)
      .then(setProveedores)
      .finally(() => setCargando(false));
  }, [enabled]);

  return { proveedores, cargando };
}