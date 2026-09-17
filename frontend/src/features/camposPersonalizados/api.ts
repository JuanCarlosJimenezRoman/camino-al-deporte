import { api } from '@/lib/api';
import {
  CampoPersonalizado,
  EdicionCampoPayload,
  NuevoCampoPayload,
} from './types';

const BASE = '/catalogos/campos-personalizados';

/**
 * Trae TODOS los campos (activos e inactivos) — el admin necesita ver
 * los desactivados para poder reactivarlos.
 */
export function listarCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  return api<CampoPersonalizado[]>(`${BASE}?todos=1`);
}

export function crearCampoPersonalizado(
  payload: NuevoCampoPayload
): Promise<CampoPersonalizado> {
  return api<CampoPersonalizado>(BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function actualizarCampoPersonalizado(
  id: number,
  payload: EdicionCampoPayload
): Promise<CampoPersonalizado> {
  return api<CampoPersonalizado>(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Activar/desactivar es un PUT parcial: solo mandamos `{ activo }`.
 * Se separa de `actualizarCampoPersonalizado` (que exige el payload
 * completo de edición) para que quede explícito en el call site.
 */
export function cambiarActivoCampoPersonalizado(
  id: number,
  activo: boolean
): Promise<CampoPersonalizado> {
  return api<CampoPersonalizado>(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ activo }),
  });
}