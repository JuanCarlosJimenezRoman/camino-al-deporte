-- El ticket digital ahora es un PDF (generado con pdfkit y subido a
-- Cloudinary) en vez de solo texto: se guarda su URL para poder
-- reabrirlo/reenviarlo después desde el historial sin regenerarlo.
ALTER TABLE "ventas" ADD COLUMN "ticket_pdf_url" TEXT;
ALTER TABLE "ventas" ADD COLUMN "ticket_pdf_public_id" TEXT;
