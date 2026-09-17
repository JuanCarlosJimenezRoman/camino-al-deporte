// Lógica de negocio pura del dominio Métodos de Pago.
// Sin React, sin fetch, sin acceso a UI.

import type { CuentaTransferencia, CuentaTransferenciaInput } from './types';

export function cuentaVacia(): CuentaTransferenciaInput {
  return { nombre: '', banco: '', titular: '', numeroCuenta: '' };
}

export function cuentaAEditForm(
  c: CuentaTransferencia
): Required<CuentaTransferenciaInput> {
  return {
    nombre: c.nombre,
    banco: c.banco ?? '',
    titular: c.titular ?? '',
    numeroCuenta: c.numeroCuenta ?? '',
  };
}

/**
 * Valida que un formulario de cuenta pueda enviarse. Devuelve el primer
 * error encontrado, o null si está OK.
 */
export function validarCuenta(input: CuentaTransferenciaInput): string | null {
  if (!input.nombre.trim()) return 'La etiqueta es obligatoria.';
  return null;
}

/**
 * Valida el monto de costo de envío. Regla: número >= 0. Devuelve el error
 * o null.
 */
export function validarCostoEnvio(valor: string): { ok: true; monto: number } | { ok: false; error: string } {
  const monto = Number(valor);
  if (Number.isNaN(monto) || monto < 0) {
    return { ok: false, error: 'Ingresa un monto válido.' };
  }
  return { ok: true, monto };
}

/**
 * ¿Cambió el formulario de WhatsApp respecto a lo guardado? Se usa para
 * deshabilitar el botón "Guardar" cuando no hay nada nuevo.
 */
export function whatsappSinCambios(
  numero: string,
  numeroGuardado: string,
  phoneNumberId: string,
  phoneNumberIdGuardado: string
): boolean {
  return numero === numeroGuardado && phoneNumberId === phoneNumberIdGuardado;
}

export function costoEnvioSinCambios(costoEnvio: string, costoEnvioGuardado: string): boolean {
  return costoEnvio === costoEnvioGuardado;
}

/**
 * Texto mostrado en la columna "Contacto" de la tabla de proveedores:
 * prefiere contacto, cae a teléfono, cae a em-dash.
 */
export function contactoProveedor(p: { contacto: string | null; telefono: string | null }): string {
  return p.contacto || p.telefono || '—';
}