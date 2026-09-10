-- Saldo a favor del cliente, cliente registrado obligatorio en Cambios, y
-- producto no registrado en catálogo en ambos lados de un Cambio. Ver
-- docs/CAMBIOS_SALDO_A_FAVOR.md y los comentarios junto a los modelos
-- Cliente.saldoFavor / MovimientoSaldoCliente / Cambio / CambioItem en
-- schema.prisma.

-- 1. Tipo de movimiento de saldo (ledger, mismo patrón que
--    MovimientoInventario para el stock).
CREATE TYPE "TipoMovimientoSaldo" AS ENUM ('ABONO', 'CONSUMO', 'REVERSA');

-- 2. Saldo a favor del cliente.
ALTER TABLE "clientes" ADD COLUMN "saldo_favor" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 3. Ledger de movimientos de saldo.
CREATE TABLE "movimientos_saldo_cliente" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoSaldo" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "saldo_resultante" DECIMAL(10,2) NOT NULL,
    "cambio_id" INTEGER,
    "venta_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_saldo_cliente_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "movimientos_saldo_cliente" ADD CONSTRAINT "movimientos_saldo_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_saldo_cliente" ADD CONSTRAINT "movimientos_saldo_cliente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_saldo_cliente" ADD CONSTRAINT "movimientos_saldo_cliente_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_saldo_cliente" ADD CONSTRAINT "movimientos_saldo_cliente_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movimientos_saldo_cliente" ADD CONSTRAINT "movimientos_saldo_cliente_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Ventas: cliente registrado opcional (para poder cobrar con saldo a
--    favor) + cuánto del total se pagó con saldo.
ALTER TABLE "ventas" ADD COLUMN "cliente_registrado_id" INTEGER;
ALTER TABLE "ventas" ADD COLUMN "saldo_aplicado" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_registrado_id_fkey" FOREIGN KEY ("cliente_registrado_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Cambios: cliente registrado obligatorio (antes texto libre cliente /
--    cliente_telefono). Se agrega nullable primero, se rellena con un
--    backfill y hasta el final se vuelve NOT NULL — así no se rompe si ya
--    hay cambios registrados en producción.
ALTER TABLE "cambios" ADD COLUMN "cliente_id" INTEGER;

DO $$
DECLARE
  fila RECORD;
  cid INTEGER;
BEGIN
  FOR fila IN SELECT id, cliente, cliente_telefono FROM "cambios" WHERE cliente_id IS NULL LOOP
    cid := NULL;
    IF fila.cliente_telefono IS NOT NULL AND fila.cliente_telefono <> '' THEN
      -- Intenta encontrar un cliente ya existente con ese teléfono (pudo
      -- haberse registrado después, ej. en un apartado) antes de crear uno
      -- nuevo, para no duplicar.
      SELECT id INTO cid FROM "clientes" WHERE telefono = fila.cliente_telefono LIMIT 1;
      IF cid IS NULL THEN
        INSERT INTO "clientes" (nombre, telefono, activo, created_at)
        VALUES (COALESCE(NULLIF(fila.cliente, ''), 'Cliente sin registrar'), fila.cliente_telefono, true, CURRENT_TIMESTAMP)
        RETURNING id INTO cid;
      END IF;
    ELSE
      -- No había ni teléfono capturado: se da de alta un cliente con un
      -- teléfono sintético único (telefono es UNIQUE en "clientes") para no
      -- perder la trazabilidad del cambio histórico.
      INSERT INTO "clientes" (nombre, telefono, activo, created_at)
      VALUES (COALESCE(NULLIF(fila.cliente, ''), 'Cliente sin registrar'), 'SIN-TELEFONO-CAMBIO-' || fila.id, true, CURRENT_TIMESTAMP)
      RETURNING id INTO cid;
    END IF;
    UPDATE "cambios" SET cliente_id = cid WHERE id = fila.id;
  END LOOP;
END $$;

ALTER TABLE "cambios" ALTER COLUMN "cliente_id" SET NOT NULL;
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cambios" DROP COLUMN "cliente";
ALTER TABLE "cambios" DROP COLUMN "cliente_telefono";

-- 6. Cambio items: permitir producto no registrado en el catálogo, en
--    cualquiera de los dos lados del cambio (devuelto o entregado) — mismo
--    patrón que venta_items (ver migración 20260901100000_venta_items_libres).
ALTER TABLE "cambio_items" ALTER COLUMN "variante_id" DROP NOT NULL;
ALTER TABLE "cambio_items" ADD COLUMN "descripcion_libre" TEXT;
ALTER TABLE "cambio_items" ADD CONSTRAINT "cambio_items_variante_o_libre_check"
  CHECK (
    ("variante_id" IS NOT NULL AND "descripcion_libre" IS NULL)
    OR
    ("variante_id" IS NULL AND "descripcion_libre" IS NOT NULL)
  );
