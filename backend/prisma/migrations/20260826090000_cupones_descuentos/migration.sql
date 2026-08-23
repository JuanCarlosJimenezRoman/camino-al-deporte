-- Cupones (código, restringidos a productos específicos) para la tienda en
-- línea + descuento libre en ventas de sucursal + descuento manual
-- post-pedido confirmado por WhatsApp. Ver comentarios en schema.prisma
-- (modelos Cupon/CuponProducto/CuponUso y campos nuevos en Venta/Pedido).

-- ============================================================================
-- 1. Enum compartido por los tres tipos de descuento
-- ============================================================================

-- DO $$ ... EXCEPTION: la migración 20260817090000_descuento_y_columnas_pendientes
-- ya crea este mismo tipo (por si acaso, con la misma guardia); sin esto,
-- un reset desde cero (`prisma migrate reset`) truena con "type already
-- exists" al llegar aquí.
DO $$ BEGIN
  CREATE TYPE "TipoDescuento" AS ENUM ('PORCENTAJE', 'MONTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Cupones de la tienda en línea
-- ============================================================================

CREATE TABLE "cupones" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo_descuento" "TipoDescuento" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "monto_minimo" DECIMAL(10,2),
    "fecha_inicio" TIMESTAMP(3),
    "fecha_fin" TIMESTAMP(3),
    "usos_maximos" INTEGER,
    "usos_por_cliente" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cupones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cupones_codigo_key" ON "cupones"("codigo");

ALTER TABLE "cupones" ADD CONSTRAINT "cupones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Productos específicos a los que aplica cada cupón.
CREATE TABLE "cupon_productos" (
    "id" SERIAL NOT NULL,
    "cupon_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupon_productos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cupon_productos_cupon_id_producto_id_key" ON "cupon_productos"("cupon_id", "producto_id");

ALTER TABLE "cupon_productos" ADD CONSTRAINT "cupon_productos_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cupon_productos" ADD CONSTRAINT "cupon_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 3. Descuento libre en ventas de sucursal (mostrador) — sin código, lo
--    teclea el vendedor al registrar la venta.
-- ============================================================================

-- IF NOT EXISTS: la migración 20260817090000_descuento_y_columnas_pendientes
-- ya agrega estas mismas columnas; sin esto, un reset desde cero
-- (`prisma migrate reset`) truena con "column already exists" al llegar
-- aquí.
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_tipo" "TipoDescuento";
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_valor" DECIMAL(10,2);
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_monto" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_motivo" TEXT;

-- ============================================================================
-- 4. Pedidos en línea: cupón aplicado al crear el pedido + descuento manual
--    que el negocio activa después, mientras sigue PENDIENTE_PAGO.
-- ============================================================================

ALTER TABLE "pedidos" ADD COLUMN "cupon_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "cupon_codigo" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "cupon_descuento" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "pedidos" ADD COLUMN "descuento_manual_tipo" "TipoDescuento";
ALTER TABLE "pedidos" ADD COLUMN "descuento_manual_valor" DECIMAL(10,2);
ALTER TABLE "pedidos" ADD COLUMN "descuento_manual_monto" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "pedidos" ADD COLUMN "descuento_manual_notas" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "descuento_confirmado_whatsapp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedidos" ADD COLUMN "descuento_aplicado_por_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "descuento_aplicado_at" TIMESTAMP(3);

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_descuento_aplicado_por_id_fkey" FOREIGN KEY ("descuento_aplicado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un renglón por cada vez que un cliente usó un cupón (para contar
-- usos_maximos/usos_por_cliente y auditar cuánto se descontó en cada caso).
CREATE TABLE "cupon_usos" (
    "id" SERIAL NOT NULL,
    "cupon_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "monto_descontado" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupon_usos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cupon_usos_pedido_id_key" ON "cupon_usos"("pedido_id");

ALTER TABLE "cupon_usos" ADD CONSTRAINT "cupon_usos_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "cupones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cupon_usos" ADD CONSTRAINT "cupon_usos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cupon_usos" ADD CONSTRAINT "cupon_usos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
