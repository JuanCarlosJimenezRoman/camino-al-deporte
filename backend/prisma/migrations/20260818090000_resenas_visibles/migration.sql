-- Permite ocultar una reseña puntual de los testimonios públicos de la
-- tienda en línea sin borrarla (el negocio la sigue viendo en el dashboard).

ALTER TABLE "pedido_resenas" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;
