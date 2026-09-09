import { imagenPrincipal } from '@/components/admin/ProductoThumb';
import type { Existencia, ProductoAgrupado, Transferencia } from './types';

export function claveExistencia(e: Existencia) {
  return `${e.variante.id}:${e.proveedorId ?? 'null'}`;
}

export function agruparPorProducto(lista: Existencia[]): ProductoAgrupado[] {
  const mapa = new Map<number, ProductoAgrupado>();
  for (const e of lista) {
    const p = e.variante.producto;
    const existente = mapa.get(p.id);
    if (existente) {
      existente.stockTotal += e.stockActual;
      existente.variantes.push(e);
    } else {
      mapa.set(p.id, {
        productoId: p.id,
        nombre: p.nombre,
        skuRef: e.variante.sku,
        imagenUrl: imagenPrincipal(p, e.variante.color),
        marca: p.marca?.nombre ?? null,
        stockTotal: e.stockActual,
        variantes: [e],
      });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function etiquetasVariantes(variantes: Existencia[]): Map<string, string> {
  const base = variantes.map((v) => v.variante.talla?.valor ?? v.variante.color ?? 'Único');
  const conteo = new Map<string, number>();
  base.forEach((b) => conteo.set(b, (conteo.get(b) ?? 0) + 1));
  const etiquetas = new Map<string, string>();
  variantes.forEach((v, i) => {
    const b = base[i];
    const repetida = (conteo.get(b) ?? 0) > 1;
    etiquetas.set(
      claveExistencia(v),
      repetida ? `${b} · ${v.proveedor?.nombre ?? 'sin proveedor'}` : b
    );
  });
  return etiquetas;
}

export function filtrarTransferencias(
  transferencias: Transferencia[],
  busqueda: string
): Transferencia[] {
  const q = busqueda.trim().toLowerCase();
  if (!q) return transferencias;
  return transferencias.filter((t) =>
    t.folio.toLowerCase().includes(q) ||
    t.variante.producto.nombre.toLowerCase().includes(q) ||
    t.variante.sku.toLowerCase().includes(q) ||
    t.sucursalOrigen.nombre.toLowerCase().includes(q) ||
    t.sucursalDestino.nombre.toLowerCase().includes(q)
  );
}