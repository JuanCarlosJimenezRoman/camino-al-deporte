'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { useCarrito } from '@/lib/carrito';
import { Stepper, claseBotonPrimario, claseBotonSecundario } from '@/components/tienda/ui';

interface Variante {
  id: number;
  sku: string;
  color: string | null;
  talla: { valor: string } | null;
  stockTotal: number;
}

interface ProductoDetalle {
  id: number;
  nombre: string;
  descripcion: string | null;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  variantes: Variante[];
  stockTotal: number;
}

export default function ProductoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { agregar } = useCarrito();
  const galeriaRef = useRef<HTMLDivElement>(null);

  const [producto, setProducto] = useState<ProductoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [varianteId, setVarianteId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [imagenActiva, setImagenActiva] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    apiTienda<ProductoDetalle>(`/tienda/productos/${params.id}`)
      .then((data) => {
        setProducto(data);
        const primeraDisponible = data.variantes.find((v) => v.stockTotal > 0);
        if (primeraDisponible) setVarianteId(String(primeraDisponible.id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el producto.'));
  }, [params.id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!producto) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  const variante = producto.variantes.find((v) => String(v.id) === varianteId);
  const disponible = !!variante && variante.stockTotal > 0;

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
    setMensaje('Agregado a tu bolsa.');
  }

  function irAImagen(i: number) {
    setImagenActiva(i);
    const el = galeriaRef.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' });
  }

  return (
    <div className="pb-28 md:pb-0">
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        {/* Galería: en móvil es deslizable con scroll-snap (funciona con swipe nativo) */}
        <div>
          <div
            ref={galeriaRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
              if (i !== imagenActiva) setImagenActiva(i);
            }}
            className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-secondary [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(producto.imagenes.length ? producto.imagenes : [{ url: '' }]).map((img, i) => (
              <div key={i} className="aspect-square w-full shrink-0 snap-center">
                {img.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt={producto.nombre} className="h-full w-full object-cover" />
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
                  key={img.url}
                  src={img.url}
                  alt=""
                  onClick={() => irAImagen(i)}
                  className={`h-16 w-16 cursor-pointer rounded-lg object-cover ${
                    i === imagenActiva ? 'ring-2 ring-foreground' : 'ring-1 ring-border'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detalles */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{producto.marca?.nombre}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{producto.nombre}</h1>
          <p className="mt-2 text-xl font-bold">${producto.precioVenta}</p>

          {producto.descripcion && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{producto.descripcion}</p>
          )}

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Selecciona talla</p>
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
                    className={`rounded-lg border py-3 text-sm font-medium transition ${
                      agotada
                        ? 'cursor-not-allowed border-border text-muted-foreground/50 line-through'
                        : seleccionada
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border hover:border-foreground'
                    }`}
                  >
                    {[v.talla?.valor, v.color].filter(Boolean).join(' / ') || v.sku}
                  </button>
                );
              })}
            </div>
            {variante && variante.stockTotal > 0 && variante.stockTotal <= 5 && (
              <p className="mt-2 text-xs font-medium text-destructive">Solo quedan {variante.stockTotal}</p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <p className="text-sm font-semibold">Cantidad</p>
            <Stepper cantidad={cantidad} max={variante?.stockTotal || 1} onChange={setCantidad} />
          </div>

          {mensaje && <p className="mt-4 text-sm font-medium text-primary">{mensaje}</p>}

          {/* En escritorio los botones van en el flujo normal; en móvil se usa la barra fija de abajo */}
          <div className="mt-8 hidden gap-3 md:flex">
            <button className={`${claseBotonPrimario} flex-1`} disabled={!disponible} onClick={agregarAlCarrito}>
              {disponible ? 'Agregar a la bolsa' : 'Agotado'}
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
        </div>
      </div>

      {/* Barra fija de compra en móvil, siempre visible mientras se hace scroll */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-4 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-base font-bold">${(Number(producto.precioVenta) * cantidad).toFixed(2)}</p>
          </div>
          <button className={`${claseBotonPrimario} flex-[2]`} disabled={!disponible} onClick={agregarAlCarrito}>
            {disponible ? 'Agregar a la bolsa' : 'Agotado'}
          </button>
        </div>
      </div>
    </div>
  );
}
