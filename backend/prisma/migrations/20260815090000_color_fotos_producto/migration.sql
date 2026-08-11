-- Algunos productos (sobre todo modelos "By You"/custom) tienen colores muy
-- distintos entre sí dentro del MISMO producto (el color es una variante, no
-- un producto aparte). Hasta ahora las fotos eran del producto completo, sin
-- forma de decir "esta foto es del color negro, esta otra del azul". Se
-- agrega "color" a producto_imagenes: null = foto general (sirve para
-- cualquier color que no tenga una propia), o el texto exacto de un color de
-- variante para que esa foto se muestre solo para ese color.

ALTER TABLE "producto_imagenes" ADD COLUMN "color" TEXT;
