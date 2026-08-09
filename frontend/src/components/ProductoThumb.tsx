'use client';

// Miniatura de producto reutilizada en Inventario, Ventas y Apartados.
// Si el producto no tiene foto todavía, muestra un placeholder gris del
// mismo tamaño para que las filas de la tabla no "brinquen".
export function ProductoThumb({
  url,
  alt,
  size = 36,
}: {
  url?: string | null;
  alt: string;
  size?: number;
}) {
  if (!url) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: 'var(--color-border)',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={{ width: size, height: size, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

// Extrae la URL de la foto principal (o la primera) de la forma en la que
// el backend la manda: producto.imagenes = [{ url }] (ya viene limitada a
// una sola imagen desde el API).
export function imagenPrincipal(producto?: { imagenes?: { url: string }[] } | null): string | null {
  return producto?.imagenes?.[0]?.url ?? null;
}
