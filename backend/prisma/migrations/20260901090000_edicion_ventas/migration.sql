-- Registro de auditoría de correcciones que un administrador hace a una
-- venta ya registrada (ver PATCH /ventas/:id/editar) — por ejemplo, se
-- vendió con el proveedor equivocado, o hay que corregir el método de pago
-- o un descuento. Cada fila es una edición con su motivo obligatorio, quién
-- la hizo, y un snapshot JSON de qué cambió (antes/después).

CREATE TABLE "venta_ediciones" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "cambios" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_ediciones_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "venta_ediciones" ADD CONSTRAINT "venta_ediciones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venta_ediciones" ADD CONSTRAINT "venta_ediciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "venta_ediciones_venta_id_idx" ON "venta_ediciones"("venta_id");
