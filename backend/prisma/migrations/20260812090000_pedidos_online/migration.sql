-- Tienda en línea: cuentas de clientes, pedidos de pago único por SPEI
-- (comprobante + validación manual) y su ciclo de envío/entrega.

-- ============================================================================
-- 1. Clientes: cuenta propia para la tienda en línea
-- ============================================================================

ALTER TABLE "clientes" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "clientes" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- ============================================================================
-- 2. Cuentas de transferencia: cuáles se muestran en la tienda en línea
-- ============================================================================

ALTER TABLE "cuentas_transferencia" ADD COLUMN "para_ventas_online" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 3. movimientos_inventario: usuario_id pasa a ser opcional (los movimientos
--    generados por un pedido en línea no los hace ningún empleado) y se
--    agrega la referencia opcional al pedido que los generó.
-- ============================================================================

ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "movimientos_inventario_usuario_id_fkey";
ALTER TABLE "movimientos_inventario" ALTER COLUMN "usuario_id" DROP NOT NULL;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movimientos_inventario" ADD COLUMN "pedido_id" INTEGER;

-- ============================================================================
-- 4. Nuevo valor de enum TipoMovimiento
-- ============================================================================

ALTER TYPE "TipoMovimiento" ADD VALUE 'PEDIDO_ONLINE';

-- ============================================================================
-- 5. Pedidos (tienda en línea)
-- ============================================================================

CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE_PAGO', 'EN_VALIDACION', 'PAGADO', 'ENVIADO', 'RECIBIDO', 'CANCELADO');

CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "folio" TEXT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "destinatario" TEXT NOT NULL,
    "telefono_contacto" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "numero_ext" TEXT NOT NULL,
    "numero_int" TEXT,
    "colonia" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "estado_mx" TEXT NOT NULL,
    "codigo_postal" TEXT NOT NULL,
    "referencias" TEXT,
    "cuenta_transferencia_id" INTEGER,
    "referencia_pago" TEXT NOT NULL,
    "comprobante_url" TEXT,
    "comprobante_public_id" TEXT,
    "comprobante_subido_at" TIMESTAMP(3),
    "comprobante_rechazado_motivo" TEXT,
    "validado_por_id" INTEGER,
    "validado_at" TIMESTAMP(3),
    "paqueteria" TEXT,
    "numero_guia" TEXT,
    "enviado_at" TIMESTAMP(3),
    "recibido_at" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedidos_folio_key" ON "pedidos"("folio");

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cuenta_transferencia_id_fkey" FOREIGN KEY ("cuenta_transferencia_id") REFERENCES "cuentas_transferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_validado_por_id_fkey" FOREIGN KEY ("validado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "pedido_items" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "sucursal_stock_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_sucursal_stock_id_fkey" FOREIGN KEY ("sucursal_stock_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ahora que "pedidos" existe, agregamos la FK pendiente en movimientos_inventario.
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
