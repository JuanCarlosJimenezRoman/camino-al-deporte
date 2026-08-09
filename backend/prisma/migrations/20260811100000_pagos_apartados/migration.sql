-- Métodos de pago, cuentas de transferencia, clientes y apartados (layaway).

-- ============================================================================
-- 1. Métodos de pago
-- ============================================================================

CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');

CREATE TABLE "cuentas_transferencia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "banco" TEXT,
    "titular" TEXT,
    "numero_cuenta" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_transferencia_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 2. ventas: convertir metodo_pago de texto libre a enum (con backfill seguro)
-- ============================================================================

ALTER TABLE "ventas" ADD COLUMN "metodo_pago_nuevo" "MetodoPago";

-- Cualquier venta previa (texto libre o vacía) se clasifica lo mejor posible;
-- si no se puede reconocer, se asume EFECTIVO (era el único método real
-- disponible antes de este cambio, ya que el formulario de ventas todavía no
-- pedía método de pago).
UPDATE "ventas" SET "metodo_pago_nuevo" =
  CASE
    WHEN UPPER(COALESCE("metodo_pago", '')) LIKE '%TARJETA%' THEN 'TARJETA'::"MetodoPago"
    WHEN UPPER(COALESCE("metodo_pago", '')) LIKE '%TRANSF%' THEN 'TRANSFERENCIA'::"MetodoPago"
    ELSE 'EFECTIVO'::"MetodoPago"
  END;

ALTER TABLE "ventas" ALTER COLUMN "metodo_pago_nuevo" SET NOT NULL;
ALTER TABLE "ventas" ALTER COLUMN "metodo_pago_nuevo" SET DEFAULT 'EFECTIVO';

ALTER TABLE "ventas" DROP COLUMN "metodo_pago";
ALTER TABLE "ventas" RENAME COLUMN "metodo_pago_nuevo" TO "metodo_pago";

ALTER TABLE "ventas" ADD COLUMN "cuenta_transferencia_id" INTEGER;
ALTER TABLE "ventas" ADD COLUMN "comprobante_url" TEXT;
ALTER TABLE "ventas" ADD COLUMN "comprobante_public_id" TEXT;

ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuenta_transferencia_id_fkey" FOREIGN KEY ("cuenta_transferencia_id") REFERENCES "cuentas_transferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 3. Clientes
-- ============================================================================

CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clientes_telefono_key" ON "clientes"("telefono");

-- ============================================================================
-- 4. Apartados (layaway)
-- ============================================================================

CREATE TYPE "EstadoApartado" AS ENUM ('ACTIVO', 'LIQUIDADO', 'CANCELADO');

CREATE TABLE "apartados" (
    "id" SERIAL NOT NULL,
    "folio" TEXT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "sucursal_venta_id" INTEGER NOT NULL,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" "EstadoApartado" NOT NULL DEFAULT 'ACTIVO',
    "fecha_limite" TIMESTAMP(3),
    "notas" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apartados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apartados_folio_key" ON "apartados"("folio");

ALTER TABLE "apartados" ADD CONSTRAINT "apartados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_sucursal_venta_id_fkey" FOREIGN KEY ("sucursal_venta_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "apartado_items" (
    "id" SERIAL NOT NULL,
    "apartado_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "sucursal_stock_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "apartado_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "apartado_items" ADD CONSTRAINT "apartado_items_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apartado_items" ADD CONSTRAINT "apartado_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apartado_items" ADD CONSTRAINT "apartado_items_sucursal_stock_id_fkey" FOREIGN KEY ("sucursal_stock_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "apartado_pagos" (
    "id" SERIAL NOT NULL,
    "apartado_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "cuenta_transferencia_id" INTEGER,
    "comprobante_url" TEXT,
    "comprobante_public_id" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apartado_pagos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "apartado_pagos" ADD CONSTRAINT "apartado_pagos_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "apartado_pagos" ADD CONSTRAINT "apartado_pagos_cuenta_transferencia_id_fkey" FOREIGN KEY ("cuenta_transferencia_id") REFERENCES "cuentas_transferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "apartado_pagos" ADD CONSTRAINT "apartado_pagos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 5. Nuevo valor de enum para movimientos de inventario por apartado
-- ============================================================================

ALTER TYPE "TipoMovimiento" ADD VALUE 'APARTADO';
