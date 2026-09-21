// Arma el correo (asunto + texto plano + HTML) de las alertas de bajo stock.
// Es una función PURA — no toca la base ni manda nada — para poder probarla
// sola; quien lo manda es config/email.js#enviarResumenBajoStockEmail y quien
// decide cuándo y a quién es utils/resumenBajoStock.js.
//
// Hay dos variantes del mismo correo:
//   - 'urgente': productos que llegaron a 0 (agotados). Se manda a los pocos
//     minutos, agrupando en UN correo los que se agotaron juntos (p. ej. un
//     traspaso de varios productos).
//   - 'diario': resumen de los que siguen "bajos" (en o bajo su mínimo pero
//     todavía con piezas). Uno al día, a la hora configurada.
//
// El HTML usa tablas y estilos en línea a propósito: es lo único que
// respetan de forma pareja Gmail, Outlook y los clientes de celular. Siempre
// se manda también la versión en texto plano (mejora la entregabilidad y es
// lo que se ve si el cliente de correo bloquea el HTML).

const { ZONA_NEGOCIO } = require('./fechas');

// Misma paleta que utils/ticketEstilo.js (PALETA), para que el correo se vea
// de la misma marca que el ticket.
const C = {
  primario: '#1D4ED8',
  primarioOscuro: '#1E3A8A',
  acento: '#F97316',
  fondoSuave: '#EFF6FF',
  peligro: '#B91C1C',
  fondoPeligro: '#FEF2F2',
  aviso: '#C2410C',
  fondoAviso: '#FFF7ED',
  texto: '#0F172A',
  muted: '#64748B',
  borde: '#CBD5E1',
  bordeSuave: '#E2E8F0',
  fondoPagina: '#F1F5F9',
};

// Tope de renglones en la tabla: un correo con cientos de filas no lo lee
// nadie. Lo que sobre se resume en "y N más" con el enlace al inventario.
const MAX_FILAS = 40;

function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plural(n, singular, plural_) {
  return n === 1 ? singular : plural_;
}

const estaAgotado = (item) => item.stockActual <= 0;

