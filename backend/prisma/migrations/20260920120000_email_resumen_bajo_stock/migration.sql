-- Correo de las alertas de bajo stock en resumen en vez de uno por producto
-- (ver utils/bajoStock.js, utils/resumenBajoStock.js y
-- Notificacion.emailUrgente / emailEnviadoAt en schema.prisma).
--
-- Migración puramente aditiva: dos columnas nuevas (una con default, otra
-- nullable) y un índice. Las alertas de bajo stock anteriores YA se mandaron
-- por correo en su momento (una por una), así que se marcan como enviadas
-- para que el resumen no las vuelva a mandar.
ALTER TABLE "notificaciones" ADD COLUMN IF NOT EXISTS "email_urgente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notificaciones" ADD COLUMN IF NOT EXISTS "email_enviado_at" TIMESTAMP(3);

UPDATE "notificaciones"
SET "email_enviado_at" = "created_at"
WHERE "tipo" LIKE 'BAJO\_STOCK:%' AND "email_enviado_at" IS NULL;

CREATE INDEX IF NOT EXISTS "notificaciones_email_enviado_at_created_at_idx" ON "notificaciones"("email_enviado_at", "created_at");
