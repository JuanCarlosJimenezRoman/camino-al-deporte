-- El SKU de fábrica en calzado viene por LOTE de tallas (ej. un mismo SKU
-- cubre 23-25.5 cm y otro cubre 26-32 cm): el mismo texto se repite
-- legítimamente entre varias variantes/tallas del mismo producto. La
-- restricción de único sobre "sku" bloqueaba dar de alta una talla nueva
-- que comparte SKU con otra ya existente, así que se quita.
--
-- En su lugar se agrega "codigo_interno": único de verdad, generado por la
-- aplicación (ver backend/src/utils/codigoInterno.js) a partir de
-- sku+talla+color con un sufijo si llegara a colisionar. Sirve como
-- identificador estable por variante para trazabilidad/etiquetado, sin
-- depender de que el SKU de fábrica sea único.

-- ============================================================================
-- 1. Quitar la unicidad del SKU de fábrica
-- ============================================================================

DROP INDEX "producto_variantes_sku_key";

-- ============================================================================
-- 2. Agregar codigo_interno y llenarlo para las variantes que ya existen
-- ============================================================================

ALTER TABLE "producto_variantes" ADD COLUMN "codigo_interno" TEXT;

WITH base AS (
  SELECT
    pv."id",
    UPPER(
      REGEXP_REPLACE(
        COALESCE(pv."sku", 'VAR')
          || COALESCE('-' || t."valor", '')
          || COALESCE('-' || pv."color", ''),
        '\s+', '', 'g'
      )
    ) AS codigo_base
  FROM "producto_variantes" pv
  LEFT JOIN "tallas" t ON t."id" = pv."talla_id"
),
numerado AS (
  SELECT
    "id",
    codigo_base,
    ROW_NUMBER() OVER (PARTITION BY codigo_base ORDER BY "id") AS rn
  FROM base
)
UPDATE "producto_variantes" pv
SET "codigo_interno" = CASE WHEN n.rn = 1 THEN n.codigo_base ELSE n.codigo_base || '-' || n.rn END
FROM numerado n
WHERE pv."id" = n."id";

ALTER TABLE "producto_variantes" ALTER COLUMN "codigo_interno" SET NOT NULL;
CREATE UNIQUE INDEX "producto_variantes_codigo_interno_key" ON "producto_variantes"("codigo_interno");
