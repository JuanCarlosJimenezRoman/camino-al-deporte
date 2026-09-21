-- Nuevo estado ENTREGADO para apartados: un apartado LIQUIDADO (pagado por
-- completo) ya no significa "entregado" — ahora hay que confirmar la entrega
-- aparte (POST /apartados/:id/entregar), y solo se puede entregar si está
-- LIQUIDADO. Se guarda quién y cuándo lo entregó.
--
-- Migración puramente aditiva. Los apartados que ya estaban LIQUIDADO se
-- quedan así (= "liquidado, pendiente de entregar"): el sistema no tiene
-- forma de saber cuáles ya se entregaron físicamente, así que el vendedor
-- los confirma uno por uno desde la pantalla de Apartados.
--
-- El valor nuevo del enum no se usa en esta misma migración (Postgres no lo
-- permite dentro de la misma transacción en que se agrega).
ALTER TYPE "EstadoApartado" ADD VALUE IF NOT EXISTS 'ENTREGADO';

ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "entregado_at" TIMESTAMP(3);
ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "entregado_por_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartados_entregado_por_id_fkey') THEN
    ALTER TABLE "apartados"
      ADD CONSTRAINT "apartados_entregado_por_id_fkey"
      FOREIGN KEY ("entregado_por_id") REFERENCES "usuarios"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
