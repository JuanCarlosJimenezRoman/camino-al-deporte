import type { Rol, Usuario } from '@/lib/auth';
import { ESTADO_LABEL, type EstadoSolicitud } from './types';

/**
 * Solo ADMIN_PRINCIPAL y DESARROLLO pueden aprobar/rechazar solicitudes.
 * Se centraliza aquí para que cualquier punto de la UI use la misma regla.
 */
export function puedeAdministrarSolicitudes(usuario: Usuario | null | undefined): boolean {
  if (!usuario) return false;
  const rol = usuario.rol as Rol;
  return rol === 'ADMIN_PRINCIPAL' || rol === 'DESARROLLO';
}

/**
 * Convierte el objeto de cambios propuestos en un texto legible para la
 * columna "Cambio" de la tabla. Los `null` se muestran como "—" para
 * distinguirlos de la cadena vacía.
 */
export function formatoCampos(datos: Record<string, unknown> | null): string | null {
  if (!datos) return null;
  return Object.entries(datos)
    .map(([clave, valor]) => `${clave}: ${valor === null ? '—' : String(valor)}`)
    .join(', ');
}

/**
 * Texto del estado vacío de la tabla. Se aísla porque depende de dos
 * variables (filtro activo y visibilidad de columnas) y se reutiliza en
 * más de un lugar si en el futuro se agregan vistas alternativas.
 */
export function mensajeSinSolicitudes(filtro: EstadoSolicitud | ''): string {
  return `Sin solicitudes${filtro ? ` ${ESTADO_LABEL[filtro].toLowerCase()}` : ''}.`;
}