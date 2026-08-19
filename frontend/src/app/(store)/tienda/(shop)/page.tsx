'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCatalogo, ProductoCatalogo } from '@/lib/catalogo';
import { HomeHero } from '@/components/store/HomeHero';
import { CategoryGrid, CategoriaConImagen } from '@/components/store/CategoryGrid';
import { ProductSection } from '@/components/store/ProductSection';
import { CatalogSection } from '@/components/store/CatalogSection';
import { BrandsSection } from '@/components/store/BrandsSection';
import { BenefitsSection } from '@/components/store/StoreFooter';
import { Testimonios } from '@/components/store/Testimonios';
import { ProductQuickView } from '@/components/store/ProductQuickView';

const MAX_CATEGORIAS_HOME = 8;
const MAX_DESTACADOS = 8;
const MAX_NUEVOS = 8;
const MAX_ULTIMAS_UNIDADES = 8;
const MAX_MARCAS_HOME = 12;

/** Selección "destacados" honesta: sin datos de ventas/curaduría, se arma
 * tomando productos de categorías distintas en turnos (round-robin) en vez
 * de solo los más nuevos — así la sección muestra variedad real del
 * catálogo en lugar de repetir lo mismo que "Recién llegados". */
function seleccionarDestacados(productos: ProductoCatalogo[], maximo: number): ProductoCatalogo[] {
  const conFoto = productos.filter((p) => p.imagenes?.[0]?.url);
  const porCategoria = new Map<string, ProductoCatalogo[]>();
  for (const p of conFoto) {
    const clave = p.categoria?.nombre || '__sin_categoria__';
    if (!porCategoria.has(clave)) porCategoria.set(clave, []);
    porCategoria.get(clave)!.push(p);
  }
  const grupos = [...porCategoria.values()];
  const resultado: ProductoCatalogo[] = [];
  let i = 0;
  while (resultado.length < maximo && grupos.some((g) => i < g.length)) {
    for (const g of grupos) {
      if (i < g.length) resultado.push(g[i]);
      if (resultado.length >= maximo) break;
    }
    i++;
  }
  return resultado;
}

function TiendaHomeContenido() {
  const { productos, cargando, error, categorias, marcas, nuevosIds, ultimasUnidades } = useCatalogo();
  const searchParams = useSearchParams();
  const [quickView, setQuickView] = useState<ProductoCatalogo | null>(null);

  const productoDestacadoHero = useMemo(() => productos?.find((p) => p.imagenes?.[0]?.url) ?? null, [productos]);

  const categoriasConImagen: CategoriaConImagen[] = useMemo(() => {
    if (!productos) return [];
    return categorias.slice(0, MAX_CATEGORIAS_HOME).map((c) => ({
      nombre: c.nombre,
      cantidad: c.cantidad,
      imagenUrl: productos.find((p) => p.categoria?.nombre === c.nombre && p.imagenes?.[0]?.url)?.imagenes[0]?.url,
    }));
  }, [categorias, productos]);

  const destacados = useMemo(() => seleccionarDestacados(productos || [], MAX_DESTACADOS), [productos]);
  const nuevos = useMemo(() => (productos || []).slice(0, MAX_NUEVOS), [productos]);
  const ultimas = useMemo(() => ultimasUnidades.slice(0, MAX_ULTIMAS_UNIDADES), [ultimasUnidades]);
  const marcasHome = useMemo(() => marcas.slice(0, MAX_MARCAS_HOME), [marcas]);

  return (
    <div>
      <HomeHero productoDestacado={productoDestacadoHero} />

      <CategoryGrid categorias={categoriasConImagen} />

      <ProductSection
        ojo="Selección de la casa"
        titulo="Destacados"
        subtitulo="Una muestra de lo que tenemos, de distintas categorías del catálogo."
        productos={destacados}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        variante="grid"
      />

      <CatalogSection
        productos={productos}
        cargando={cargando}
        error={error}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        initialQ={searchParams.get('q') || undefined}
        initialCategoria={searchParams.get('categoria') || undefined}
        initialMarca={searchParams.get('marca') || undefined}
      />

      <ProductSection
        ojo="Lo último"
        titulo="Recién llegados"
        productos={nuevos}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        variante="scroll"
      />

      <ProductSection
        ojo="Que no se te vayan"
        titulo="Últimas unidades"
        subtitulo="Quedan pocas piezas de estos modelos en existencia."
        productos={ultimas}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        variante="grid"
      />

      <BrandsSection marcas={marcasHome} />

      <BenefitsSection />

      <Testimonios />

      <ProductQuickView producto={quickView} onClose={() => setQuickView(null)} />
    </div>
  );
}

export default function TiendaHomePage() {
  return (
    <Suspense fallback={null}>
      <TiendaHomeContenido />
    </Suspense>
  );
}
