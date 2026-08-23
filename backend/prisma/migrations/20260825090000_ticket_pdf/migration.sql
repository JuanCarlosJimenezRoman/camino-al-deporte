-- El ticket digital ahora es un PDF (generado con pdfkit y subido a
-- Cloudinary) en vez de solo texto: se guarda su URL para poder
-- reabrirlo/reenviarlo después desde el historial sin regenerarlo.
-- IF NOT EXISTS: la migración 20260817090000_descuento_y_columnas_pendientes
-- ya agrega estas mismas columnas (ver su comentario); sin esto, un reset
-- desde cero (`prisma migrate reset`) truena con "column already exists"
-- al llegar aquí.
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "ticket_pdf_url" TEXT;
ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "ticket_pdf_public_id" TEXT;
