-- Dos cosas relacionadas con el pago de pedidos en línea:
--
-- 1. "configuracion_tienda": fila única con el WhatsApp de contacto de la
--    tienda, como respaldo cuando un pedido no tiene un proveedor con
--    teléfono asignado (para que el botón de WhatsApp del cliente siempre
--    tenga a dónde mandar el mensaje).
--
-- 2. "pedidos.proveedor_pago_confirmado_id": a qué cuenta llegó realmente la
--    transferencia, elegido por el empleado al validar el pago. Null = la
--    cuenta de la tienda (cuenta_transferencia_id, ya existente); si se
--    elige un proveedor es porque el cliente le transfirió directo a él.

CREATE TABLE "configuracion_tienda" (
    "id" SERIAL NOT NULL,
    "whatsapp_tienda" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_tienda_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pedidos" ADD COLUMN "proveedor_pago_confirmado_id" INTEGER;

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_proveedor_pago_confirmado_id_fkey" FOREIGN KEY ("proveedor_pago_confirmado_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
