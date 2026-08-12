-- Costo de envío: por ahora un monto fijo global (configuracion_tienda),
-- que se copia al pedido al crearlo (pedidos.costo_envio) para que cambios
-- futuros a la tarifa no afecten pedidos ya hechos.

ALTER TABLE "configuracion_tienda" ADD COLUMN "costo_envio" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "pedidos" ADD COLUMN "costo_envio" DECIMAL(10,2) NOT NULL DEFAULT 0;
