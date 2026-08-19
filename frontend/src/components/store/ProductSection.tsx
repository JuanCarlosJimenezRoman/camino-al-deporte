import { ProductoCatalogo } from '@/lib/catalogo';
import { ProductCard } from './ProductCard';
import { claseOjo, claseTituloSeccion } from './ui';

// Sección de productos reutilizable (destacados, recién llegados, últimas
// unidades): mismo componente con dos variantes de layout, para no duplicar
// el marcado de "título + grid de tarjetas" tres veces.
export function ProductSection({
  id,
  ojo,
  titulo,
  subtitulo,
  productos,
  nuevosIds,
  onQuickView,
  variante = 'grid',
}: {
  id?: string;
  ojo?: string;
  titulo: string;
  subtitulo?: string;
  productos: ProductoCatalogo[];
  nuevosIds: Set<number>;
  onQuickView: (producto: ProductoCatalogo) => void;
  variante?: 'grid' | 'scroll';
}) {
  if (productos.length === 0) return null;

  return (
    <section id={id} className="border-t border-border py-8 sm:py-10">
      {ojo && <p className={claseOjo}>{ojo}</p>}
      <h2 className={`${ojo ? 'mt-1' : ''} ${claseTituloSeccion}`}>{titulo}</h2>
      {subtitulo && <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">{subtitulo}</p>}

      {variante === 'grid' ? (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4">
          {productos.map((p) => (
            <ProductCard
              key={p.id}
              producto={p}
              nuevo={nuevosIds.has(p.id)}
              onQuickView={() => onQuickView(p)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible lg:grid-cols-4">
          {productos.map((p) => (
            <ProductCard
              key={p.id}
              producto={p}
              nuevo={nuevosIds.has(p.id)}
              onQuickView={() => onQuickView(p)}
              className="w-40 shrink-0 snap-start sm:w-auto"
            />
          ))}
        </div>
      )}
    </section>
  );
}
