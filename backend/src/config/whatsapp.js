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
// Plantilla con header tipo "documento" (el PDF del ticket) + un solo
// parámetro de texto en el cuerpo (el folio) — el detalle de artículos,
// total y método de pago ya no van como texto del mensaje, van dentro del
// PDF (ver utils/ticketPdf.js). Nombre distinto al de la primera versión
// (solo texto) porque Meta no deja cambiar la estructura de una plantilla
// ya aprobada con el mismo nombre — ver la guía de configuración.
const TEMPLATE_NAME = process.env.WHATSAPP_TICKET_TEMPLATE_NAME || 'ticket_digital_compra_pdf';
const TEMPLATE_LANG = process.env.WHATSAPP_TICKET_TEMPLATE_LANG || 'es_MX';

// Plantilla aparte para "olvidé mi contraseña": header de texto + un solo
// parámetro en el cuerpo (el link de restablecimiento). Nombre y plantilla
// distintos a la del ticket porque el contenido y el propósito no tienen
// nada que ver — cada plantilla se aprueba por separado en Meta Business
// Manager.
const RESET_TEMPLATE_NAME = process.env.WHATSAPP_RESET_TEMPLATE_NAME || 'recuperar_password_cliente';
const RESET_TEMPLATE_LANG = process.env.WHATSAPP_RESET_TEMPLATE_LANG || 'es_MX';

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
 * Manda el ticket digital (PDF) de una venta ya registrada, usando la
 * plantilla aprobada por Meta: header tipo documento (el PDF, por link
 * público) + el folio como único parámetro del cuerpo.
 *
 * @param {object} datos
 * @param {string} datos.phoneNumberId
 * @param {string} datos.telefonoCliente
 * @param {string} datos.folio
 * @param {string} datos.pdfUrl - URL pública del PDF (ver config/cloudinary.js subirPdf).
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarTicketVenta({ phoneNumberId, telefonoCliente, folio, pdfUrl }) {
  if (!whatsappApiConfigurada()) {
    return { enviado: false, error: 'WHATSAPP_NO_CONFIGURADO' };
  }
  if (!phoneNumberId) {
    return { enviado: false, error: 'SUCURSAL_SIN_WHATSAPP_API' };
  }
  if (!pdfUrl) {
    return { enviado: false, error: 'SIN_PDF' };
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
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: { link: pdfUrl, filename: `ticket-${folio}.pdf` },
                },
              ],
            },
            {
              type: 'body',
              parameters: [{ type: 'text', text: String(folio ?? '—') }],
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

/**
 * Manda el link para restablecer la contraseña de un cliente de la tienda
 * en línea, usando la plantilla aprobada por Meta: un solo parámetro de
 * texto en el cuerpo (el link, con el token de un solo uso).
 *
 * @param {object} datos
 * @param {string} datos.phoneNumberId
 * @param {string} datos.telefonoCliente
 * @param {string} datos.enlace - URL pública de /tienda/restablecer?token=...
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarCodigoRecuperacion({ phoneNumberId, telefonoCliente, enlace }) {
  if (!whatsappApiConfigurada()) {
    return { enviado: false, error: 'WHATSAPP_NO_CONFIGURADO' };
  }
  if (!phoneNumberId) {
    return { enviado: false, error: 'TIENDA_SIN_WHATSAPP_API' };
  }
  if (!enlace) {
    return { enviado: false, error: 'SIN_ENLACE' };
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
          name: RESET_TEMPLATE_NAME,
          language: { code: RESET_TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: enlace }],
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

module.exports = { whatsappApiConfigurada, normalizarTelefono, enviarTicketVenta, enviarCodigoRecuperacion };
