-- Logo opcional para el ticket/comprobante digital (PDF). Si las dos columnas
-- quedan NULL, el PDF dibuja la insignia con las iniciales del negocio
-- (respaldo actual). Se sube desde el panel (Métodos de pago → Logo del
-- ticket) y se guarda en Cloudinary (carpeta camino-al-deporte/logo).
ALTER TABLE "configuracion_tienda" ADD COLUMN "logo_ticket_url" TEXT;
ALTER TABLE "configuracion_tienda" ADD COLUMN "logo_ticket_public_id" TEXT;
