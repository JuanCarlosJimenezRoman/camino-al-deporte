import { api } from '@/lib/api';
import type { ActualizarWhatsappInput, ExistenciaDetalle, NuevaSucursalInput, Sucursal } from './types';

export function listarSucursales() {
  return api<Sucursal[]>('/sucursales');
}

export function obtenerExistenciasSucursal(id: number) {
  return api<{ existencias: ExistenciaDetalle[] }>(`/sucursales/${id}`);
}

export function crearSucursal(data: NuevaSucursalInput) {
  return api('/sucursales', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function actualizarWhatsappSucursal(id: number, data: ActualizarWhatsappInput) {
  return api(`/sucursales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
