-- Envíos v2: rutas, puntos de entrega y cobertura (ver comentario extenso
-- en schema.prisma junto a estos modelos). Reemplaza la relación directa
-- transportista+destino+tamaño de TarifaEnvio por coberturaEnvioId+tamaño,
-- y redefine DestinoEnvio para que solo describa la ubicación del cliente
-- (transportistaSugeridoId/entregaDomicilio/puntoEntregaTexto se mudan a
-- CoberturaEnvio).
--
-- "destinos_envio" puede tener filas reales (nombre/municipio siguen
-- siendo válidos en la forma nueva, solo pierden columnas) — esas se
-- conservan. "tarifas_envio" en cambio sí se vacía a propósito: su forma
-- vieja (transportista+destino+tamaño+precio) no tiene forma de mapearse
-- sola a la nueva (coberturaEnvioId+tamaño) sin inventar una
-- CoberturaEnvio/RutaEnvio por cada fila, y las que había en producción
-- eran solo pruebas (confirmado con el dueño del proyecto) — se capturan
-- de nuevo ya con el modelo de cobertura. Los pedidos existentes tampoco
-- usan estos campos (tipoEnvio sigue siendo PAQUETERIA_NACIONAL en
-- todos), así que no hay nada más que dependa de las tarifas viejas.

CREATE TYPE "TipoEntrega" AS ENUM ('DOMICILIO', 'PUNTO_RECOLECCION', 'COTIZACION_MANUAL');

-- ---------------------------------------------------------------------
-- Tablas nuevas
-- ---------------------------------------------------------------------

