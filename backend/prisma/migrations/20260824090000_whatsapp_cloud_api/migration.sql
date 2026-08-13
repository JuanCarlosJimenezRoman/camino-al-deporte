-- Envío automático del ticket digital vía WhatsApp Business Platform (Cloud
-- API de Meta), como alternativa al link manual de wa.me que ya existía.
-- Guarda el "Phone Number ID" que da Meta al conectar un número (no es el
-- número de teléfono visible) — por sucursal, con respaldo en la
-- configuración general de la tienda, igual que ya funciona con
-- Sucursal.telefono / ConfiguracionTienda.whatsappTienda. Mientras esta
-- columna esté vacía, el sistema sigue mandando el ticket con el botón
-- manual.
ALTER TABLE "sucursales" ADD COLUMN "whatsapp_phone_number_id" TEXT;
ALTER TABLE "configuracion_tienda" ADD COLUMN "whatsapp_phone_number_id" TEXT;
