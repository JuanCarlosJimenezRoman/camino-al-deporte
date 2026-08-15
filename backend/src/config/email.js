// Envío de correos transaccionales por SMTP (Gmail) — usado para mandar el
// código de "olvidé mi contraseña" a los clientes de la tienda en línea.
// Es el canal principal de este flujo (ver routes/tienda/auth.js): a
// diferencia de WhatsApp, no depende de que Meta apruebe una plantilla ni
// de que el negocio cumpla los requisitos de verificación/volumen de la
// categoría Authentication, así que funciona desde el primer día.
//
// Mientras EMAIL_USER/EMAIL_APP_PASSWORD no estén configurados,
// enviarCodigoRecuperacionEmail no manda nada y regresa
// { enviado: false, error: 'EMAIL_NO_CONFIGURADO' } sin lanzar — mismo
// contrato que config/whatsapp.js, para que un canal sin configurar nunca
// tumbe la petición.

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const EMAIL_FROM_NOMBRE = process.env.EMAIL_FROM_NOMBRE || 'Camino al Deporte';

let transporter = null;

function emailApiConfigurada() {
  return Boolean(EMAIL_USER && EMAIL_APP_PASSWORD);
}

// El transporter se crea una sola vez (perezoso, en el primer envío) y se
// reutiliza — crear uno por correo sería más lento y no aporta nada.
function obtenerTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Manda el código de un solo uso para restablecer la contraseña, por
 * correo. Mismo código que se manda por WhatsApp cuando ese canal está
 * configurado (ver config/whatsapp.js) — el cliente puede usar el que le
 * llegue primero.
 *
 * @param {object} datos
 * @param {string} datos.email
 * @param {string} datos.nombre
 * @param {string} datos.codigo - Código de 6 dígitos.
 * @param {number} datos.vigenciaMin - Minutos de vigencia, para mostrarlo en el correo.
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarCodigoRecuperacionEmail({ email, nombre, codigo, vigenciaMin }) {
  if (!emailApiConfigurada()) {
    return { enviado: false, error: 'EMAIL_NO_CONFIGURADO' };
  }
  if (!email || !codigo) {
    return { enviado: false, error: 'DATOS_INCOMPLETOS' };
  }

  try {
    await obtenerTransporter().sendMail({
      from: `"${EMAIL_FROM_NOMBRE}" <${EMAIL_USER}>`,
      to: email,
      subject: 'Tu código para restablecer tu contraseña',
      text:
        `Hola${nombre ? ' ' + nombre : ''},\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña en Camino al Deporte.\n\n` +
        `Tu código es: ${codigo}\n\n` +
        `Este código es válido por ${vigenciaMin} minutos. Si tú no pediste esto, puedes ignorar este correo.`,
      html:
        `<p>Hola${nombre ? ' ' + nombre : ''},</p>` +
        `<p>Recibimos una solicitud para restablecer tu contraseña en Camino al Deporte.</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:0.2em;margin:24px 0;">${codigo}</p>` +
        `<p>Este código es válido por ${vigenciaMin} minutos. Si tú no pediste esto, puedes ignorar este correo.</p>`,
    });
    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err.message };
  }
}

module.exports = { emailApiConfigurada, enviarCodigoRecuperacionEmail };
