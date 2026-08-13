// Integración con WhatsApp Business Platform (Cloud API de Meta) para mandar
// el ticket digital de una venta automáticamente, sin que el cajero tenga
// que abrir WhatsApp y darle clic a enviar.
//
// Requiere que el negocio conecte su número a Meta Business Manager (se
// puede hacer sin perder la app normal de WhatsApp Business, con la
// función de "coexistencia") y tenga aprobada una plantilla de categoría
// "utility" para el ticket — Meta obliga a usar una plantilla porque el
// negocio manda el mensaje primero, el cliente nunca le escribió antes.
//
// Mientras WHATSAPP_ACCESS_TOKEN no esté configurado (o la sucursal/tienda
// no tenga un Phone Number ID capturado), enviarTicketVenta no manda nada y
// regresa { enviado: false, error: 'WHATSAPP_NO_CONFIGURADO' } — el sistema
// sigue funcionando con el link manual de wa.me que ya existía (ver
// construirLinkTicket en el frontend y whatsappContacto en routes/ventas.js).
// Un fallo al mandar tampoco debe tumbar el registro de la venta: por eso
// esta función nunca lanza, siempre regresa un resultado.

const GRAPH_VERSION = 'v21.0';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TICKET_TEMPLATE_NAME || 'ticket_digital_compra';
const TEMPLATE_LANG = process.env.WHATSAPP_TICKET_TEMPLATE_LANG || 'es_MX';

function whatsappApiConfigurada() {
  return Boolean(ACCESS_TOKEN);
}

// Normaliza a formato E.164 sin "+": si son 10 dígitos asumimos México (52),
// igual que ya se hace para armar el link manual de wa.me en el frontend.
function normalizarTelefono(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.length === 10) return '52' + digitos;
  return digitos;
}

/**
 * Manda el ticket digital de una venta ya registrada, usando la plantilla
 * aprobada por Meta. El orden de los parámetros de texto tiene que
 * coincidir exactamente con el orden de las variables {{1}}..{{5}} con las
 * que se dio de alta la plantilla (folio, sucursal, artículos, total,
 * método de pago) — ver la guía de configuración para el texto exacto.
 *
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarTicketVenta({ phoneNumberId, telefonoCliente, folio, sucursal, articulos, total, metodoPago }) {
  if (!whatsappApiConfigurada()) {
    return { enviado: false, error: 'WHATSAPP_NO_CONFIGURADO' };
  }
  if (!phoneNumberId) {
    return { enviado: false, error: 'SUCURSAL_SIN_WHATSAPP_API' };
  }
  const numero = normalizarTelefono(telefonoCliente);
  if (!numero) {
    return { enviado: false, error: 'TELEFONO_INVALIDO' };
  }

  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(folio ?? '—') },
                { type: 'text', text: String(sucursal ?? '—') },
                { type: 'text', text: String(articulos ?? '—') },
                { type: 'text', text: String(total ?? '0') },
                { type: 'text', text: String(metodoPago ?? '—') },
              ],
            },
          ],
        },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { enviado: false, error: data?.error?.message || `Error HTTP ${resp.status}` };
    }
    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err.message };
  }
}

module.exports = { whatsappApiConfigurada, normalizarTelefono, enviarTicketVenta };
