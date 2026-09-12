-- Identidad de la marca del negocio (white-label): nombre e iniciales que se
-- usan en tickets/comprobantes y en el panel. Los valores por defecto son los
-- de "Camino al Deporte" para no romper nada en la fila única existente.
ALTER TABLE "configuracion_tienda" ADD COLUMN "nombre_negocio" TEXT NOT NULL DEFAULT 'Camino al Deporte';
ALTER TABLE "configuracion_tienda" ADD COLUMN "iniciales" TEXT NOT NULL DEFAULT 'CD';
