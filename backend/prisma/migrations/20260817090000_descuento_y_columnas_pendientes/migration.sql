-- Esta migración usa "IF NOT EXISTS" en vez de las sentencias planas de
-- costumbre porque varias de estas columnas (teléfono del cliente, PDF del
-- ticket, Phone Number ID de WhatsApp) ya se agregaron a schema.prisma en
-- entregas anteriores pero nunca quedó su migración correspondiente en este
-- repo — así que no sabemos con certeza si ya existen en la base de datos
-- real o no. Con IF NOT EXISTS esta migración se puede aplicar sin riesgo
-- sin importar en qué estado esté la base actualmente.

ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "cliente_telefono" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "ticket_pdf_url" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "ticket_pdf_public_id" TEXT;
ALTER TABLE "sucursales" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" TEXT;
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" TEXT;

-- Tipo usado por Venta.descuento_tipo (y ya referenciado por Cupon y
-- Pedido en schema.prisma) — se crea solo si no existe todavía.
DO $$ BEGIN
  CREATE TYPE "TipoDescuento" AS ENUM ('PORCENTAJE', 'MONTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Descuento libre que el vendedor puede capturar al registrar la venta en
-- el punto de venta (ver POST /ventas y utils/ticketPdf.js).
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_tipo" "TipoDescuento";
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_valor" DECIMAL(10,2);
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_monto" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "descuento_motivo" TEXT;

-- Efectivo recibido en el punto de venta, para poder mostrar "cambio dado"
-- en el ticket digital cuando el método de pago es efectivo.
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "efectivo_recibido" DECIMAL(10,2);
