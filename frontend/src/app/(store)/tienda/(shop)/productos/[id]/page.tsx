import type { Metadata } from 'next';
import { ProductoDetalleClient } from './ProductoDetalleClient';

// Server Component: solo se encarga de metadata/SEO (sección 25, 54 y 55
// del brief — title, description, canonical, Open Graph, JSON-LD) leyendo
// el mismo endpoint público que ya usa la tienda. Toda la interacción
// (galería, talla, carrito) sigue viviendo en el client component, sin
// tocar esa lógica que ya funciona.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';

interface ProductoSEO {
  id: number;
  nombre: string;
  descripcion: string | null;
  marca: { nombre: string } | null;
  categoria: { nombre: string } | null;
  precioVenta: string;
  imagenes: { url: string }[];
  stockTotal: number;
}

async function obtenerProducto(id: string): Promise<ProductoSEO | null> {
  try {
    const res = await fetch(`${API_URL}/tienda/productos/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const producto = await obtenerProducto(params.id);
  if (!producto) {
    return { title: 'Producto | Camino al Deporte' };
  }

  const titulo = `${producto.nombre}${producto.marca ? ` — ${producto.marca.nombre}` : ''} | Camino al Deporte`;
  const descripcion =
    producto.descripcion?.slice(0, 160) ||
    `${producto.nombre}${producto.marca ? ` de ${producto.marca.nombre}` : ''}, disponible en Camino al Deporte.`;
  const imagen = producto.imagenes?.[0]?.url;
  const url = SITE_URL ? `${SITE_URL}/tienda/productos/${producto.id}` : undefined;

  return {
    title: titulo,
    description: descripcion,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      title: titulo,
      description: descripcion,
      type: 'website',
      ...(url ? { url } : {}),
      ...(imagen ? { images: [{ url: imagen }] } : {}),
    },
  };
}

export default async function ProductoDetallePage({ params }: { params: { id: string } }) {
  const producto = await obtenerProducto(params.id);

  const jsonLd = producto
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: producto.nombre,
        image: producto.imagenes?.map((i) => i.url) || [],
        sku: String(producto.id),
        brand: producto.marca ? { '@type': 'Brand', name: producto.marca.nombre } : undefined,
        description: producto.descripcion || undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'MXN',
          price: producto.precioVenta,
          availability:
            producto.stockTotal > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        },
      }
    : null;

  return (
    <>
      {jsonLd && (
        // eslint-disable-next-line react/no-danger
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ProductoDetalleClient id={params.id} />
    </>
  );
}
