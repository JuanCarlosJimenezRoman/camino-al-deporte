import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { imagenProducto } from '@/lib/imagenCloudinary';
import { ProductoCatalogo } from '@/lib/catalogo';
import { claseBotonPrimario, claseBotonSecundario } from './ui';

// Hero del catálogo (sección 10 del brief): sin banners genéricos ni
// imágenes inventadas — usa la fotografía real de un producto del catálogo
// (el primero con foto e inventario) como la única "imagen de portada". Si
// el catálogo no tiene ningún producto con foto todavía, se muestra solo el
// bloque de texto en vez de forzar un placeholder o una imagen de stock.
//
// Rediseño "deportivo premium": el dorado (#F2BA52) es protagonista con
// acentos sobre una superficie que ADAPTA al tema — crema cálido en claro
// (bg-secondary) y tinta cálida en oscuro — para no desentonar con el resto
// de la tienda al alternar entre modo claro/oscuro. El titular es grande y
// en mayúsculas, el CTA lleva gradiente dorado, y la foto va con un halo
// dorado que la hace flotar.
export function HomeHero({ productoDestacado }: { productoDestacado: ProductoCatalogo | null }) {
  const imagen = productoDestacado?.imagenes?.[0]?.url;

  return (
    <section className="-mt-6 pb-8 pt-0 sm:mt-0 sm:pb-12 sm:pt-4 lg:pb-14">
      <div className="relative overflow-hidden rounded-[2rem] bg-secondary px-6 py-10 text-foreground sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        {/* Acentos decorativos: orbes dorados desenfocados + grano de borde */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-bronze/40 blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-gold/20"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-bronze dark:text-gold">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Camino al Deporte
            </span>

            <h1 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Encuentra tu{' '}
              <span className="text-bronze dark:bg-gradient-to-r dark:from-gold dark:via-gold dark:to-bronze dark:bg-clip-text dark:text-transparent">
                próximo par.
              </span>
            </h1>

            <p className="mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
              Tenis y equipo deportivo para correr, entrenar, competir y disfrutar.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/tienda/productos" className={`${claseBotonPrimario} gap-2`}>
                Explorar colección
                <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" strokeWidth={2} />
              </Link>
              {productoDestacado && (
                <Link
                  href={`/tienda/productos/${productoDestacado.id}`}
                  className={`${claseBotonSecundario} dark:hover:text-gold`}
                >
                  Ver destacado
                </Link>
              )}
            </div>
          </div>

          {imagen && productoDestacado && (
            <Link
              href={`/tienda/productos/${productoDestacado.id}`}
              className="group relative order-first lg:order-last"
            >
              {/* Halo dorado detrás de la foto */}
              <div
                aria-hidden="true"
                className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-gold/30 via-transparent to-bronze/30 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              />
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl ring-1 ring-black/10 dark:ring-white/10 lg:aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagenProducto(imagen, 1000)}
                  alt={productoDestacado.nombre}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 hidden max-w-[80%] rounded-xl bg-ink/80 px-4 py-2.5 shadow-elevated backdrop-blur lg:block">
                  <p className="text-xs font-semibold text-gold">{productoDestacado.marca?.nombre}</p>
                  <p className="truncate text-sm font-bold text-white">{productoDestacado.nombre}</p>
                </div>
              </div>
              <div className="mt-3 lg:hidden">
                <p className="text-xs font-semibold text-bronze dark:text-gold">{productoDestacado.marca?.nombre}</p>
                <p className="line-clamp-2 text-sm font-bold text-foreground">{productoDestacado.nombre}</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
