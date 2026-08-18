'use client';

import { claseBotonPrimario, claseBotonSecundario } from './ui';

export type Orden = 'recientes' | 'precioAsc' | 'precioDesc';

export interface EstadoFiltros {
  marcas: Set<string>;
  categorias: Set<string>;
  tallas: Set<string>;
  colores: Set<string>;
  precioMin: string;
  precioMax: string;
}

export function filtrosVacios(): EstadoFiltros {
  return {
    marcas: new Set(),
    categorias: new Set(),
    tallas: new Set(),
    colores: new Set(),
    precioMin: '',
    precioMax: '',
  };
}

export function contarFiltrosActivos(f: EstadoFiltros): number {
  return (
    f.marcas.size +
    f.categorias.size +
    f.tallas.size +
    f.colores.size +
    (f.precioMin ? 1 : 0) +
    (f.precioMax ? 1 : 0)
  );
}

function alternar(conjunto: Set<string>, valor: string): Set<string> {
  const copia = new Set(conjunto);
  if (copia.has(valor)) copia.delete(valor);
  else copia.add(valor);
  return copia;
}

function GrupoChips({
  titulo,
  opciones,
  seleccion,
  onCambiar,
}: {
  titulo: string;
  opciones: string[];
  seleccion: Set<string>;
  onCambiar: (nuevo: Set<string>) => void;
}) {
  if (!opciones.length) return null;
  return (
    <div className="border-b border-border py-5">
      <p className="mb-3 text-sm font-semibold">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        {opciones.map((op) => {
          const activo = seleccion.has(op);
          return (
            <button
              key={op}
              type="button"
              onClick={() => onCambiar(alternar(seleccion, op))}
              className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                activo ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground'
              }`}
            >
              {op}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FiltrosPanel({
  abierto,
  onClose,
  facetas,
  filtros,
  setFiltros,
  orden,
  setOrden,
  totalResultados,
}: {
  abierto: boolean;
  onClose: () => void;
  facetas: { marcas: string[]; categorias: string[]; tallas: string[]; colores: string[] };
  filtros: EstadoFiltros;
  setFiltros: (f: EstadoFiltros) => void;
  orden: Orden;
  setOrden: (o: Orden) => void;
  totalResultados: number;
}) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-background sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-bold uppercase tracking-wide">Filtrar y ordenar</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <div className="border-b border-border py-5">
            <p className="mb-3 text-sm font-semibold">Ordenar por</p>
            <div className="space-y-1">
              {(
                [
                  ['recientes', 'Más recientes'],
                  ['precioAsc', 'Precio: menor a mayor'],
                  ['precioDesc', 'Precio: mayor a menor'],
                ] as [Orden, string][]
              ).map(([valor, etiqueta]) => (
                <label key={valor} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 text-sm hover:bg-secondary/60">
                  <input
                    type="radio"
                    name="orden"
                    checked={orden === valor}
                    onChange={() => setOrden(valor)}
                    className="h-4 w-4 accent-foreground"
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
          </div>

          <GrupoChips
            titulo="Categoría"
            opciones={facetas.categorias}
            seleccion={filtros.categorias}
            onCambiar={(nuevo) => setFiltros({ ...filtros, categorias: nuevo })}
          />
          <GrupoChips
            titulo="Marca"
            opciones={facetas.marcas}
            seleccion={filtros.marcas}
            onCambiar={(nuevo) => setFiltros({ ...filtros, marcas: nuevo })}
          />
          <GrupoChips
            titulo="Talla"
            opciones={facetas.tallas}
            seleccion={filtros.tallas}
            onCambiar={(nuevo) => setFiltros({ ...filtros, tallas: nuevo })}
          />
          <GrupoChips
            titulo="Color"
            opciones={facetas.colores}
            seleccion={filtros.colores}
            onCambiar={(nuevo) => setFiltros({ ...filtros, colores: nuevo })}
          />

          <div className="py-5">
            <p className="mb-3 text-sm font-semibold">Precio</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Mín"
                value={filtros.precioMin}
                onChange={(e) => setFiltros({ ...filtros, precioMin: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground"
              />
              <span className="text-muted-foreground">—</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Máx"
                value={filtros.precioMax}
                onChange={(e) => setFiltros({ ...filtros, precioMax: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border p-5">
          <button className={`${claseBotonSecundario} flex-1`} onClick={() => setFiltros(filtrosVacios())}>
            Limpiar
          </button>
          <button className={`${claseBotonPrimario} flex-1`} onClick={onClose}>
            Ver {totalResultados} {totalResultados === 1 ? 'producto' : 'productos'}
          </button>
        </div>
      </div>
    </div>
  );
}
