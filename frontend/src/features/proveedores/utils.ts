// Lógica de negocio pura del dominio Proveedores.
// Sin React, sin fetch, sin acceso a UI. Todo testeable con input/output.

import type {
  MetodoPagoProveedor,
  Proveedor,
  ProveedorFormValues,
  RespuestaPendiente,
} from './types';
import { METODOS_PAGO } from './types';

export function proveedorVacio(): ProveedorFormValues {
  return {
    nombre: '',
    contacto: '',
    telefono: '',
    banco: '',
    titular: '',
    numeroCuenta: '',
    notas: '',
  };
}

export function proveedorAFormValues(p: Proveedor): ProveedorFormValues {
  return {
    nombre: p.nombre,
    contacto: p.contacto ?? '',
    telefono: p.telefono ?? '',
    banco: p.banco ?? '',
    titular: p.titular ?? '',
    numeroCuenta: p.numeroCuenta ?? '',
    notas: p.notas ?? '',
  };
}

/**
 * Detecta si la respuesta del backend es una solicitud pendiente de
 * aprobación (202) en lugar del recurso actualizado.
 */
export function esPendiente(resultado: unknown): resultado is RespuestaPendiente {
  return (
    !!resultado &&
    typeof resultado === 'object' &&
    (resultado as RespuestaPendiente).pendiente === true
  );
}

export function validarProveedor(v: ProveedorFormValues): string | null {
  if (!v.nombre.trim()) return 'El nombre es obligatorio.';
  return null;
}

export function etiquetaMetodoPago(m: MetodoPagoProveedor): string {
  return METODOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? m;
}

export function formatearCuenta(
  banco: string | null,
  numeroCuenta: string | null
): string {
  if (!numeroCuenta) return '—';
  return `${banco ?? ''} ${numeroCuenta}`.trim();
}

/**
 * Falta comprobante solo si el método es TRANSFERENCIA y no se adjuntó foto.
 */
export function requiereComprobante(
  metodoPago: MetodoPagoProveedor,
  comprobante: File | null
): boolean {
  return metodoPago === 'TRANSFERENCIA' && !comprobante;
}