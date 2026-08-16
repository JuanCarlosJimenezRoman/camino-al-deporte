-- Pedidos capturados por el negocio a partir de un pedido que llegó por otro
-- canal (WhatsApp, Instagram, Facebook, teléfono) en vez del checkout de la
-- tienda en línea. Se reutiliza el modelo "pedidos" que ya existía (misma
-- dirección de envío, mismo ciclo de estados) en vez de crear una tabla
-- aparte — ver el comentario sobre el modelo Pedido en schema.prisma y
-- POST /pedidos-online en routes/pedidosOnline.js.

CREATE TYPE "OrigenPedido" AS ENUM ('TIENDA_ONLINE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEFONO', 'OTRO');

-- Todos los pedidos ya existentes vienen del checkout de la tienda en línea,
-- así que el default cubre exactamente el estado real de los datos actuales.
ALTER TABLE "pedidos" ADD COLUMN "origen" "OrigenPedido" NOT NULL DEFAULT 'TIENDA_ONLINE';

-- Quién capturó el pedido a mano (null = lo armó el cliente mismo).
ALTER TABLE "pedidos" ADD COLUMN "creado_por_id" INTEGER;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Método de pago real: hasta ahora todo pedido era forzosamente TRANSFERENCIA
-- (único método del checkout), así que el default también cubre los pedidos
-- ya existentes sin necesidad de reclasificarlos.
ALTER TABLE "pedidos" ADD COLUMN "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'TRANSFERENCIA';
