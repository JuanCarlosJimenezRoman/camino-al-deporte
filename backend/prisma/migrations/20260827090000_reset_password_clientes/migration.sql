-- Tokens de un solo uso para "olvidé mi contraseña" (clientes de la tienda
-- en línea). Se guarda solo el hash del token (igual que las contraseñas),
-- nunca el token en claro, con expiración corta y marca de uso para que no
-- pueda reutilizarse.

CREATE TABLE "cliente_reset_tokens" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_reset_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cliente_reset_tokens" ADD CONSTRAINT "cliente_reset_tokens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
