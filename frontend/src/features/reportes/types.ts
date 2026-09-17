// Tipos de dominio del módulo de Reportes.
// Fuente de verdad del contrato con el backend: backend/src/routes/reportes.js
// (prefijo /reportes/ventas/*). Reflejan literalmente lo que cada ruta
// responde — no se agregan campos especulativos.

export interface Sucursal {
  id: number;
  nombre: string;
}

export interface ResumenMetricas {
  totalVentas: number;
  totalMonto: number;
  totalDescuentos: number;
  ticketPromedio: number;
}

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface ResumenResponse {
  periodo: Periodo;
  periodoAnterior: Periodo;
  actual: ResumenMetricas;
  anterior: ResumenMetricas;
  variacion: { monto: number | null; ventas: number | null; ticketPromedio: number | null };
}

export interface SeriePunto {
  fecha: string;
  ventas: number;
  monto: number;
}

export interface MetodoPagoRow {
  metodo: string;
  etiqueta: string;
  ventas: number;
  monto: number;
}

export interface SucursalRow {
  sucursalId: number;
  nombre: string;
  ventas: number;
  monto: number;
}

export interface DesgloseItem {
  id?: number | null;
  nombre?: string;
  valor?: string;
  tipo?: string;
  cantidad: number;
  monto: number;
}

export interface DesgloseResponse {
  topProductos: DesgloseItem[];
  porMarca: DesgloseItem[];
  porCategoria: DesgloseItem[];
  porTalla: DesgloseItem[];
  porProveedor: DesgloseItem[];
}

export interface ProveedorRendimientoRow {
  id: number | null;
  nombre: string;
  cantidadIngresada: number;
  cantidadVendida: number;
  montoVendido: number;
  // Piezas vendidas / piezas ingresadas, en %. null cuando no hubo entradas
  // registradas de ese proveedor en el periodo (no hay denominador).
  tasaVenta: number | null;
}

export interface EstimacionResponse {
  historico: SeriePunto[];
  suficienteDatos: boolean;
  promedioDiarioHistorico: number;
  tendencia: { direccion: 'creciendo' | 'bajando' | 'estable'; cambioSemanalPct: number };
  totalProyectado: number;
  proyeccion: { fecha: string; monto: number }[];
  nota: string;
}

// Un punto del gráfico de estimación trae SOLO "real" (histórico) o SOLO
// "estimado" (proyección) — excepto el último día histórico, que trae
// ambos para que la línea punteada arranque conectada a la línea sólida.
export interface PuntoProyeccion {
  fecha: string;
  real?: number;
  estimado?: number;
}

export type PresetRango = 'hoy' | '7d' | '30d' | 'mes' | 'mesPasado' | 'personalizado';

export interface RangoFechas {
  desde: string;
  hasta: string;
}
