-- Envíos: catálogo de transportistas (paquetería nacional y transporte
-- local dentro de Oaxaca), destinos conocidos y tarifas por tamaño de
-- paquete. Ver comentarios en schema.prisma junto a estos modelos.
--
-- Migración puramente aditiva: crea tablas nuevas y agrega columnas
-- opcionales a "pedidos" (tipo_envio con default, el resto nullable), sin
-- tocar ni renombrar nada existente. Los pedidos ya guardados no se ven
-- afectados: paqueteria/numero_guia/costo_envio siguen funcionando igual
-- que hasta hoy.

CREATE TYPE "TipoEnvio" AS ENUM ('PAQUETERIA_NACIONAL', 'TRANSPORTE_LOCAL', 'OTRO');
CREATE TYPE "TipoTransportista" AS ENUM ('PAQUETERIA', 'AUTOBUS', 'SUBURBAN', 'TAXI', 'LINEA_TRANSPORTE', 'OTRO');
CREATE TYPE "TamanoPaquete" AS ENUM ('CHICO', 'MEDIANO', 'GRANDE', 'EXTRA_GRANDE');

CREATE TABLE "transportistas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoTransportista" NOT NULL,
    "es_nacional" BOOLEAN NOT NULL DEFAULT false,
    "telefono" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transportistas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destinos_envio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "region" TEXT,
    "transportista_sugerido_id" INTEGER,
    "entrega_domicilio" BOOLEAN NOT NULL DEFAULT true,
    "punto_entrega_texto" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinos_envio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tarifas_envio" (
    "id" SERIAL NOT NULL,
    "transportista_id" INTEGER NOT NULL,
    "destino_id" INTEGER NOT NULL,
    "tamano" "TamanoPaquete" NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_envio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "destinos_envio_nombre_municipio_key" ON "destinos_envio"("nombre", "municipio");
CREATE UNIQUE INDEX "tarifas_envio_transportista_id_destino_id_tamano_key" ON "tarifas_envio"("transportista_id", "destino_id", "tamano");

ALTER TABLE "destinos_envio" ADD CONSTRAINT "destinos_envio_transportista_sugerido_id_fkey" FOREIGN KEY ("transportista_sugerido_id") REFERENCES "transportistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifas_envio" ADD CONSTRAINT "tarifas_envio_transportista_id_fkey" FOREIGN KEY ("transportista_id") REFERENCES "transportistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifas_envio" ADD CONSTRAINT "tarifas_envio_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "destinos_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pedido: campos opcionales para transporte local (ver comentario en
-- schema.prisma). tipo_envio con DEFAULT 'PAQUETERIA_NACIONAL' para que los
-- pedidos ya existentes (todos paquetería nacional hasta hoy) queden
-- clasificados igual sin necesitar backfill manual.
ALTER TABLE "pedidos" ADD COLUMN "tipo_envio" "TipoEnvio" NOT NULL DEFAULT 'PAQUETERIA_NACIONAL';
ALTER TABLE "pedidos" ADD COLUMN "transportista_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "destino_envio_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "tamano_paquete" "TamanoPaquete";
ALTER TABLE "pedidos" ADD COLUMN "punto_entrega_texto" TEXT;

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_transportista_id_fkey" FOREIGN KEY ("transportista_id") REFERENCES "transportistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_destino_envio_id_fkey" FOREIGN KEY ("destino_envio_id") REFERENCES "destinos_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
