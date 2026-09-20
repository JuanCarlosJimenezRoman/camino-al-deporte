// Envío de correos transaccionales por SMTP (Gmail). Dos usos:
//  1. Código de "olvidé mi contraseña" a los clientes de la tienda en línea
//     (ver routes/tienda/auth.js) — el canal principal de ese flujo: a
//     diferencia de WhatsApp, no depende de que Meta apruebe una plantilla
//     ni de que el negocio cumpla los requisitos de verificación/volumen de
//     la categoría Authentication, así que funciona desde el primer día.
//  2. Alertas de bajo stock al personal interno, en RESUMEN (un correo con
//     varios productos, no uno por producto — ver utils/resumenBajoStock.js
//     y la plantilla en utils/correoResumenBajoStock.js).
//
// Mientras EMAIL_USER/EMAIL_APP_PASSWORD no estén configurados, ninguna de
// las dos manda nada y regresan { enviado: false, error:
// 'EMAIL_NO_CONFIGURADO' } sin lanzar — mismo contrato que config/
// whatsapp.js, para que un canal sin configurar nunca tumbe la petición.

const nodemailer = require('nodemailer');
const prisma = require('../db');
const { armarCorreoResumenBajoStock } = require('../utils/correoResumenBajoStock');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const EMAIL_FROM_NOMBRE = process.env.EMAIL_FROM_NOMBRE || 'Camino al Deporte';

let transporter = null;

function emailApiConfigurada() {
  return Boolean(EMAIL_USER && EMAIL_APP_PASSWORD);
}

// Marca del negocio para el CUERPO del correo (distinta de
// EMAIL_FROM_NOMBRE, que es el nombre del remitente y se fija por variable
// de entorno): se lee de ConfiguracionTienda, igual que
// utils/ticketEstilo.js#obtenerMarca, para que el texto no quede fijo en
// "Camino al Deporte" cuando este código corre para otro negocio.
async function obtenerMarcaCorreo() {
  try {
    const config = await prisma.configuracionTienda.findFirst();
    return {
      nombre: config?.nombreNegocio || 'Camino al Deporte',
      iniciales: config?.iniciales || 'CD',
      logoUrl: config?.logoTicketUrl || null,
    };
  } catch (err) {
    return { nombre: 'Camino al Deporte', iniciales: 'CD', logoUrl: null };
  }
}

async function obtenerNombreNegocio() {
  return (await obtenerMarcaCorreo()).nombre;
}

// URL absoluta del inventario en el frontend, para el botón del correo.
// FRONTEND_URL también alimenta el CORS y puede valer '*' o no estar: solo
// se arma el enlace si es una URL http(s) de verdad.
function enlaceInventario() {
  const base = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(base) ? `${base}/dashboard/inventario` : null;
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
    const nombreNegocio = await obtenerNombreNegocio();
    await obtenerTransporter().sendMail({
      from: `"${EMAIL_FROM_NOMBRE}" <${EMAIL_USER}>`,
      to: email,
      subject: 'Tu código para restablecer tu contraseña',
      text:
        `Hola${nombre ? ' ' + nombre : ''},\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña en ${nombreNegocio}.\n\n` +
        `Tu código es: ${codigo}\n\n` +
        `Este código es válido por ${vigenciaMin} minutos. Si tú no pediste esto, puedes ignorar este correo.`,
      html:
        `<p>Hola${nombre ? ' ' + nombre : ''},</p>` +
        `<p>Recibimos una solicitud para restablecer tu contraseña en ${nombreNegocio}.</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:0.2em;margin:24px 0;">${codigo}</p>` +
        `<p>Este código es válido por ${vigenciaMin} minutos. Si tú no pediste esto, puedes ignorar este correo.</p>`,
    });
    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err.message };
  }
}

/**
 * Correo de bajo stock a un empleado/admin, con VARIOS productos en un solo
 * mensaje — ver utils/resumenBajoStock.js, que decide a quién le toca, cuándo
 * y qué productos incluye (así un traspaso de 9 productos o un día de muchas
 * ventas no llena la bandeja ni se marca como spam).
 *
 * @param {object} datos
 * @param {string} datos.email
 * @param {string} [datos.nombre]
 * @param {'urgente'|'diario'} datos.modo - 'urgente' = agotados; 'diario' = resumen del día.
 * @param {{nombre: string, items: {producto: string, sku: string, stockActual: number, stockMinimo: number}[]}[]} datos.sucursales
 * @returns {Promise<{enviado: boolean, error?: string}>} nunca lanza.
 */
async function enviarResumenBajoStockEmail({ email, nombre, modo, sucursales }) {
  if (!emailApiConfigurada()) {
    return { enviado: false, error: 'EMAIL_NO_CONFIGURADO' };
  }
  const hayProductos = Array.isArray(sucursales) && sucursales.some((s) => s?.items?.length > 0);
  if (!email || !hayProductos) {
    return { enviado: false, error: 'DATOS_INCOMPLETOS' };
  }

  try {
    const marca = await obtenerMarcaCorreo();
    const { asunto, texto, html } = armarCorreoResumenBajoStock({
      modo,
      nombre,
      marca,
      sucursales,
      enlace: enlaceInventario(),
    });
    await obtenerTransporter().sendMail({
      from: `"${EMAIL_FROM_NOMBRE}" <${EMAIL_USER}>`,
      to: email,
      subject: asunto,
      text: texto,
      html,
      // Marca el correo como automático: evita respuestas automáticas
      // (fuera de oficina) hacia esta cuenta y ayuda a los filtros a
      // clasificarlo bien.
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    });
    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err.message };
  }
}

module.exports = { emailApiConfigurada, enviarCodigoRecuperacionEmail, enviarResumenBajoStockEmail };
