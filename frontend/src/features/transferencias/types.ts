export interface Sucursal {
  id: number;
  nombre: string;
}

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
}

export interface Variante {
  id: number;
  sku: string;
  color: string | null;
  talla: { valor: string } | null;
  producto: {
    id: number;
    nombre: string;
    marca?: { nombre: string } | null;
    imagenes?: { url: string; color?: string | null; esPrincipal?: boolean }[];
  };
}

export interface Existencia {
  id: number | null;
  sucursalId: number;
  proveedorId: number | null;
  proveedor: Proveedor | null;
  stockActual: number;
  variante: Variante;
}

export type EstadoTransferencia = 'SOLICITADA' | 'RECIBIDA' | 'CANCELADA';

export interface Transferencia {
  id: number;
  folio: string;
  cantidad: number;
  estado: EstadoTransferencia;
  createdAt: string;
  variante: {
    sku: string;
    color: string | null;
    producto: { nombre: string };
    talla: { valor: string } | null;
  };
  sucursalOrigen: { id: number; nombre: string };
  sucursalDestino: { id: number; nombre: string };
  solicitadoPor: { nombre: string } | null;
}

export interface ProductoAgrupado {
  productoId: number;
  nombre: string;
  skuRef: string;
  imagenUrl: string | null;
  marca: string | null;
  stockTotal: number;
  variantes: Existencia[];
}

export interface ItemTraspaso {
  key: string;
  existencia: Existencia;
  cantidad: number;
}

export interface CrearTransferenciaInput {
  varianteId: number;
  proveedorId: number | null;
  cantidad: number;
  sucursalOrigenId: number;
  sucursalDestinoId: number;
  notas?: string;
}