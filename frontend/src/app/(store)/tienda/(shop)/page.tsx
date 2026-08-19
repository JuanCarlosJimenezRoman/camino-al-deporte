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

// Clave del campo personalizado (panel admin → Catálogo → "Campos
// personalizados", entidad "producto", tipo Sí/No) que decide qué aparece
// en "Destacados". Debe crearse ahí con esta clave exacta: "destacado".
const CLAVE_CAMPO_DESTACADO = 'destacado';

// Campo separado (mismo mecanismo, otra clave) para elegir la foto del hero
// de la tienda — independiente de "Destacados", así se puede tener una
// portada distinta a los productos de esa sección. Debe crearse en el panel
// con esta clave exacta: "hero_tienda", tipo Sí/No.
const CLAVE_CAMPO_HERO = 'hero_tienda';

function productoMarcadoDestacado(p: ProductoCatalogo): boolean {
  return p.atributosExtra?.[CLAVE_CAMPO_DESTACADO] === 'true';
}

function productoMarcadoHero(p: ProductoCatalogo): boolean {
  return p.atributosExtra?.[CLAVE_CAMPO_HERO] === 'true';
}

/** Selección "destacados": si el equipo ya marcó productos con el campo
 * personalizado "destacado" desde el panel, se usan esos (respetando su
 * elección tal cual, aunque sean menos de `maximo`). Si todavía no han
 * marcado ninguno, se cae al criterio automático anterior — variedad real
 * del catálogo tomando productos de categorías distintas en turnos
 * (round-robin) en vez de solo los más nuevos — para que la home nunca se
 * quede sin esta sección mientras nadie haya curado nada todavía. */
function seleccionarDestacados(productos: ProductoCatalogo[], maximo: number): ProductoCatalogo[] {
  const conFotoBase = productos.filter((p) => p.imagenes?.[0]?.url);
  const marcados = conFotoBase.filter(productoMarcadoDestacado);
  if (marcados.length > 0) return marcados.slice(0, maximo);
  return seleccionarDestacadosAutomatico(productos, maximo);
}

function seleccionarDestacadosAutomatico(productos: ProductoCatalogo[], maximo: number): ProductoCatalogo[] {
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

  // Portada del hero: si hay un producto marcado con el campo personalizado
  // "hero_tienda", se usa ese (el primero, si marcaron más de uno). Si no
  // hay ninguno marcado todavía, se cae al criterio anterior — el producto
  // con foto más reciente del catálogo — para que el hero nunca se quede
  // vacío mientras nadie haya elegido una portada.
  const productoDestacadoHero = useMemo(() => {
    const conFoto = (productos || []).filter((p) => p.imagenes?.[0]?.url);
    return conFoto.find(productoMarcadoHero) ?? conFoto[0] ?? null;
  }, [productos]);

  const categoriasConImagen: CategoriaConImagen[] = useMemo(() => {
    if (!productos) return [];
    return categorias.slice(0, MAX_CATEGORIAS_HOME).map((c) => ({
      nombre: c.nombre,
      cantidad: c.cantidad,
      imagenUrl: productos.find((p) => p.categoria?.nombre === c.nombre && p.imagenes?.[0]?.url)?.imagenes[0]?.url,
    }));
  }, [categorias, productos]);

  const destacados = useMemo(() => seleccionarDestacados(productos || [], MAX_DESTACADOS), [productos]);
  const destacadosCurados = useMemo(() => (productos || []).some(productoMarcadoDestacado), [productos]);
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
        subtitulo={
          destacadosCurados
            ? 'Lo que elegimos resaltar esta temporada.'
            : 'Una muestra de lo que tenemos, de distintas categorías del catálogo.'
        }
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
