'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageOff, Truck, RotateCcw, CalendarClock, ChevronRight } from 'lucide-react';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { useCarrito } from '@/lib/carrito';
import { useCatalogo, ProductoCatalogo } from '@/lib/catalogo';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper, claseBotonPrimario, claseBotonSecundario, claseChip, PriceTag, estadoStockTienda } from '@/components/store/ui';
import { imagenProducto, imagenMiniatura } from '@/lib/imagenCloudinary';
import { Testimonios } from '@/components/store/Testimonios';
import { ProductSection } from '@/components/store/ProductSection';
import { ProductQuickView } from '@/components/store/ProductQuickView';

// Reutiliza el mismo tipo que ya trae variantes+stock (idéntico shape al que
// devuelve GET /tienda/productos/:id) — así el resto de la tienda (carrito,
// quick view) puede tratar este producto exactamente igual.
type ProductoDetalle = ProductoCatalogo;

// Hash simple y determinista (mismo par de IDs → mismo número siempre) —
// se usa para variar "también te puede interesar" entre productos distintos
// de una misma categoría/marca sin depender de nada aleatorio de verdad
// (evita que la lista "salte" en cada render) ni de un endpoint nuevo.
function hashPar(a: number, b: number): number {
  let h = 0;
  const s = `${a}-${b}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const TABS = ['descripcion', 'envios', 'cambios'] as const;
type TabId = (typeof TABS)[number];
const TAB_LABEL: Record<TabId, string> = {
  descripcion: 'Descripción',
  envios: 'Envíos',
  cambios: 'Cambios',
};

function DescripcionYFicha({ producto }: { producto: ProductoDetalle }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {producto.descripcion ? (
        <p className="whitespace-pre-line">{producto.descripcion}</p>
      ) : (
        <p>Este producto todavía no tiene una descripción capturada.</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
        {producto.marca && (
          <>
            <dt className="text-muted-foreground">Marca</dt>
            <dd className="font-medium text-foreground">{producto.marca.nombre}</dd>
          </>
        )}
        {producto.categoria && (
          <>
            <dt className="text-muted-foreground">Categoría</dt>
            <dd className="font-medium text-foreground">{producto.categoria.nombre}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Envíos: sin fecha exacta prometida (no hay dato de tiempos de entrega en
// el sistema) — "Consultar", tal como pide la sección 34 del brief en vez
// de inventar un rango de días.
function InfoEnvios() {
  return (
    <div className="flex gap-3 text-sm text-muted-foreground">
      <Truck className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.75} />
      <div>
        <p className="font-medium text-foreground">Envío a domicilio disponible</p>
        <p className="mt-0.5">Tiempo estimado: consúltalo con nosotros al confirmar tu pedido.</p>
      </div>
    </div>
  );
}

// Cambios: sin una política de cambios/devoluciones capturada en el
// sistema — se evita inventar plazos o condiciones (sección 67), se
// invita a contactar directamente.
function InfoCambios() {
  return (
    <div className="flex gap-3 text-sm text-muted-foreground">
      <RotateCcw className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.75} />
      <div>
        <p className="font-medium text-foreground">¿Necesitas cambiar tu producto?</p>
        <p className="mt-0.5">Contáctanos o visita tu sucursal más cercana y con gusto te ayudamos.</p>
      </div>
    </div>
  );
}

export function ProductoDetalleClient({ id }: { id: string }) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const { productos: catalogo, nuevosIds } = useCatalogo();
  const galeriaRef = useRef<HTMLDivElement>(null);

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [imagenActiva, setImagenActiva] = useState(0);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [tab, setTab] = useState<TabId>('descripcion');
  const [quickView, setQuickView] = useState<ProductoDetalle | null>(null);

  useEffect(() => {
    setProducto(null);
    setError(null);
    apiTienda<ProductoDetalle>(`/tienda/productos/${id}`)
      .then((data) => {
        setProducto(data);
        const primeraDisponible = data.variantes.find((v) => v.stockTotal > 0);
        if (primeraDisponible) setVarianteId(String(primeraDisponible.id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el producto.'));
  }, [id]);

  // Mismo modelo: otras variantes (color, talla) del modelo exacto — ej. "Ja
  // 3" muestra los demás colores de "Ja 3", no cualquier tenis de la misma
  // categoría. Usa modelo.id, el campo real del catálogo (panel admin →
  // Catálogo → Modelos, ya se asigna por producto — ver dashboard/productos).
  // Si el producto no tiene modelo asignado, esta sección simplemente no
  // aparece; no se inventa un agrupamiento.
  const mismoModelo = useMemo(() => {
    if (!producto || !catalogo || !producto.modelo) return [];
    return catalogo
      .filter((p) => p.id !== producto.id)
      .filter((p) => p.modelo?.id === producto.modelo!.id)
      .slice(0, 8);
  }, [producto, catalogo]);

  // Relacionados: misma categoría (o marca si no tiene) tomados del catálogo
  // que ya está cargado en memoria (CatalogoProvider) — sin pedirle nada
  // nuevo al backend. Excluye lo que ya se muestra arriba en "Otras opciones
  // de este modelo" para no repetir las mismas tarjetas dos veces.
  const relacionados = useMemo(() => {
    if (!producto || !catalogo) return [];
    return catalogo
      .filter((p) => p.id !== producto.id)
      .filter((p) => !producto.modelo || p.modelo?.id !== producto.modelo.id)
      .filter((p) => (producto.categoria ? p.categoria?.nombre === producto.categoria.nombre : p.marca?.nombre === producto.marca?.nombre))
      // Antes se tomaban siempre los primeros 8 del catálogo (orden fijo,
      // más reciente primero) — así que dos productos de la misma categoría
      // mostraban exactamente los mismos "también te puede interesar". Este
      // orden depende del producto que se está viendo, así que varía entre
      // productos aunque compartan categoría, y se mantiene igual si vuelves
      // a entrar al mismo producto (no es aleatorio en cada render).
      .sort((a, b) => hashPar(producto.id, a.id) - hashPar(producto.id, b.id))
      .slice(0, 8);
  }, [producto, catalogo]);

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/tienda" className={`${claseBotonSecundario} mt-6 inline-flex`}>
          Volver a la tienda
        </Link>
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-6 h-24 w-full" />
        </div>
      </div>
    );
  }

  const variante = producto.variantes.find((v) => String(v.id) === varianteId);
  const disponible = !!variante && variante.stockTotal > 0;
  const esCalzado = producto.variantes.some((v) => v.talla?.tipo && v.talla.tipo.toLowerCase() !== 'ropa');
  const estado = estadoStockTienda(producto.stockTotal);

  function agregarAlCarrito() {
    if (!producto || !variante) return;
    agregar(
      {
        varianteId: variante.id,
        productoId: producto.id,
        nombre: producto.nombre,
        talla: variante.talla?.valor,
        color: variante.color,
        sku: variante.sku,
        precioVenta: Number(producto.precioVenta),
        imagenUrl: producto.imagenes?.[0]?.url,
        stockDisponible: variante.stockTotal,
      },
      cantidad
    );
    toast({ title: '✓ Agregado al carrito', description: producto.nombre, variant: 'success' });
  }

  function irAImagen(i: number) {
    setImagenActiva(i);
    const el = galeriaRef.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' });
  }

  return (
    <div className="pb-28 md:pb-0">
      {/* Breadcrumb discreto (sección 66) */}
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/tienda" className="hover:text-foreground">
          Inicio
        </Link>
        {producto.categoria && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/tienda/productos?categoria=${encodeURIComponent(producto.categoria.nombre)}`} className="hover:text-foreground">
              {producto.categoria.nombre}
            </Link>
          </>
        )}
        {producto.marca && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/tienda/productos?marca=${encodeURIComponent(producto.marca.nombre)}`} className="hover:text-foreground">
              {producto.marca.nombre}
            </Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-foreground">{producto.nombre}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        {/* Galería: en móvil es deslizable con scroll-snap (funciona con swipe nativo) */}
        <div>
          {producto.imagenes.length > 0 ? (
            <>
              <div
                ref={galeriaRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
                  if (i !== imagenActiva) setImagenActiva(i);
                }}
                className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-secondary [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {producto.imagenes.map((img, i) => (
                  <div key={i} className="relative aspect-square w-full shrink-0 snap-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagenProducto(img.url)}
                      alt={producto.nombre}
                      className="h-full w-full object-cover"
                    />
                    {producto.imagenes.length > 1 && (
                      <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                        {i + 1} / {producto.imagenes.length}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {producto.imagenes.length > 1 && (
                <div className="mt-3 flex justify-center gap-1.5 md:hidden">
                  {producto.imagenes.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => irAImagen(i)}
                      aria-label={`Ver imagen ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        i === imagenActiva ? 'w-5 bg-foreground' : 'w-1.5 bg-border'
                      }`}
                    />
                  ))}
                </div>
              )}

              {producto.imagenes.length > 1 && (
                <div className="mt-3 hidden gap-2 md:flex">
                  {producto.imagenes.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.url + i}
                      src={imagenMiniatura(img.url)}
                      alt=""
                      onClick={() => irAImagen(i)}
                      className={`h-16 w-16 cursor-pointer rounded-lg object-cover ${
                        i === imagenActiva ? 'ring-2 ring-primary' : 'ring-1 ring-border'
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            // Placeholder elegante — nunca una imagen rota (sección 28).
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-muted-foreground">
              <ImageOff className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-xs">Sin fotografías disponibles</p>
            </div>
          )}
        </div>

        {/* Detalles */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{producto.marca?.nombre}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{producto.nombre}</h1>
          {variante && <p className="mt-1 text-xs text-muted-foreground">SKU {variante.sku}</p>}

          <div className="mt-3">
            <PriceTag precio={producto.precioVenta} tamano="lg" />
          </div>

          <p
            className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${
              estado.tono === 'success' ? 'text-success' : estado.tono === 'warning' ? 'text-warning' : 'text-destructive'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${estado.tono === 'success' ? 'bg-success' : estado.tono === 'warning' ? 'bg-warning' : 'bg-destructive'}`} />
            {estado.texto}
          </p>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Selecciona tu talla</p>
              {esCalzado && (
                <button
                  type="button"
                  onClick={() => setGuiaAbierta(true)}
                  className="text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  ¿Cuál es mi talla?
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {producto.variantes.map((v) => {
                const seleccionada = String(v.id) === varianteId;
                const agotada = v.stockTotal === 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={agotada}
                    onClick={() => setVarianteId(String(v.id))}
                    className={claseChip({ seleccionado: seleccionada, agotado: agotada })}
                  >
                    {[v.talla?.valor, v.color].filter(Boolean).join(' / ') || v.sku}
                  </button>
                );
              })}
            </div>
            {variante && variante.stockTotal > 0 && variante.stockTotal <= 5 && (
              <p className="mt-2 text-xs font-medium text-warning">Solo quedan {variante.stockTotal}</p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <p className="text-sm font-semibold">Cantidad</p>
            <Stepper cantidad={cantidad} max={variante?.stockTotal || 1} onChange={setCantidad} />
          </div>

          {/* En escritorio los botones van en el flujo normal; en móvil se usa la barra fija de abajo */}
          <div className="mt-8 hidden gap-3 md:flex">
            <button className={`${claseBotonPrimario} flex-1`} disabled={!disponible} onClick={agregarAlCarrito}>
              {disponible ? 'Agregar al carrito' : 'Agotado'}
            </button>
            <button
              className={`${claseBotonSecundario} flex-1`}
              disabled={!disponible}
              onClick={() => {
                agregarAlCarrito();
                router.push('/tienda/carrito');
              }}
            >
              Comprar ahora
            </button>
          </div>

          {/* Apartados: es una capacidad real del negocio, pero se gestiona en
              sucursal por el momento — no hay un flujo en línea para que el
              cliente lo autogestione, así que se invita a contactar en vez de
              simular un botón que no completaría nada (ver sección 33). */}
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-secondary/60 p-4">
            <CalendarClock className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-semibold">¿Prefieres apartarlo?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Visita tu sucursal más cercana para apartar este producto y pagarlo después.
              </p>
            </div>
          </div>

          {/* Tabs de información (sección 35) */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="mb-4 flex gap-5 border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                    tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
            {tab === 'descripcion' && <DescripcionYFicha producto={producto} />}
            {tab === 'envios' && <InfoEnvios />}
            {tab === 'cambios' && <InfoCambios />}
          </div>
        </div>
      </div>

      {producto.modelo && (
        <ProductSection
          ojo="Mismo modelo"
          titulo={`Otras opciones de ${producto.modelo.nombre}`}
          productos={mismoModelo}
          nuevosIds={nuevosIds}
          onQuickView={setQuickView}
          variante="scroll"
        />
      )}

      <Testimonios productoId={producto.id} titulo="Opiniones de clientes" />

      <ProductSection
        titulo="También te puede interesar"
        productos={relacionados}
        nuevosIds={nuevosIds}
        onQuickView={setQuickView}
        variante="scroll"
      />

      {/* Barra fija de compra en móvil, siempre visible mientras se hace scroll */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-4 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <PriceTag precio={Number(producto.precioVenta) * cantidad} tamano="base" />
          </div>
          <button className={`${claseBotonPrimario} flex-[2]`} disabled={!disponible} onClick={agregarAlCarrito}>
            {disponible ? 'Agregar al carrito' : 'Agotado'}
          </button>
        </div>
      </div>

      {/* Guía de tallas: hoja deslizante desde abajo en móvil, modal centrado en escritorio */}
      {guiaAbierta && (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGuiaAbierta(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-6 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold uppercase tracking-wide">Guía de tallas</h2>
              <button onClick={() => setGuiaAbierta(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                ✕
              </button>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              Para elegir mejor tu talla, mide tu pie y compáralo con las opciones disponibles de este producto:
            </p>

            <ol className="mb-5 list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>Párate sobre una hoja de papel, con el talón pegado a una pared.</li>
              <li>Marca el punto más largo de tu pie (puede ser el dedo gordo o el segundo dedo).</li>
              <li>Mide la distancia desde la pared hasta la marca, en centímetros.</li>
              <li>Si tu medida queda entre dos tallas, elige la más grande.</li>
            </ol>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tallas disponibles en este producto
            </p>
            <div className="flex flex-wrap gap-2">
              {producto.variantes
                .filter((v) => v.talla?.tipo && v.talla.tipo.toLowerCase() !== 'ropa')
                .sort((a, b) => (a.talla?.orden ?? 0) - (b.talla?.orden ?? 0))
                .map((v) => (
                  <span key={v.id} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                    {v.talla?.valor}
                  </span>
                ))}
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              El calce puede variar un poco según el modelo. Si tienes dudas sobre tu talla, contáctanos antes de comprar.
            </p>
          </div>
        </div>
      )}

      <ProductQuickView producto={quickView} onClose={() => setQuickView(null)} />
    </div>
  );
}
