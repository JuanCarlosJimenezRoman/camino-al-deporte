// Tipos de dominio del módulo de Proveedores.
// Contrato con el backend (ver backend/src/routes/proveedores.js).

export interface Proveedor {
  id: number;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  banco: string | null;
  titular: string | null;
  numeroCuenta: string | null;
  notas: string | null;
  activo: boolean;
}

export type MetodoPagoProveedor = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

export interface PagoProveedor {
  id: number;
  monto: string;
  metodoPago: MetodoPagoProveedor;
  concepto: string | null;
  comprobanteUrl: string | null;
  registradoPor: { nombre: string };
  createdAt: string;
}

export interface VarianteDeProveedor {
  id: number;
  sku: string;
  talla: { valor: string } | null;
  producto: { nombre: string };
}

export interface ProveedorDetalle extends Proveedor {
  variantes: VarianteDeProveedor[];
  pagos: PagoProveedor[];
  totalPagado: number;
}

/**
 * Cuando INVENTARIO edita o desactiva un proveedor, el backend no lo aplica:
 * crea una solicitud pendiente de aprobación y responde 202 con esta forma
 * en vez del proveedor actualizado (ver routes/proveedores.js).
 */
export interface RespuestaPendiente {
  pendiente: true;
  mensaje: string;
}

export interface ProveedorFormValues {
  nombre: string;
  contacto: string;
  telefono: string;
  banco: string;
  titular: string;
  numeroCuenta: string;
  notas: string;
}

export interface NuevoPagoInput {
  monto: number;
  metodoPago: MetodoPagoProveedor;
  concepto?: string;
  comprobante?: File | null;
}

export const METODOS_PAGO: ReadonlyArray<{ valor: MetodoPagoProveedor; etiqueta: string }> = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
] as const;