// Sucursales ordenadas por nombre; dentro de cada una, primero los agotados,
// luego de menos a más piezas, luego por nombre.
function normalizar(sucursales) {
  return (sucursales || [])
    .filter((s) => s && Array.isArray(s.items) && s.items.length > 0)
    .map((s) => ({
      nombre: s.nombre,
      items: [...s.items].sort(
        (a, b) => a.stockActual - b.stockActual || String(a.producto).localeCompare(String(b.producto), 'es')
      ),
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// Recorta a MAX_FILAS renglones en total (contando todas las sucursales).
function recortar(sucursales) {
  let restantes = MAX_FILAS;
  let omitidos = 0;
  const visibles = [];
  for (const s of sucursales) {
    const items = s.items.slice(0, Math.max(restantes, 0));
    omitidos += s.items.length - items.length;
    restantes -= items.length;
    if (items.length > 0) visibles.push({ nombre: s.nombre, items });
  }
  return { visibles, omitidos };
}

function armarAsunto({ modo, total, sucursales, ahora }) {
  const donde = sucursales.length === 1 ? sucursales[0].nombre : `${sucursales.length} sucursales`;
  if (modo === 'urgente') {
    if (total === 1) return `Agotado: ${sucursales[0].items[0].producto} en ${donde}`;
    return `Agotados: ${total} productos en ${donde}`;
  }
  const fecha = ahora.toLocaleDateString('es-MX', { timeZone: ZONA_NEGOCIO, day: 'numeric', month: 'short' });
  return `Resumen de stock bajo (${fecha}): ${total} ${plural(total, 'producto', 'productos')} en ${donde}`;
}

function textoIntro({ modo, nombre }) {
  const saludo = `Hola${nombre ? ' ' + nombre : ''},`;
  if (modo === 'urgente') {
    return {
      saludo,
      cuerpo:
        'Estos productos se agotaron hace unos minutos. Los que sigan bajos pero con piezas ' +
        'llegarán en el resumen diario.',
    };
  }
  return {
    saludo,
    cuerpo:
      'Este es el resumen de productos que están en o por debajo de su mínimo. Solo aparecen los que ' +
      'siguen bajos al momento de enviarlo: si ya los reabasteciste, no salen.',
  };
}

function armarTexto({ modo, nombre, marca, visibles, omitidos, total, enlace }) {
  const { saludo, cuerpo } = textoIntro({ modo, nombre });
  const lineas = [saludo, '', cuerpo, ''];
  for (const s of visibles) {
    lineas.push(String(s.nombre).toUpperCase());
    for (const i of s.items) {
      lineas.push(
        `- ${i.producto} (SKU ${i.sku}): quedan ${i.stockActual}, mínimo ${i.stockMinimo}` +
          (estaAgotado(i) ? ' — AGOTADO' : '')
      );
    }
    lineas.push('');
  }
  if (omitidos > 0) {
    lineas.push(`… y ${omitidos} ${plural(omitidos, 'producto más', 'productos más')} (de ${total} en total). Míralos en el inventario.`, '');
  }
  if (enlace) lineas.push(`Abrir inventario: ${enlace}`, '');
  lineas.push(`${marca.nombre} — correo automático, no respondas a este mensaje.`);
  return lineas.join('\n');
}

function insigniaHtml(marca) {
  if (marca.logoUrl && /^https:\/\//i.test(marca.logoUrl)) {
    return (
      `<img src="${esc(marca.logoUrl)}" alt="${esc(marca.nombre)}" width="44" height="44" ` +
      `style="display:block;width:44px;height:44px;border-radius:8px;object-fit:contain;">`
    );
  }
  const iniciales = esc(String(marca.iniciales || 'CD').toUpperCase().slice(0, 3));
  return (
    `<div style="width:44px;height:44px;border-radius:22px;background:${C.acento};color:#FFFFFF;` +
    `font-weight:bold;font-size:16px;line-height:44px;text-align:center;">${iniciales}</div>`
  );
}

function etiquetaEstadoHtml(item) {
  const [fondo, color, texto] = estaAgotado(item)
    ? [C.fondoPeligro, C.peligro, 'Agotado']
    : [C.fondoAviso, C.aviso, 'Bajo'];
  return (
    `<span style="display:inline-block;background:${fondo};color:${color};border-radius:10px;` +
    `padding:3px 9px;font-size:11px;font-weight:bold;">${texto}</span>`
  );
}

function filaHtml(item) {
  return (
    `<tr>` +
    `<td style="padding:10px;border-top:1px solid ${C.bordeSuave};">` +
    `<div style="font-weight:bold;color:${C.texto};">${esc(item.producto)}</div>` +
    `<div style="font-size:11px;color:${C.muted};">SKU ${esc(item.sku)}</div></td>` +
    `<td align="center" style="border-top:1px solid ${C.bordeSuave};font-weight:bold;color:${C.texto};">${esc(item.stockActual)}</td>` +
    `<td align="center" style="border-top:1px solid ${C.bordeSuave};color:${C.muted};">${esc(item.stockMinimo)}</td>` +
    `<td align="right" style="padding:10px;border-top:1px solid ${C.bordeSuave};">${etiquetaEstadoHtml(item)}</td>` +
    `</tr>`
  );
}

function cajaResumenHtml(numero, etiqueta, fondo, color, estilosTd) {
  return (
    `<td width="33%" style="${estilosTd}">` +
    `<div style="background:${fondo};border-radius:8px;padding:12px;text-align:center;">` +
    `<div style="font-size:26px;font-weight:bold;color:${color};">${numero}</div>` +
    `<div style="font-size:12px;color:${color};">${etiqueta}</div></div></td>`
  );
}

function armarHtml({ modo, nombre, marca, visibles, omitidos, total, agotados, bajos, sucursalesTotal, enlace }) {
  const { saludo, cuerpo } = textoIntro({ modo, nombre });
  const titular =
    modo === 'urgente'
      ? `${total} ${plural(total, 'producto agotado', 'productos agotados')}`
      : `${total} ${plural(total, 'producto con stock bajo', 'productos con stock bajo')}`;
  const subtitulo = modo === 'urgente' ? 'Aviso de producto agotado' : 'Resumen diario de inventario';
  const preheader =
    `${total} ${plural(total, 'producto', 'productos')} — ` +
    `${agotados} ${plural(agotados, 'agotado', 'agotados')}, ${bajos} con stock bajo.`;

  const bloquesSucursal = visibles
    .map(
      (s) =>
        `<tr><td style="padding:20px 28px 0 28px;">` +
        `<div style="font-size:13px;font-weight:bold;color:${C.primarioOscuro};text-transform:uppercase;letter-spacing:0.04em;">${esc(s.nombre)}</div></td></tr>` +
        `<tr><td style="padding:8px 28px 0 28px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.borde};border-radius:8px;border-collapse:separate;overflow:hidden;font-size:13px;">` +
        `<tr style="background:${C.fondoSuave};color:${C.primarioOscuro};">` +
        `<td style="padding:8px 10px;font-weight:bold;">Producto</td>` +
        `<td style="padding:8px 6px;font-weight:bold;" align="center">Quedan</td>` +
        `<td style="padding:8px 6px;font-weight:bold;" align="center">Mín.</td>` +
        `<td style="padding:8px 10px;font-weight:bold;" align="right">Estado</td></tr>` +
        s.items.map(filaHtml).join('') +
        `</table></td></tr>`
    )
    .join('');

  const avisoOmitidos =
    omitidos > 0
      ? `<tr><td style="padding:12px 28px 0 28px;font-size:13px;color:${C.muted};">` +
        `… y ${omitidos} ${plural(omitidos, 'producto más', 'productos más')} (${total} en total). Míralos completos en el inventario.</td></tr>`
      : '';

  const boton = enlace
    ? `<tr><td align="center" style="padding:24px 28px 8px 28px;">` +
      `<a href="${esc(enlace)}" style="display:inline-block;background:${C.primario};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 26px;border-radius:8px;">Abrir inventario</a></td></tr>`
    : '';

  return (
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titular)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.fondoPagina};font-family:Arial,Helvetica,sans-serif;color:${C.texto};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondoPagina};padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid ${C.borde};">` +
    `<tr><td style="background:${C.primario};height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>` +
    // Encabezado de marca
    `<tr><td style="padding:24px 28px 8px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="48" valign="middle">${insigniaHtml(marca)}</td>` +
    `<td valign="middle" style="padding-left:12px;">` +
    `<div style="font-size:16px;font-weight:bold;color:${C.primarioOscuro};">${esc(marca.nombre)}</div>` +
    `<div style="font-size:12px;color:${C.muted};">${esc(subtitulo)}</div></td></tr></table></td></tr>` +
    // Titular + intro
    `<tr><td style="padding:16px 28px 0 28px;">` +
    `<div style="font-size:22px;font-weight:bold;color:${C.texto};">${esc(titular)}</div>` +
    `<div style="font-size:14px;color:${C.texto};margin-top:10px;">${esc(saludo)}</div>` +
    `<div style="font-size:14px;color:${C.muted};margin-top:4px;line-height:1.5;">${esc(cuerpo)}</div></td></tr>` +
    // Contadores
    `<tr><td style="padding:20px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    cajaResumenHtml(agotados, plural(agotados, 'Agotado', 'Agotados'), C.fondoPeligro, C.peligro, 'padding-right:6px;') +
    cajaResumenHtml(bajos, 'Stock bajo', C.fondoAviso, C.aviso, 'padding:0 3px;') +
    cajaResumenHtml(sucursalesTotal, plural(sucursalesTotal, 'Sucursal', 'Sucursales'), C.fondoSuave, C.primarioOscuro, 'padding-left:6px;') +
    `</tr></table></td></tr>` +
    bloquesSucursal +
    avisoOmitidos +
    boton +
    // Pie
    `<tr><td style="padding:20px 28px 24px 28px;font-size:11px;color:${C.muted};text-align:center;line-height:1.5;">` +
    `Recibes este correo porque eres administrador o personal de inventario/ventas de las sucursales listadas.<br>` +
    `${esc(marca.nombre)} · Correo automático, no respondas a este mensaje.</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/**
 * @param {object} datos
 * @param {'urgente'|'diario'} datos.modo
 * @param {string} [datos.nombre] - Nombre de quien lo recibe.
 * @param {{nombre: string, iniciales?: string, logoUrl?: string|null}} datos.marca
 * @param {{nombre: string, items: {producto: string, sku: string, stockActual: number, stockMinimo: number}[]}[]} datos.sucursales
 * @param {string|null} [datos.enlace] - URL absoluta del inventario en el sistema (botón).
 * @param {Date} [datos.ahora]
 * @returns {{asunto: string, texto: string, html: string}}
 */
function armarCorreoResumenBajoStock({ modo, nombre, marca, sucursales, enlace = null, ahora = new Date() }) {
  const ordenadas = normalizar(sucursales);
  const todos = ordenadas.flatMap((s) => s.items);
  const total = todos.length;
  const agotados = todos.filter(estaAgotado).length;
  const { visibles, omitidos } = recortar(ordenadas);

  const datos = {
    modo,
    nombre,
    marca,
    visibles,
    omitidos,
    total,
    agotados,
    bajos: total - agotados,
    sucursalesTotal: ordenadas.length,
    enlace,
  };

  return {
    asunto: armarAsunto({ modo, total, sucursales: ordenadas, ahora }),
    texto: armarTexto(datos),
    html: armarHtml(datos),
  };
}

module.exports = { armarCorreoResumenBajoStock, MAX_FILAS };
