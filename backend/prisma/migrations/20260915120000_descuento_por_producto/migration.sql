-- Descuento por producto (para no tener que capturarlo/preguntarlo cada vez
-- en el punto de venta — ver Producto/VentaItem en schema.prisma):
--
-- 1) Descuento por defecto de cada producto, configurable desde el
--    catálogo (POST/PUT /productos, ROLES_EDICION).
-- 2) Último descuento aplicado a ese producto, cacheado para sugerirlo al
--    instante en el punto de venta (se actualiza en POST/PATCH /ventas).
-- 3) Descuento propio de cada renglón de venta (VentaItem), independiente
--    del descuento libre de todo el ticket que ya existía en Venta (ver
--    20260817090000_descuento_y_columnas_pendientes) — ambos coexisten:
--    uno es el descuento normal por producto, el otro queda para
--    promociones/cortesías sobre el total completo.
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "descuento_defecto_tipo" "TipoDescuento";
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "descuento_defecto_valor" DECIMAL(10,2);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "ultimo_descuento_tipo" "TipoDescuento";
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "ultimo_descuento_valor" DECIMAL(10,2);
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "ultimo_descuento_fecha" TIMESTAMP(3);

ALTER TABLE "venta_items" ADD COLUMN IF NOT EXISTS "descuento_tipo" "TipoDescuento";
ALTER TABLE "venta_items" ADD COLUMN IF NOT EXISTS "descuento_valor" DECIMAL(10,2);
ALTER TABLE "venta_items" ADD COLUMN IF NOT EXISTS "descuento_monto" DECIMAL(10,2) NOT NULL DEFAULT 0;
