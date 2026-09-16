import type { Resena, ResenaPedido } from './types';

/**
 * Promedio de calificación de producto sobre el conjunto recibido.
 * Devuelve 0 si la lista está vacía (mismo comportamiento que el
 * cálculo inline original).
 */
export function promedioCalificacionProducto(resenas: Resena[]): number {
  if (!resenas.length) return 0;
  return resenas.reduce((acc, r) => acc + r.calificacionProducto, 0) / resenas.length;
}

/** Promedio de calificación de envío sobre el conjunto recibido. */
export function promedioCalificacionEnvio(resenas: Resena[]): number {
  if (!resenas.length) return 0;
  return resenas.reduce((acc, r) => acc + r.calificacionEnvio, 0) / resenas.length;
}

/**
 * Nombre a mostrar como autor de la reseña. El backend expone `cliente`
 * como null cuando no hay cliente registrado asociado al pedido; en ese
 * caso mostramos un genérico.
 */
export function nombreCliente(pedido: ResenaPedido): string {
  return pedido.cliente?.nombre || 'Cliente';
}

/**
 * Lista de nombres de producto separados por coma — útil para el
 * subtítulo "Cliente · Producto A, Producto B" de cada reseña.
 */
export function nombresProductos(pedido: ResenaPedido): string {
  return pedido.items.map((it) => it.variante.producto.nombre).join(', ');
}

/** Etiqueta del botón de visibilidad según el estado actual de la reseña. */
export function etiquetaBotonVisibilidad(visible: boolean): string {
  return visible ? 'Ocultar de la tienda' : 'Publicar en la tienda';
}