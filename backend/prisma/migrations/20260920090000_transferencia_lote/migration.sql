-- Folio de lote en las transferencias entre sucursales (ver
-- TransferenciaInventario.loteFolio en schema.prisma y
-- GET /transferencias/reporte-pdf en routes/transferencias.js).
--
-- Migración puramente aditiva: una columna nullable + un índice. Las
-- transferencias ya guardadas quedan con lote_folio en NULL y siguen
-- funcionando igual (se pueden reportar por día).
ALTER TABLE "transferencias_inventario" ADD COLUMN IF NOT EXISTS "lote_folio" TEXT;
CREATE INDEX IF NOT EXISTS "transferencias_inventario_lote_folio_idx" ON "transferencias_inventario"("lote_folio");
