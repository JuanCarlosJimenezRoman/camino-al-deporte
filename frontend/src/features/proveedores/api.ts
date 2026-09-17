// Acceso a datos del dominio Proveedores.
// Envuelve lib/api.ts con funciones nombradas — nunca se llama api('/ruta')
// directo desde page.tsx, hooks ni componentes.

import { api, apiUpload } from '@/lib/api';
import type {
  NuevoPagoInput,
  PagoProveedor,
  Proveedor,
  ProveedorDetalle,
  ProveedorFormValues,
  RespuestaPendiente,
} from './types';

export async function listarProveedores(incluirInactivos = true): Promise<Proveedor[]> {
  const qs = incluirInactivos ? '?todas=1' : '';
  return api<Proveedor[]>(`/proveedores${qs}`);
}

export async function obtenerProveedor(id: number): Promise<ProveedorDetalle> {
  return api<ProveedorDetalle>(`/proveedores/${id}`);
}

export async function crearProveedor(datos: ProveedorFormValues): Promise<Proveedor> {
  return api<Proveedor>('/proveedores', {
    method: 'POST',
    body: JSON.stringify(limpiarFormValues(datos)),
  });
}

export async function actualizarProveedor(
  id: number,
  datos: Partial<ProveedorFormValues & { activo: boolean }>
): Promise<Proveedor | RespuestaPendiente> {
  return api(`/proveedores/${id}`, {
    method: 'PUT',
    body: JSON.stringify(datos),
  });
}

export async function registrarPagoProveedor(
  id: number,
  input: NuevoPagoInput
): Promise<PagoProveedor> {
  const formData = new FormData();
  formData.append(
    'datos',
    JSON.stringify({
      monto: input.monto,
      metodoPago: input.metodoPago,
      concepto: input.concepto || undefined,
    })
  );
  if (input.comprobante) formData.append('comprobante', input.comprobante);
  return apiUpload<PagoProveedor>(`/proveedores/${id}/pagos`, formData);
}

// Helpers locales: no son lógica de negocio, solo normalizan el shape que
// se manda al backend (undefined en lugar de '' para campos opcionales).
function limpiarFormValues(v: ProveedorFormValues) {
  return {
    nombre: v.nombre.trim(),
    contacto: v.contacto || undefined,
    telefono: v.telefono || undefined,
    banco: v.banco || undefined,
    titular: v.titular || undefined,
    numeroCuenta: v.numeroCuenta || undefined,
    notas: v.notas || undefined,
  };
}