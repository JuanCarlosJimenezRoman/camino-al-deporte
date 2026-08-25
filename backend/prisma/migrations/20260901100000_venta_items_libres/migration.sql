-- Permite vender en el punto de venta artículos que NO están dados de alta
-- en el catálogo (ej. un producto de otra marca que se vende una sola vez,
-- un accesorio suelto, algo que trae el cliente a cambio, etc.) sin tener
-- que crear primero un Producto/ProductoVariante en el sistema.
--
-- Un venta_item ahora puede ser de dos tipos, nunca ambos a la vez:
--  - Normal: variante_id apunta a un producto real del catálogo — se
--    descuenta inventario como siempre.
--  - Libre ("producto no registrado"): variante_id es NULL y
--    descripcion_libre trae el texto que capturó el cajero. No hay
--    ProductoVariante ni Existencia de por medio, así que NO se toca
--    inventario ni se genera movimiento_inventario — es solo un renglón de
--    cobro. proveedor_id sigue siendo válido y opcional en este caso (de
--    dónde vino la mercancía, solo para referencia/reportes; no descuenta
--    ningún bucket de stock).

ALTER TABLE "venta_items" ALTER COLUMN "variante_id" DROP NOT NULL;
ALTER TABLE "venta_items" ADD COLUMN "descripcion_libre" TEXT;

ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_variante_o_libre_check"
  CHECK (
    ("variante_id" IS NOT NULL AND "descripcion_libre" IS NULL)
    OR
    ("variante_id" IS NULL AND "descripcion_libre" IS NOT NULL)
  );
