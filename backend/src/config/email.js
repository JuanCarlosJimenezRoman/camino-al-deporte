// Envío de correos transaccionales por SMTP (Gmail). Dos usos:
//  1. Código de "olvidé mi contraseña" a los clientes de la tienda en línea
//     (ver routes/tienda/auth.js) — el canal principal de ese flujo: a
//     diferencia de WhatsApp, no depende de que Meta apruebe una plantilla
//     ni de que el negocio cumpla los requisitos de verificación/volumen de
//     la categoría Authentication, así que funciona desde el primer día.
//  2. Alertas de bajo stock al personal interno (ver utils/bajoStock.js).
//
// Mientras EMAIL_USER/EMAIL_APP_PASSWORD no estén configurados, ninguna de
// las dos manda nada y regresan { enviado: false, error:
// 'EMAIL_NO_CONFIGURADO' } sin lanzar — mismo contrato que config/
// whatsapp.js, para que un canal sin configurar nunca tumbe la petición.

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

/**
 * Alerta de bajo stock a un empleado/admin — ver utils/bajoStock.js, que
 * decide a quién le toca y con qué cooldown para no saturar.
 *
 * @param {object} datos
 * @param {string} datos.email
 * @param {string} datos.nombre
 * @param {string} datos.producto - Nombre + talla/color, ya armado.
 * @param {string} datos.sku
 * @param {string} datos.sucursal
 * @param {number} datos.stockActual
 * @param {number} datos.stockMinimo
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarAlertaBajoStockEmail({ email, nombre, producto, sku, sucursal, stockActual, stockMinimo }) {
  if (!emailApiConfigurada()) {
    return { enviado: false, error: 'EMAIL_NO_CONFIGURADO' };
  }
  if (!email || !producto) {
    return { enviado: false, error: 'DATOS_INCOMPLETOS' };
  }

  try {
    await obtenerTransporter().sendMail({
      from: `"${EMAIL_FROM_NOMBRE}" <${EMAIL_USER}>`,
      to: email,
      subject: `Stock bajo: ${producto}`,
      text:
        `Hola${nombre ? ' ' + nombre : ''},\n\n` +
        `El producto "${producto}" (SKU ${sku}) está bajo de stock en ${sucursal}: ` +
        `quedan ${stockActual} pieza(s), en o por debajo del mínimo configurado (${stockMinimo}).\n\n` +
        `Entra al sistema (Inventario) para revisar y, si hace falta, pedir más a tu proveedor.`,
      html:
        `<p>Hola${nombre ? ' ' + nombre : ''},</p>` +
        `<p>El producto <strong>${producto}</strong> (SKU ${sku}) está bajo de stock en <strong>${sucursal}</strong>:</p>` +
        `<p style="font-size:20px;font-weight:bold;margin:16px 0;">Quedan ${stockActual} — mínimo ${stockMinimo}</p>` +
        `<p>Entra al sistema (Inventario) para revisar y, si hace falta, pedir más a tu proveedor.</p>`,
    });
    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err.message };
  }
}

module.exports = { emailApiConfigurada, enviarCodigoRecuperacionEmail, enviarAlertaBajoStockEmail };