CREATE TABLE "rutas_envio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "sucursal_origen_id" INTEGER NOT NULL,
    "transportista_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rutas_envio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "puntos_entrega" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado_mx" TEXT,
    "municipio" TEXT,
    "localidad" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puntos_entrega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rutas_puntos_entrega" (
    "id" SERIAL NOT NULL,
    "ruta_envio_id" INTEGER NOT NULL,
    "punto_entrega_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rutas_puntos_entrega_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coberturas_envio" (
    "id" SERIAL NOT NULL,
    "destino_envio_id" INTEGER NOT NULL,
    "ruta_envio_id" INTEGER NOT NULL,
    "tipo_entrega" "TipoEntrega" NOT NULL DEFAULT 'PUNTO_RECOLECCION',
    "punto_entrega_id" INTEGER,
    "prioridad" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coberturas_envio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rutas_puntos_entrega_ruta_envio_id_punto_entrega_id_key" ON "rutas_puntos_entrega"("ruta_envio_id", "punto_entrega_id");
CREATE UNIQUE INDEX "coberturas_envio_destino_envio_id_ruta_envio_id_key" ON "coberturas_envio"("destino_envio_id", "ruta_envio_id");

ALTER TABLE "rutas_envio" ADD CONSTRAINT "rutas_envio_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rutas_envio" ADD CONSTRAINT "rutas_envio_transportista_id_fkey" FOREIGN KEY ("transportista_id") REFERENCES "transportistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rutas_puntos_entrega" ADD CONSTRAINT "rutas_puntos_entrega_ruta_envio_id_fkey" FOREIGN KEY ("ruta_envio_id") REFERENCES "rutas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rutas_puntos_entrega" ADD CONSTRAINT "rutas_puntos_entrega_punto_entrega_id_fkey" FOREIGN KEY ("punto_entrega_id") REFERENCES "puntos_entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coberturas_envio" ADD CONSTRAINT "coberturas_envio_destino_envio_id_fkey" FOREIGN KEY ("destino_envio_id") REFERENCES "destinos_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coberturas_envio" ADD CONSTRAINT "coberturas_envio_ruta_envio_id_fkey" FOREIGN KEY ("ruta_envio_id") REFERENCES "rutas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coberturas_envio" ADD CONSTRAINT "coberturas_envio_punto_entrega_id_fkey" FOREIGN KEY ("punto_entrega_id") REFERENCES "puntos_entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- destinos_envio: se queda solo con "dónde vive el cliente"
-- ---------------------------------------------------------------------

ALTER TABLE "destinos_envio" DROP CONSTRAINT "destinos_envio_transportista_sugerido_id_fkey";
ALTER TABLE "destinos_envio" DROP COLUMN "transportista_sugerido_id";
ALTER TABLE "destinos_envio" DROP COLUMN "region";
ALTER TABLE "destinos_envio" DROP COLUMN "entrega_domicilio";
ALTER TABLE "destinos_envio" DROP COLUMN "punto_entrega_texto";
ALTER TABLE "destinos_envio" ADD COLUMN "estado_mx" TEXT;
ALTER TABLE "destinos_envio" ADD COLUMN "localidad" TEXT;
ALTER TABLE "destinos_envio" ADD COLUMN "codigo_postal" TEXT;

-- ---------------------------------------------------------------------
-- tarifas_envio: ahora depende de coberturaEnvioId, no de transportista+
-- destino directos. Se vacía primero (ver nota arriba) para poder agregar
-- las columnas nuevas como NOT NULL sin necesitar backfill.
-- ---------------------------------------------------------------------

DELETE FROM "tarifas_envio";

ALTER TABLE "tarifas_envio" DROP CONSTRAINT "tarifas_envio_transportista_id_fkey";
ALTER TABLE "tarifas_envio" DROP CONSTRAINT "tarifas_envio_destino_id_fkey";
DROP INDEX "tarifas_envio_transportista_id_destino_id_tamano_key";
ALTER TABLE "tarifas_envio" DROP COLUMN "transportista_id";
ALTER TABLE "tarifas_envio" DROP COLUMN "destino_id";
ALTER TABLE "tarifas_envio" DROP COLUMN "precio";
ALTER TABLE "tarifas_envio" ADD COLUMN "cobertura_envio_id" INTEGER NOT NULL;
ALTER TABLE "tarifas_envio" ADD COLUMN "costo_real" DECIMAL(10,2) NOT NULL;
ALTER TABLE "tarifas_envio" ADD COLUMN "precio_cliente" DECIMAL(10,2) NOT NULL;

CREATE UNIQUE INDEX "tarifas_envio_cobertura_envio_id_tamano_key" ON "tarifas_envio"("cobertura_envio_id", "tamano");
ALTER TABLE "tarifas_envio" ADD CONSTRAINT "tarifas_envio_cobertura_envio_id_fkey" FOREIGN KEY ("cobertura_envio_id") REFERENCES "coberturas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- pedidos: snapshot de envío v2 (todo opcional, no toca lo existente)
-- ---------------------------------------------------------------------

ALTER TABLE "pedidos" ADD COLUMN "sucursal_despacho_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "cobertura_envio_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "ruta_envio_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "punto_entrega_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "tarifa_envio_id" INTEGER;
ALTER TABLE "pedidos" ADD COLUMN "tipo_entrega" "TipoEntrega";
ALTER TABLE "pedidos" ADD COLUMN "costo_envio_real" DECIMAL(10,2);

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sucursal_despacho_id_fkey" FOREIGN KEY ("sucursal_despacho_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cobertura_envio_id_fkey" FOREIGN KEY ("cobertura_envio_id") REFERENCES "coberturas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_ruta_envio_id_fkey" FOREIGN KEY ("ruta_envio_id") REFERENCES "rutas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_punto_entrega_id_fkey" FOREIGN KEY ("punto_entrega_id") REFERENCES "puntos_entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_tarifa_envio_id_fkey" FOREIGN KEY ("tarifa_envio_id") REFERENCES "tarifas_envio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- configuracion_tienda: botón tarifa fija / dinámica
-- ---------------------------------------------------------------------

ALTER TABLE "configuracion_tienda" ADD COLUMN "envio_dinamico_activo" BOOLEAN NOT NULL DEFAULT false;
