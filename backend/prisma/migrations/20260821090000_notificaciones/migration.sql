-- Notificaciones dentro del sistema (sin correo/SMS todavía). Empieza a
-- usarse con el flujo de "pedir mercancía a otra sucursal" desde Ventas,
-- pero el campo "tipo" queda libre para reutilizarla con otros eventos.

CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "transferencia_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notificaciones_usuario_id_leida_idx" ON "notificaciones"("usuario_id", "leida");

ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencias_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
