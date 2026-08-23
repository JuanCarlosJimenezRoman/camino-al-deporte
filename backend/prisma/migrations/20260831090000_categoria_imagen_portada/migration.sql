-- Portada de categoría para la tienda en línea: antes la tarjeta de
-- categoría (home, "Explora por categoría") usaba la foto del primer
-- producto que encontrara en esa categoría, que a veces se veía cortada raro
-- porque esas fotos están pensadas para el catálogo (encuadre cuadrado, con
-- relleno), no para un banner vertical. Ahora se puede subir una foto propia
-- por categoría desde el panel (Catálogo → Categorías). Si no se sube
-- ninguna, el frontend sigue cayendo al criterio anterior.
ALTER TABLE "categorias" ADD COLUMN "imagen_portada" TEXT;
ALTER TABLE "categorias" ADD COLUMN "imagen_portada_public_id" TEXT;
