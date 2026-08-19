'use client';

// Vista rápida (sección 15 del brief): permite ver talla/precio y agregar al
// carrito sin salir de /tienda. Usa el mismo objeto de producto que ya trae
// el grid (CatalogoProvider ya incluyó variantes+stock en la carga inicial),
// así que abrir la vista rápida no dispara ninguna llamada de red extra.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { useCarrito } from '@/lib/carrito';
import { imagenProducto } from '@/lib/imagenCloudinary';
import { ProductoCatalogo } from '@/lib/catalogo';
import { claseBotonPrimario, claseBotonSecundario, claseChip, PriceTag, estadoStockTienda } from './ui';

export function ProductQuickView({
  producto,
  onClose,
}: {
  producto: ProductoCatalogo | null;
  onClose: () => void;
}) {
  const { agregar } = useCarrito();
  const [varianteId, setVarianteId] = useState('');

  useEffect(() => {
    if (!producto) return;
    const primeraDisponible = producto.variantes.find((v) => v.stockTotal > 0);
    setVarianteId(primeraDisponible ? String(primeraDisponible.id) : '');
  }, [producto]);

  if (!producto) return null;

  const variante = producto.variantes.find((v) => String(v.id) === varianteId);
  const disponible = !!variante && variante.stockTotal > 0;
  const hayTallas = producto.variantes.some((v) => v.talla);
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
      1
    );
    toast({ title: '✓ Agregado al carrito', description: producto.nombre, variant: 'success' });
    onClose();
  }

  return (
    <Dialog open={!!producto} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0">
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="aspect-square bg-secondary sm:rounded-l-card">
            {producto.imagenes?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagenProducto(producto.imagenes[0].url, 800)}
                alt={producto.nombre}
                className="h-full w-full object-cover sm:rounded-l-card"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Sin foto</div>
            )}
          </div>

          <div className="flex flex-col p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{producto.marca?.nombre}</p>
            <h2 className="mt-1 text-lg font-bold leading-tight">{producto.nombre}</h2>
            <div className="mt-2">
              <PriceTag precio={producto.precioVenta} tamano="lg" />
            </div>
            {estado.tono !== 'success' && (
              <p className={`mt-1 text-xs font-semibold ${estado.tono === 'warning' ? 'text-warning' : 'text-destructive'}`}>
                {estado.texto}
              </p>
            )}

            {hayTallas && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold">Talla</p>
                <div className="flex flex-wrap gap-2">
                  {producto.variantes.map((v) => {
                    const agotada = v.stockTotal === 0;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={agotada}
                        onClick={() => setVarianteId(String(v.id))}
                        className={claseChip({ seleccionado: String(v.id) === varianteId, agotado: agotada })}
                      >
                        {[v.talla?.valor, v.color].filter(Boolean).join(' / ') || v.sku}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-6">
              <button className={claseBotonPrimario} disabled={!disponible} onClick={agregarAlCarrito}>
                {disponible ? 'Agregar al carrito' : 'Agotado'}
              </button>
              <Link href={`/tienda/productos/${producto.id}`} onClick={onClose} className={claseBotonSecundario}>
                Ver producto completo
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
