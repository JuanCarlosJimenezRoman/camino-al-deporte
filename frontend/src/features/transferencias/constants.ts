import type { EstadoTransferencia } from './types';

export const ESTADO_TONO: Record<EstadoTransferencia, 'warning' | 'success' | 'destructive'> = {
  SOLICITADA: 'warning',
  RECIBIDA: 'success',
  CANCELADA: 'destructive',
};

export const ESTADO_LABEL: Record<EstadoTransferencia, string> = {
  SOLICITADA: 'En camino',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

export const FILTROS_ESTADO: { valor: EstadoTransferencia | ''; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'SOLICITADA', etiqueta: 'En camino' },
  { valor: 'RECIBIDA', etiqueta: 'Recibidas' },
  { valor: 'CANCELADA', etiqueta: 'Canceladas' },
];