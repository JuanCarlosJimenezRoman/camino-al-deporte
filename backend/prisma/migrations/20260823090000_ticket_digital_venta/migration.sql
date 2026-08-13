-- Ticket digital para ventas de tienda física: número de teléfono del
-- cliente capturado en el punto de venta, usado para mandarle el ticket por
-- WhatsApp (link click-to-chat, mismo mecanismo que ya se usa en pedidos en
-- línea — no hay envío automático por servidor). Opcional: sigue siendo
-- válido registrar una venta de mostrador sin captar el teléfono.
ALTER TABLE "ventas" ADD COLUMN "cliente_telefono" TEXT;
