import { api, apiUpload, apiPostBlob } from '@/lib/api';
import type {
  ConfiguracionTienda,
  GuardarConfiguracionTicketPayload,
  GuardarIdentidadPayload,
  SubirLogoResponse,
  VistaPreviaTicketPayload,
} from './types';

export function obtenerConfiguracionTienda(): Promise<ConfiguracionTienda> {
  return api<ConfiguracionTienda>('/configuracion-tienda');
}

export function guardarIdentidad(
  payload: GuardarIdentidadPayload,
): Promise<unknown> {
  return api('/configuracion-tienda', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function guardarConfiguracionTicket(
  payload: GuardarConfiguracionTicketPayload,
): Promise<unknown> {
  return api('/configuracion-tienda', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function subirLogo(archivo: File): Promise<SubirLogoResponse> {
  const formData = new FormData();
  formData.append('logo', archivo);

  return apiUpload<SubirLogoResponse>(
    '/configuracion-tienda/logo',
    formData,
  );
}

export function quitarLogo(): Promise<unknown> {
  return api('/configuracion-tienda/logo', {
    method: 'DELETE',
  });
}

export function generarVistaPreviaTicket(
  payload: VistaPreviaTicketPayload,
): Promise<Blob> {
  return apiPostBlob(
    '/configuracion-tienda/vista-previa-ticket',
    payload,
  );
}