-- Reseñas de pedidos en línea: el cliente califica producto y envío (1 a 5)
-- con comentario y fotos opcionales del paquete recibido, una vez que su
-- pedido queda RECIBIDO. Una reseña por pedido (pedido_id es único).

CREATE TABLE "pedido_resenas" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "calificacion_producto" INTEGER NOT NULL,
    "calificacion_envio" INTEGER NOT NULL,
    "comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_resenas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedido_resenas_pedido_id_key" ON "pedido_resenas"("pedido_id");

CREATE TABLE "pedido_resena_fotos" (
    "id" SERIAL NOT NULL,
    "resena_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,

    CONSTRAINT "pedido_resena_fotos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pedido_resenas" ADD CONSTRAINT "pedido_resenas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pedido_resena_fotos" ADD CONSTRAINT "pedido_resena_fotos_resena_id_fkey" FOREIGN KEY ("resena_id") REFERENCES "pedido_resenas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
