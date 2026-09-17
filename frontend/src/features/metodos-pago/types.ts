// Tipos de dominio del módulo de Métodos de Pago.
// Contrato con el backend:
//   - /catalogos/cuentas-transferencia  (ver routes/catalogos.js)
//   - /configuracion-tienda             (ver routes/configuracionTienda.js)
//   - /proveedores                      (ver routes/proveedores.js — reusado)

/**
 * Cuenta propia del negocio donde llegan transferencias (ventas, apartados,
 * tienda en línea). El flag paraVentasOnline decide si se ofrece al cliente
 * en el checkout.
 */
export interface CuentaTransferencia {
  id: number;
  nombre: string;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
  activo: boolean;
  paraVentasOnline: boolean;
}

export interface CuentaTransferenciaInput {
  nombre: string;
  banco?: string;
  titular?: string;
  numeroCuenta?: string;
}

/**
 * Subconjunto de ConfiguracionTienda que esta pantalla administra. El modelo
 * completo vive en schema.prisma; acá solo se tipan los campos que se editan
 * o leen desde /dashboard/metodos-pago.
 */
export interface ConfigTiendaMetodosPago {
  whatsappTienda: string | null;
  whatsappPhoneNumberId: string | null;
  costoEnvio: string | number;
  envioDinamicoActivo?: boolean;
}

export interface ConfigTiendaUpdate {
  whatsappTienda?: string | null;
  whatsappPhoneNumberId?: string | null;
  costoEnvio?: number;
  envioDinamicoActivo?: boolean;
}