-- Envío automático del ticket digital vía WhatsApp Business Platform (Cloud
-- API de Meta), como alternativa al link manual de wa.me que ya existía.
-- Guarda el "Phone Number ID" que da Meta al conectar un número (no es el
-- número de teléfono visible) — por sucursal, con respaldo en la
-- configuración general de la tienda, igual que ya funciona con
-- Sucursal.telefono / ConfiguracionTienda.whatsappTienda. Mientras esta
-- columna esté vacía, el sistema sigue mandando el ticket con el botón
-- manual.
-- IF NOT EXISTS: la migración 20260817090000_descuento_y_columnas_pendientes
-- ya agrega esta misma columna en ambas tablas (ver su comentario); sin
-- esto, un reset desde cero (`prisma migrate reset`) truena con "column
-- already exists" al llegar aquí.
ALTER TABLE "sucursales" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" TEXT;
ALTER TABLE "configuracion_tienda" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" TEXT;
