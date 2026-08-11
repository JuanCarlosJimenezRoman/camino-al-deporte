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

interface ImagenProducto {
  url: string;
  color?: string | null;
  esPrincipal?: boolean;
}

// Elige qué foto mostrar de la galería de un producto. Como una foto puede
// estar etiquetada para un color de variante específico (modelos "By You"
// custom, por ejemplo, donde el negro y el azul se ven muy distintos aunque
// sean el mismo producto), si se manda el color de la variante en cuestión
// se prioriza una foto etiquetada con ese color; si no hay ninguna así, cae
// de vuelta a la portada general del producto (o a la primera foto que
// haya).
export function imagenPrincipal(
  producto?: { imagenes?: ImagenProducto[] } | null,
  color?: string | null
): string | null {
  const imagenes = producto?.imagenes;
  if (!imagenes || imagenes.length === 0) return null;

  if (color) {
    const deEseColor = imagenes.find((img) => img.color && img.color.toLowerCase() === color.toLowerCase());
    if (deEseColor) return deEseColor.url;
  }

  const general = imagenes.find((img) => !img.color && img.esPrincipal) ?? imagenes.find((img) => !img.color);
  return (general ?? imagenes[0]).url;
}
