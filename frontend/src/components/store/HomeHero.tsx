import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { imagenProducto } from '@/lib/imagenCloudinary';
import { ProductoCatalogo } from '@/lib/catalogo';
import { claseBotonPrimario, claseOjo, claseTituloHero } from './ui';

// Hero del catálogo (sección 10 del brief): sin banners genéricos ni
// imágenes inventadas — usa la fotografía real de un producto del catálogo
// (el primero con foto e inventario) como la única "imagen de portada". Si
// el catálogo no tiene ningún producto con foto todavía, se muestra solo el
// bloque de texto en vez de forzar un placeholder o una imagen de stock.
export function HomeHero({ productoDestacado }: { productoDestacado: ProductoCatalogo | null }) {
  const imagen = productoDestacado?.imagenes?.[0]?.url;

  return (
    <section className="grid items-center gap-8 py-6 sm:py-10 lg:grid-cols-2 lg:gap-12 lg:py-14">
      <div>
        <p className={claseOjo}>Camino al Deporte</p>
        <h1 className={`mt-2 ${claseTituloHero}`}>Encuentra tu próximo par.</h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
          Tenis y equipo deportivo para correr, entrenar, competir y disfrutar.
        </p>
        <Link href="#catalogo" className={`${claseBotonPrimario} mt-7 gap-2`}>
          Explorar colección
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>

      {imagen && productoDestacado && (
        // La ficha de marca/nombre iba superpuesta sobre la foto en las
        // cuatro esquinas inferiores (bien en escritorio, donde la imagen es
        // cuadrada y grande) pero en móvil la imagen es más baja (4:3) y esa
        // ficha llegaba a tapar buena parte del producto — sobre todo con
        // nombres largos. Por eso aquí abajo de lg la ficha se saca de la
        // foto y va debajo, en flujo normal; de lg en adelante vuelve a ser
        // el overlay de siempre.
        <Link href={`/tienda/productos/${productoDestacado.id}`} className="group order-first lg:order-last">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-secondary lg:aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenProducto(imagen, 1000)}
              alt={productoDestacado.nombre}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
            <div className="absolute bottom-4 left-4 hidden max-w-[80%] rounded-xl bg-background/90 px-4 py-2.5 shadow-elevated backdrop-blur lg:block">
              <p className="text-xs font-semibold text-muted-foreground">{productoDestacado.marca?.nombre}</p>
              <p className="truncate text-sm font-bold">{productoDestacado.nombre}</p>
            </div>
          </div>
          <div className="mt-3 lg:hidden">
            <p className="text-xs font-semibold text-muted-foreground">{productoDestacado.marca?.nombre}</p>
            <p className="line-clamp-2 text-sm font-bold">{productoDestacado.nombre}</p>
          </div>
        </Link>
      )}
    </section>
  );
}
