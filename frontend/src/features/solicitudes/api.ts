import { api } from '@/lib/api';
import type { EstadoSolicitud, Solicitud } from './types';

/** Lista solicitudes, opcionalmente filtrando por estado. */
export async function listarSolicitudes(filtro: EstadoSolicitud | '' = ''): Promise<Solicitud[]> {
  const qs = filtro ? `?estado=${filtro}` : '';
  return api<Solicitud[]>(`/solicitudes${qs}`);
}

/** Aprueba una solicitud pendiente; el backend aplica el cambio. */
export async function aprobarSolicitud(id: number): Promise<void> {
  await api(`/solicitudes/${id}/aprobar`, { method: 'POST' });
}

/** Rechaza una solicitud pendiente con una nota opcional de revisión. */
export async function rechazarSolicitud(id: number, notaRevision?: string): Promise<void> {
  await api(`/solicitudes/${id}/rechazar`, {
    method: 'POST',
    body: JSON.stringify({ notaRevision: notaRevision || undefined }),
  });
}