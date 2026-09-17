// Acceso a datos del dominio Reportes.
// Envuelve lib/api.ts con funciones nombradas — nunca se llama api('/ruta')
// directo desde page.tsx, hooks ni componentes. Rutas: ver
// backend/src/routes/reportes.js (prefijo /reportes/ventas/*).

import { api, apiDownload } from '@/lib/api';
import type {
  DesgloseResponse,
  EstimacionResponse,
  MetodoPagoRow,
  ProveedorRendimientoRow,
  RangoFechas,
  ResumenResponse,
  SeriePunto,
  Sucursal,
  SucursalRow,
} from './types';

interface FiltroBase extends RangoFechas {
  sucursalId?: string;
}

function querystring(filtro: FiltroBase, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta, ...extra });
  if (filtro.sucursalId) params.set('sucursalId', filtro.sucursalId);
  return params.toString();
}

export async function listarSucursales(): Promise<Sucursal[]> {
  return api<Sucursal[]>('/sucursales');
}

export async function obtenerResumen(filtro: FiltroBase): Promise<ResumenResponse> {
  return api<ResumenResponse>(`/reportes/ventas/resumen?${querystring(filtro)}`);
}

export async function obtenerSerie(filtro: FiltroBase): Promise<SeriePunto[]> {
  const data = await api<{ serie: SeriePunto[] }>(`/reportes/ventas/serie?${querystring(filtro)}`);
  return data.serie;
}

export async function obtenerPorMetodoPago(filtro: FiltroBase): Promise<MetodoPagoRow[]> {
  const data = await api<{ porMetodoPago: MetodoPagoRow[] }>(`/reportes/ventas/por-metodo-pago?${querystring(filtro)}`);
  return data.porMetodoPago;
}

export async function obtenerPorSucursal(filtro: FiltroBase): Promise<SucursalRow[]> {
  const data = await api<{ porSucursal: SucursalRow[] }>(`/reportes/ventas/por-sucursal?${querystring(filtro)}`);
  return data.porSucursal;
}

export async function obtenerDesglose(filtro: FiltroBase, limite = 10): Promise<DesgloseResponse> {
  return api<DesgloseResponse>(`/reportes/ventas/desglose?${querystring(filtro, { limite: String(limite) })}`);
}

export async function obtenerPorProveedor(filtro: FiltroBase): Promise<ProveedorRendimientoRow[]> {
  const data = await api<{ porProveedor: ProveedorRendimientoRow[] }>(
    `/reportes/ventas/por-proveedor?${querystring(filtro)}`
  );
  return data.porProveedor;
}

export async function obtenerEstimacion(params: {
  horizonte: number;
  historialDias?: number;
  sucursalId?: string;
}): Promise<EstimacionResponse> {
  const qs = new URLSearchParams({
    horizonte: String(params.horizonte),
    historialDias: String(params.historialDias ?? 90),
  });
  if (params.sucursalId) qs.set('sucursalId', params.sucursalId);
  return api<EstimacionResponse>(`/reportes/ventas/estimacion?${qs.toString()}`);
}

export async function exportarReporte(filtro: FiltroBase): Promise<void> {
  return apiDownload(
    `/reportes/ventas/exportar?${querystring(filtro)}`,
    `reporte-ventas-${filtro.desde}-a-${filtro.hasta}.xlsx`
  );
}
