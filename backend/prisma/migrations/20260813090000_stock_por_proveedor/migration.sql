-- Separa el stock por proveedor: antes "existencias" era único por
-- (sucursal, variante); ahora es único por (sucursal, variante, proveedor),
-- para llevar un número de stock independiente por cada proveedor que surte
-- la misma talla en la misma sucursal (antes se sumaban en un solo número).
-- También se agrega proveedor_id a los renglones que descuentan/mueven
-- stock (venta, apartado, pedido en línea, transferencia), para poder
-- regresarlo al bucket correcto si se cancela y para trazabilidad.

-- ============================================================================
-- 1. existencias: agregar proveedor_id y cambiar la unicidad
-- ============================================================================

ALTER TABLE "existencias" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Al stock que ya existía se le asigna el proveedor "principal" de su
-- variante si tiene uno clasificado; si no, se queda sin proveedor (NULL)
-- para reclasificarse después a mano.
UPDATE "existencias" e
SET "proveedor_id" = pv."proveedor_id"
FROM "producto_variantes" pv
WHERE e."variante_id" = pv."id" AND pv."proveedor_id" IS NOT NULL;

-- Se quita el índice único viejo (solo sucursal+variante) y se reemplaza por
-- dos: uno para renglones ya clasificados por proveedor, y uno parcial para
-- el renglón "sin proveedor" (proveedor_id IS NULL) — en Postgres NULL no
-- cuenta como igual a otro NULL en un índice único normal, así que sin el
-- parcial podrían acumularse varios renglones "sin proveedor" para la misma
-- talla+sucursal.
DROP INDEX "existencias_sucursal_id_variante_id_key";
CREATE UNIQUE INDEX "existencias_sucursal_variante_proveedor_key" ON "existencias"("sucursal_id", "variante_id", "proveedor_id") WHERE "proveedor_id" IS NOT NULL;
CREATE UNIQUE INDEX "existencias_sucursal_variante_sin_proveedor_key" ON "existencias"("sucursal_id", "variante_id") WHERE "proveedor_id" IS NULL;

-- ============================================================================
-- 2. De qué proveedor salió/se movió el stock en cada operación
-- ============================================================================

ALTER TABLE "venta_items" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "apartado_items" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "apartado_items" ADD CONSTRAINT "apartado_items_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pedido_items" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transferencias_inventario" ADD COLUMN "proveedor_id" INTEGER;
ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
