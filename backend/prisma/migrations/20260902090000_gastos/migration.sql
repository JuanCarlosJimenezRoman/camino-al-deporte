-- Gastos: salidas de dinero por sucursal, atribuibles a uno o varios
-- proveedores (ver comentario en schema.prisma junto a Gasto/GastoProveedor).

CREATE TYPE "GastoNivel" AS ENUM ('PROVEEDOR', 'SUCURSAL');

CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nivel" "GastoNivel" NOT NULL,
    "motivo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "notas" TEXT,
    "registrado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gasto_proveedores" (
    "id" SERIAL NOT NULL,
    "gasto_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "gasto_proveedores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gasto_proveedores_gasto_id_proveedor_id_key" ON "gasto_proveedores"("gasto_id", "proveedor_id");

ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gasto_proveedores" ADD CONSTRAINT "gasto_proveedores_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gasto_proveedores" ADD CONSTRAINT "gasto_proveedores_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
