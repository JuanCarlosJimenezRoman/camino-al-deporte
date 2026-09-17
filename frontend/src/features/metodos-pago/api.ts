// Acceso a datos del dominio Métodos de Pago.
// Tres bloques de endpoints: cuentas propias, config de tienda, proveedores.

import { api } from '@/lib/api';
import type {
  ConfigTiendaMetodosPago,
  ConfigTiendaUpdate,
  CuentaTransferencia,
  CuentaTransferenciaInput,
} from './types';

// --- Cuentas de transferencia (propias) ----------------------------------

export async function listarCuentasTransferencia(
  incluirInactivas = true
): Promise<CuentaTransferencia[]> {
  const qs = incluirInactivas ? '?todas=1' : '';
  return api<CuentaTransferencia[]>(`/catalogos/cuentas-transferencia${qs}`);
}

export async function crearCuentaTransferencia(
  input: CuentaTransferenciaInput
): Promise<CuentaTransferencia> {
  return api<CuentaTransferencia>('/catalogos/cuentas-transferencia', {
    method: 'POST',
    body: JSON.stringify(limpiarCuentaInput(input)),
  });
}

export async function actualizarCuentaTransferencia(
  id: number,
  input: Partial<CuentaTransferenciaInput> & { activo?: boolean; paraVentasOnline?: boolean }
): Promise<CuentaTransferencia> {
  return api<CuentaTransferencia>(`/catalogos/cuentas-transferencia/${id}`, {
    method: 'PUT',
    body: JSON.stringify(limpiarCuentaInput(input)),
  });
}

// --- Configuración de tienda (solo los campos que esta pantalla usa) -----

export async function obtenerConfigTienda(): Promise<ConfigTiendaMetodosPago> {
  return api<ConfigTiendaMetodosPago>('/configuracion-tienda');
}

export async function actualizarConfigTienda(
  input: ConfigTiendaUpdate
): Promise<ConfigTiendaMetodosPago> {
  return api<ConfigTiendaMetodosPago>('/configuracion-tienda', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

// Helper: normaliza campos de cuenta antes de mandarlos al backend
// (undefined en lugar de '' para no pisar valores existentes con vacío).
function limpiarCuentaInput<T extends Partial<CuentaTransferenciaInput>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) out[k] = trimmed;
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}