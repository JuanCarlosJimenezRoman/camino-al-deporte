import { api } from '@/lib/api';
import type { ActualizarUsuarioInput, NuevoUsuarioInput, Sucursal, Usuario } from './types';

export function listarUsuarios() {
  return api<Usuario[]>('/usuarios');
}

// Nota: esta pantalla también necesita el catálogo de sucursales para el
// selector. Si más adelante se migra una pantalla de "sucursales" a su
// propio feature, esta función puede moverse a features/sucursales/api.ts
// y reutilizarse desde aquí.
export function listarSucursales() {
  return api<Sucursal[]>('/sucursales');
}

export function crearUsuario(data: NuevoUsuarioInput) {
  return api('/usuarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function actualizarUsuario(id: number, data: ActualizarUsuarioInput) {
  return api(`/usuarios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
