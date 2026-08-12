'use client';

import { useEffect, useState } from 'react';
import { apiTienda } from '@/lib/apiTienda';
import { imagenMiniatura } from '@/lib/imagenCloudinary';
import { Estrellas } from './ui';

interface Testimonio {
  id: number;
  calificacionProducto: number;
  comentario: string | null;
  fotos: { url: string }[];
  clienteNombre: string;
  productos: string[];
}

// Testimonios públicos (reseñas de pedidos ya recibidos) para dar confianza
// a futuros clientes. Se usa tanto en el catálogo general (todos los
// testimonios) como en el detalle de un producto (solo los de ese
// producto, vía productoId) — ver backend/src/routes/tienda/resenas.js.
export function Testimonios({
  productoId,
  titulo = 'Lo que dicen nuestros clientes',
}: {
  productoId?: number;
  titulo?: string;
}) {
  const [testimonios, setTestimonios] = useState<Testimonio[] | null>(null);

  useEffect(() => {
    const query = productoId ? `?productoId=${productoId}` : '';
    apiTienda<Testimonio[]>(`/tienda/resenas${query}`)
      .then(setTestimonios)
      .catch(() => setTestimonios([]));
  }, [productoId]);

  if (!testimonios || testimonios.length === 0) return null;

  return (
    <div className="mt-16 border-t border-border pt-10">
      <h2 className="mb-5 text-lg font-bold uppercase tracking-tight sm:text-xl">{titulo}</h2>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {testimonios.map((t) => (
          <div key={t.id} className="w-72 shrink-0 snap-start rounded-2xl border border-border p-5">
            <Estrellas valor={t.calificacionProducto} tamano="h-4 w-4" />
            {t.comentario && <p className="mt-3 line-clamp-5 text-sm leading-relaxed">{t.comentario}</p>}
            {t.fotos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {t.fotos.slice(0, 3).map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={imagenMiniatura(f.url)} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ))}
              </div>
            )}
            <p className="mt-4 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.clienteNombre} · {t.productos.join(', ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
