import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { imagenCatalogo, imagenPortadaCategoria } from '@/lib/imagenCloudinary';
import { claseOjo, claseTituloSeccion } from './ui';

export interface CategoriaConImagen {
  nombre: string;
  cantidad: number;
  // Portada elegida a mano para esta categoría (panel admin → Catálogo →
  // Categorías). Cuando existe, se recorta a propósito para llenar la
  // tarjeta (ver imagenPortadaCategoria) — quien la subió ya la eligió
  // pensando en este encuadre.
  imagenPortada?: string | null;
  // Respaldo mientras la categoría no tenga portada propia: foto de un
  // producto real de esa categoría. Nunca se recorta (ver imagenCatalogo,
  // que además rellena a cuadro con blanco), así que puede verse con
  // franjas o descentrada dentro de una tarjeta 4:5 — es un respaldo, no el
  // resultado final esperado.
  imagenProductoRespaldo?: string;
}

// "Explora por categoría" (sección 11). Cada tarjeta usa, en orden de
// preferencia: la portada que el panel admin le haya asignado a la
// categoría, o si no hay ninguna, la foto de un producto real de esa
// categoría — si tampoco hay eso, la tarjeta cae a un fondo plano con el
// nombre, nunca a una imagen inventada.
export function CategoryGrid({ categorias }: { categorias: CategoriaConImagen[] }) {
  if (categorias.length === 0) return null;

  return (
    <section className="py-8 sm:py-10">
      <p className={claseOjo}>Explora por categoría</p>
      <h2 className={`mt-1 ${claseTituloSeccion}`}>Encuentra tu disciplina</h2>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {categorias.map((c) => (
          <Link
            key={c.nombre}
            href={`/tienda/productos?categoria=${encodeURIComponent(c.nombre)}`}
            className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-secondary"
          >
            {c.imagenPortada ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagenPortadaCategoria(c.imagenPortada, 500)}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              />
            ) : c.imagenProductoRespaldo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagenCatalogo(c.imagenProductoRespaldo, 500)}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-secondary to-border" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0 transition-opacity duration-150 group-hover:from-black/65" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3.5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-white">{c.nombre}</p>
                <p className="text-[11px] text-white/75">
                  {c.cantidad} {c.cantidad === 1 ? 'producto' : 'productos'}
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
