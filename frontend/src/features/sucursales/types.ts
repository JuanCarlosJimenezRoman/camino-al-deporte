// Nota: este `Sucursal` (entidad completa, con dirección/whatsapp/etc.) es
// más grande que el `Sucursal` que usa features/usuarios (solo id+nombre,
// para un selector). Son formas distintas de la misma entidad de backend,
// así que por ahora se mantienen separadas — se promoverían a un
// src/types/sucursal.ts compartido solo si un tercer feature necesita
// exactamente la misma forma completa (ver regla de las 2 veces en
// docs/ARQUITECTURA_FRONTEND.md).
export interface Sucursal {
  id: number;
  nombre: string;
  codigo: string | null;
  direccion: string | null;
  // WhatsApp propio de la sucursal, usado como remitente del ticket digital
  // de compra. Si una sucursal no tiene uno capturado, el ticket cae al
  // WhatsApp general de la tienda (ver /dashboard/metodos-pago).
  telefono: string | null;
  // ID técnico que da Meta al conectar ese número a WhatsApp Business
  // Platform (Cloud API) — con esto el ticket se manda solo, sin que el
  // cajero tenga que abrir WhatsApp. No es el número visible de arriba.
  whatsappPhoneNumberId: string | null;
  esBodegaCentral: boolean;
}

export interface ExistenciaDetalle {
  id: number;
  stockActual: number;
  stockMinimo: number;
  variante: {
    sku: string;
    talla: { valor: string } | null;
    producto: { nombre: string; marca: { nombre: string }; categoria: { nombre: string } };
  };
}

export interface NuevaSucursalInput {
  nombre: string;
  codigo?: string;
  direccion?: string;
  telefono?: string;
}

export interface ActualizarWhatsappInput {
  telefono: string | null;
  whatsappPhoneNumberId: string | null;
}
