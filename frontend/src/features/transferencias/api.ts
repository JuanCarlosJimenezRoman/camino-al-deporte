import { api } from '@/lib/api';
import type { Categoria, CrearTransferenciaInput, Existencia, Sucursal, Transferencia } from './types';

export function listarSucursales() {
  return api<Sucursal[]>('/sucursales');
}

export function listarCategorias() {
  return api<Categoria[]>('/catalogos/categorias');
}

export function listarExistencias(params: {
  sucursalId: string;
  categoriaId?: string;
  skuOProducto?: string;
}) {
  const query = new URLSearchParams();
  query.set('sucursalId', params.sucursalId);
  if (params.categoriaId) query.set('categoriaId', params.categoriaId);
  if (params.skuOProducto) query.set('skuOProducto', params.skuOProducto);
  return api<Existencia[]>(`/inventario/existencias?${query.toString()}`);
}

export function listarTransferencias(params?: {
  estado?: string;
  sucursalId?: string;
}) {
  const query = new URLSearchParams();
  if (params?.estado) query.set('estado', params.estado);
  if (params?.sucursalId) query.set('sucursalId', params.sucursalId);
  const qs = query.toString();
  return api<Transferencia[]>(`/transferencias${qs ? `?${qs}` : ''}`);
}

export function crearTransferencia(data: CrearTransferenciaInput) {
  return api('/transferencias', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function recibirTransferencia(id: number) {
  return api(`/transferencias/${id}/recibir`, { method: 'POST' });
}

export function cancelarTransferencia(id: number) {
  return api(`/transferencias/${id}/cancelar`, { method: 'POST' });
}