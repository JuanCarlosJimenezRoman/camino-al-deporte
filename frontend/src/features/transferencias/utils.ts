import { imagenPrincipal } from '@/components/admin/ProductoThumb';
import { ZONA_HORARIA_NEGOCIO } from '@/lib/utils';
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

// Folio de lote: se genera UNA vez por cada "Enviar N traspasos" y se le pone
// a todas las transferencias de ese envío (POST /transferencias → loteFolio),
// para poder reportarlas juntas. Ej. "L-20260920-093015-K3F".
export function generarFolioLote(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const fecha = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const hora = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const azar = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');
  return `L-${fecha}-${hora}-${azar}`;
}

/** Hoy (YYYY-MM-DD) según el reloj de pared del negocio, no el UTC. */
export function hoyNegocioISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_NEGOCIO }).format(new Date());
}

export interface LoteResumen {
  folio: string;
  creadoAt: string;
  traspasos: number;
  piezas: number;
  rutas: string[];
}

/** Agrupa el historial por loteFolio (ignora las transferencias sin lote),
 * del más reciente al más antiguo. Las piezas canceladas no se suman. */
export function agruparLotes(transferencias: Transferencia[]): LoteResumen[] {
  const mapa = new Map<string, LoteResumen>();
  for (const t of transferencias) {
    if (!t.loteFolio) continue;
    const ruta = `${t.sucursalOrigen.nombre} → ${t.sucursalDestino.nombre}`;
    const lote = mapa.get(t.loteFolio);
    const piezas = t.estado === 'CANCELADA' ? 0 : t.cantidad;
    if (!lote) {
      mapa.set(t.loteFolio, { folio: t.loteFolio, creadoAt: t.createdAt, traspasos: 1, piezas, rutas: [ruta] });
    } else {
      lote.traspasos += 1;
      lote.piezas += piezas;
      if (!lote.rutas.includes(ruta)) lote.rutas.push(ruta);
      if (t.createdAt < lote.creadoAt) lote.creadoAt = t.createdAt;
    }
  }
  return [...mapa.values()].sort((a, b) => (a.creadoAt < b.creadoAt ? 1 : -1));
}
