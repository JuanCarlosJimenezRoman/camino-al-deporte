export type TipoSolicitud = 'MARCA' | 'CATEGORIA' | 'MODELO' | 'TALLA' | 'PROVEEDOR';
export type AccionSolicitud = 'EDITAR' | 'DESACTIVAR';
export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface PersonaSolicitud {
  id: number;
  nombre: string;
}

export interface Solicitud {
  id: number;
  tipo: TipoSolicitud;
  accion: AccionSolicitud;
  entidadId: number;
  entidadNombre: string | null;
  datosCambio: Record<string, unknown> | null;
  motivo: string | null;
  estado: EstadoSolicitud;
  solicitadoPor: PersonaSolicitud;
  solicitadoAt: string;
  revisadoPor: PersonaSolicitud | null;
  revisadoAt: string | null;
  notaRevision: string | null;
}

export const TIPO_LABEL: Record<TipoSolicitud, string> = {
  MARCA: 'Marca',
  CATEGORIA: 'Categoría',
  MODELO: 'Modelo',
  TALLA: 'Talla',
  PROVEEDOR: 'Proveedor',
};

export const ACCION_LABEL: Record<AccionSolicitud, string> = {
  EDITAR: 'Editar',
  DESACTIVAR: 'Desactivar',
};

export const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

export interface FiltroEstado {
  valor: EstadoSolicitud | '';
  etiqueta: string;
}

export const FILTROS_ESTADO: FiltroEstado[] = [
  { valor: 'PENDIENTE', etiqueta: 'Pendientes' },
  { valor: 'APROBADA', etiqueta: 'Aprobadas' },
  { valor: 'RECHAZADA', etiqueta: 'Rechazadas' },
  { valor: '', etiqueta: 'Todas' },
];