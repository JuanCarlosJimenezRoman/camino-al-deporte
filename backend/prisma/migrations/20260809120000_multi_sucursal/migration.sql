-- Multi-sucursal: agrega sucursales, mueve el stock de producto_variantes a
-- una tabla existencias (stock por sucursal), y agrega transferencias de
-- mercancía entre sucursales.
--
-- Esta migración es segura sobre datos ya existentes: crea una
-- "Sucursal Principal" por defecto y le asigna todo el stock/movimientos/
-- ventas que ya tenías antes de que existiera el concepto de sucursal.

-- ============================================================================
-- 1. Tabla sucursales + sucursal por defecto
-- ============================================================================

CREATE TABLE "sucursales" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "es_bodega_central" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

-- Sucursal por defecto: aquí "aterriza" todo lo que ya existía antes de
-- este cambio (stock actual, movimientos, ventas).
INSERT INTO "sucursales" ("nombre", "codigo", "es_bodega_central", "activo")
VALUES ('Sucursal Principal', 'PRINCIPAL', true, true);

-- ============================================================================
-- 2. Tabla existencias (stock por sucursal) + backfill desde producto_variantes
-- ============================================================================

CREATE TABLE "existencias" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "stock_actual" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("id")
);

INSERT INTO "existencias" ("sucursal_id", "variante_id", "stock_actual", "stock_minimo")
SELECT (SELECT "id" FROM "sucursales" WHERE "codigo" = 'PRINCIPAL'), "id", "stock_actual", "stock_minimo"
FROM "producto_variantes";

CREATE UNIQUE INDEX "existencias_sucursal_id_variante_id_key" ON "existencias"("sucursal_id", "variante_id");

ALTER TABLE "existencias" ADD CONSTRAINT "existencias_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ya migrado a "existencias": quitamos el stock global de producto_variantes.
ALTER TABLE "producto_variantes" DROP COLUMN "stock_actual";
ALTER TABLE "producto_variantes" DROP COLUMN "stock_minimo";

-- ============================================================================
-- 3. usuarios.sucursal_id (nullable: admin/desarrollo ven todas)
-- ============================================================================

ALTER TABLE "usuarios" ADD COLUMN "sucursal_id" INTEGER;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 4. movimientos_inventario.sucursal_id (NOT NULL, con backfill)
-- ============================================================================

ALTER TABLE "movimientos_inventario" ADD COLUMN "sucursal_id" INTEGER;
UPDATE "movimientos_inventario" SET "sucursal_id" = (SELECT "id" FROM "sucursales" WHERE "codigo" = 'PRINCIPAL');
ALTER TABLE "movimientos_inventario" ALTER COLUMN "sucursal_id" SET NOT NULL;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movimientos_inventario" ADD COLUMN "transferencia_id" INTEGER;

-- ============================================================================
-- 5. ventas.sucursal_id (NOT NULL, con backfill)
-- ============================================================================

ALTER TABLE "ventas" ADD COLUMN "sucursal_id" INTEGER;
UPDATE "ventas" SET "sucursal_id" = (SELECT "id" FROM "sucursales" WHERE "codigo" = 'PRINCIPAL');
ALTER TABLE "ventas" ALTER COLUMN "sucursal_id" SET NOT NULL;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 6. Nuevos valores de enum TipoMovimiento (transferencias)
-- ============================================================================

ALTER TYPE "TipoMovimiento" ADD VALUE 'TRANSFERENCIA_SALIDA';
ALTER TYPE "TipoMovimiento" ADD VALUE 'TRANSFERENCIA_ENTRADA';

-- ============================================================================
-- 7. Tabla transferencias_inventario
-- ============================================================================

CREATE TYPE "EstadoTransferencia" AS ENUM ('SOLICITADA', 'RECIBIDA', 'CANCELADA');

CREATE TABLE "transferencias_inventario" (
    "id" SERIAL NOT NULL,
    "folio" TEXT NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "sucursal_origen_id" INTEGER NOT NULL,
    "sucursal_destino_id" INTEGER NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'SOLICITADA',
    "solicitado_por_id" INTEGER NOT NULL,
    "recibido_por_id" INTEGER,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibido_at" TIMESTAMP(3),

    CONSTRAINT "transferencias_inventario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transferencias_inventario_folio_key" ON "transferencias_inventario"("folio");

ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transferencias_inventario" ADD CONSTRAINT "transferencias_inventario_recibido_por_id_fkey" FOREIGN KEY ("recibido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ahora que la tabla existe, agregamos la FK pendiente en movimientos_inventario.
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencias_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
