-- Configuracion del ticket de venta (ver ConfiguracionTienda en
-- schema.prisma y routes/configuracionTienda.js):
--
-- 1) Mensaje de pie de pagina personalizado, que se imprime debajo del
--    aviso legal fijo ("no es un CFDI...") — util para politica de
--    cambios, horario, redes sociales, etc.
-- 2) Interruptores para mostrar u ocultar, en el ticket impreso, el
--    codigo de barras del folio, el nombre de quien vendio y la sucursal
--    (ver utils/ticketPdf.js).
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "mensaje_ticket_pie" TEXT;
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "mostrar_codigo_barras_ticket" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "mostrar_vendedor_ticket" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "mostrar_sucursal_ticket" BOOLEAN NOT NULL DEFAULT true;
