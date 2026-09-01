-- Descuento libre (% o $) para apartados, aplicable al crearlos o después
-- mientras siguen ACTIVO (típicamente al momento de liquidarlos) — mismo
-- patrón que el de ventas (ver 20260817090000_descuento_y_columnas_pendientes,
-- que ya creó el tipo "TipoDescuento" reutilizado aquí).
ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "descuento_tipo" "TipoDescuento";
ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "descuento_valor" DECIMAL(10,2);
ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "descuento_monto" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "apartados" ADD COLUMN IF NOT EXISTS "descuento_motivo" TEXT;
