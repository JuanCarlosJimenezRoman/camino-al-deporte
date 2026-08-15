-- Favoritos de la tienda en línea: el cliente marca productos con el
-- corazón en la tarjeta de producto y puede verlos todos juntos en
-- /tienda/favoritos.

CREATE TABLE "cliente_favoritos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_favoritos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_favoritos_cliente_id_producto_id_key" ON "cliente_favoritos"("cliente_id", "producto_id");

ALTER TABLE "cliente_favoritos" ADD CONSTRAINT "cliente_favoritos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cliente_favoritos" ADD CONSTRAINT "cliente_favoritos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
