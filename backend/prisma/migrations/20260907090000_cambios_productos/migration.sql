-- Cambios de producto (no reembolsos): el cliente devuelve un producto
-- (defectuoso, no le gustó, o no le quedó) y se lleva otro en su lugar. Si
-- el producto nuevo cuesta menos, el saldo a favor se debe cubrir con otro
-- producto en la misma visita (nunca se guarda como saldo pendiente ni se
-- reembolsa en efectivo); si cuesta más, el cliente paga la diferencia. Ver
-- comentarios en schema.prisma junto a los modelos Cambio/CambioItem.

CREATE TYPE "MotivoCambio" AS ENUM ('DEFECTUOSO', 'NO_LE_GUSTO', 'NO_QUEDO');
CREATE TYPE "EstadoCambio" AS ENUM ('COMPLETADO', 'CANCELADO');
CREATE TYPE "DireccionCambioItem" AS ENUM ('DEVUELTO', 'ENTREGADO');

-- Nuevos valores del enum ya existente para inventario. No se consumen en
-- esta misma migración (Postgres no permite usar un valor de enum recién
-- agregado dentro de la misma transacción que lo crea) — el backend los usa
-- después, en tiempo de ejecución, igual que ya se hizo para APARTADO/
-- PEDIDO_ONLINE en migraciones anteriores.
ALTER TYPE "TipoMovimiento" ADD VALUE 'CAMBIO_ENTRADA';
ALTER TYPE "TipoMovimiento" ADD VALUE 'CAMBIO_SALIDA';

CREATE TABLE "cambios" (
    "id" SERIAL NOT NULL,
    "folio" TEXT NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "venta_origen_id" INTEGER,
    "cliente" TEXT,
    "cliente_telefono" TEXT,
    "total_devuelto" DECIMAL(10,2) NOT NULL,
    "total_nuevo" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "metodo_pago" "MetodoPago",
    "cuenta_transferencia_id" INTEGER,
    "comprobante_url" TEXT,
    "comprobante_public_id" TEXT,
    "efectivo_recibido" DECIMAL(10,2),
    "notas" TEXT,
    "estado" "EstadoCambio" NOT NULL DEFAULT 'COMPLETADO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cambios_folio_key" ON "cambios"("folio");

ALTER TABLE "cambios" ADD CONSTRAINT "cambios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_venta_origen_id_fkey" FOREIGN KEY ("venta_origen_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_cuenta_transferencia_id_fkey" FOREIGN KEY ("cuenta_transferencia_id") REFERENCES "cuentas_transferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cambio_items" (
    "id" SERIAL NOT NULL,
    "cambio_id" INTEGER NOT NULL,
    "direccion" "DireccionCambioItem" NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "motivo" "MotivoCambio",
    "motivo_detalle" TEXT,
    "reingresado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cambio_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cambio_items" ADD CONSTRAINT "cambio_items_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambio_items" ADD CONSTRAINT "cambio_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "producto_variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambio_items" ADD CONSTRAINT "cambio_items_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Movimientos de inventario generados por un cambio (trazabilidad, mismo
-- patrón que ya existe para transferencias/pedidos en línea).
ALTER TABLE "movimientos_inventario" ADD COLUMN "cambio_id" INTEGER;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
