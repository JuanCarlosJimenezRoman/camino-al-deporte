import { api } from '@/lib/api';
import type { Resena } from './types';

/** Lista todas las reseñas de pedidos en línea (para moderación). */
export async function listarResenas(): Promise<Resena[]> {
  return api<Resena[]>('/resenas');
}

/** Cambia la visibilidad pública de una reseña en la tienda. */
export async function actualizarVisibilidadResena(id: number, visible: boolean): Promise<void> {
  await api(`/resenas/${id}/visibilidad`, {
    method: 'PUT',
    body: JSON.stringify({ visible }),
  });
}