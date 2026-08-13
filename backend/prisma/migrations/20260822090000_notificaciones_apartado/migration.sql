-- Las notificaciones ahora también pueden venir de un apartado cuyo stock
-- se reservó en una sucursal distinta a la que atiende al cliente (ver
-- POST /apartados en routes/apartados.js).

ALTER TABLE "notificaciones" ADD COLUMN "apartado_id" INTEGER;

ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_apartado_id_fkey" FOREIGN KEY ("apartado_id") REFERENCES "apartados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
