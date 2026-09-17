// Hook compuesto del dominio Métodos de Pago.
// page.tsx consume SOLO este hook y le pasa los sub-objetos a los
// componentes de vista.

'use client';

import { useAuth, puedeVer } from '@/lib/auth';
import { useConfigTienda, type UseConfigTiendaReturn } from './useconfigtienda';
import { useCuentasTransferencia, type UseCuentasTransferenciaReturn } from './usecuentastransferencia';
import { useProveedoresCuentas, type UseProveedoresCuentasReturn } from './useproveedorescuentas';

export interface UseMetodosPagoReturn {
  // Permisos resueltos (evita que page.tsx toque useAuth directo)
  puedeVerSeccion: boolean;
  puedeVerProveedores: boolean;

  // Sub-bloques
  config: UseConfigTiendaReturn;
  cuentas: UseCuentasTransferenciaReturn;
  proveedoresCuentas: UseProveedoresCuentasReturn;
}

export function useMetodosPago(): UseMetodosPagoReturn {
  const { usuario } = useAuth();
  const rol = usuario?.rol;

  const puedeVerSeccion = puedeVer('cuentasTransferencia', rol);
  const puedeVerProveedores = puedeVer('proveedores', rol);

  // Cada sub-hook recibe su propio permiso y solo dispara su fetch cuando
  // corresponde: evita pedir datos que el usuario no tiene permiso de ver.
  const config = useConfigTienda(puedeVerSeccion);
  const cuentas = useCuentasTransferencia(puedeVerSeccion);
  const proveedoresCuentas = useProveedoresCuentas(puedeVerSeccion && puedeVerProveedores);

  return {
    puedeVerSeccion,
    puedeVerProveedores,
    config,
    cuentas,
    proveedoresCuentas,
  };
}