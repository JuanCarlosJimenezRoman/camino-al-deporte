'use client';

// Catálogo completo como página propia — antes vivía como una sección más
// (con buscador, filtros y "ver más") a la mitad del home de /tienda. Era la
// única sección de ahí con paginación/estado local, así que era la que
// rompía la navegación: al entrar a un producto y volver, esa sección podía
// perder cuántos productos tenía "revelados" (`visibles`), el home cambiaba
// de alto, y el navegador dejaba el scroll en un punto que ya no
// correspondía a donde estabas. Como página propia, "atrás" siempre regresa
// a un listado — no a la mitad de un home con siete secciones distintas —, y
// CatalogSection ahora además refleja `visibles` en la URL (?visibles=) para
// que el listado se reconstruya igual antes y después de ver un producto
// (ver el comentario junto a `visibles` en CatalogSection.tsx).

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCatalogo, ProductoCatalogo } from '@/lib/catalogo';
import { CatalogSection } from '@/components/store/CatalogSection';
import { ProductQuickView } from '@/components/store/ProductQuickView';

function CatalogoContenido() {
  const { productos, cargando, error, nuevosIds } = useCatalogo();
  const searchParams = useSearchParams();
  const [quickView, setQuickView] = useState<ProductoCatalogo | null>(null);

  const visiblesParam = Number(searchParams.get('visibles'));

  return (
    <div>
      <CatalogSection
        productos={productos}
        cargando={cargando}
        error={error}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        initialQ={searchParams.get('q') || undefined}
        initialCategoria={searchParams.get('categoria') || undefined}
        initialMarca={searchParams.get('marca') || undefined}
        initialVisibles={Number.isFinite(visiblesParam) && visiblesParam > 0 ? visiblesParam : undefined}
      />

      <ProductQuickView producto={quickView} onClose={() => setQuickView(null)} />
    </div>
  );
}

export default function CatalogoPage() {
  return (
    <Suspense fallback={null}>
      <CatalogoContenido />
    </Suspense>
  );
}
