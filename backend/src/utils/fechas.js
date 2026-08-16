// Límites de "día" en la zona horaria del negocio (America/Mexico_City),
// en vez de UTC. Usado por el corte del día, el historial de ventas, el
// historial de movimientos de inventario y los reportes — para que "hoy" y
// "de tal fecha a tal fecha" coincidan con el reloj de pared de la tienda,
// no con el de Greenwich.
//
// Por qué importa: entre las 00:00 y las 06:00 UTC (que son las 18:00 a
// 00:00 en CDMX, justo el tramo típico de cierre de una tienda), el día
// calendario en UTC ya avanzó al día siguiente mientras en México sigue
// siendo el día anterior — con el cálculo viejo (UTC puro), una venta hecha
// a las 8pm de un martes podía aparecer en el corte del miércoles.
//
// No se usa ninguna librería externa: Node trae Intl con la base de datos
// de zonas horarias (IANA) desde hace varias versiones (full-icu por
// default), así que basta con Intl.DateTimeFormat. El offset se calcula de
// forma dinámica para la fecha exacta en cuestión (no un "-6" fijo en
// código) — hoy México no usa horario de verano, pero si algún día lo
// reintrodujera, este cálculo lo seguiría reflejando bien sin tocar código,
// igual que ya funciona correctamente para zonas que sí cambian de horario
// (verificado con America/New_York al escribir esto).

const ZONA_NEGOCIO = 'America/Mexico_City';

// Offset de `zona` respecto a UTC, en minutos, en el instante `fechaUtc`
// (negativo = detrás de UTC, como México). Redondeado al minuto entero:
// los offsets de zona real siempre son minutos exactos: redondear evita un
// ruido de punto flotante de milisegundos que introduciría el "ida y
// vuelta" por Intl.DateTimeFormat (que trunca a segundos enteros).
function offsetMinutos(fechaUtc, zona) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(fechaUtc)
    .reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const comoSiFueraUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second)
  );
  return Math.round((comoSiFueraUtc - fechaUtc.getTime()) / 60000);
}

// Convierte una fecha+hora "de pared" en la zona del negocio (ej.
// fechaStr="2026-08-16", horaStr="00:00:00.000") al instante UTC real que
// le corresponde.
function horaNegocioAUtc(fechaStr, horaStr) {
  const comoSiFueraUtc = new Date(`${fechaStr}T${horaStr}Z`);
  const offset = offsetMinutos(comoSiFueraUtc, ZONA_NEGOCIO);
  return new Date(comoSiFueraUtc.getTime() - offset * 60000);
}

// Instante UTC correspondiente a las 00:00:00.000 de esa fecha en la zona
// del negocio — usar como límite inferior (gte) de un rango de "ese día".
function inicioDiaNegocio(fechaStr) {
  return horaNegocioAUtc(fechaStr, '00:00:00.000');
}

// Instante UTC correspondiente a las 23:59:59.999 de esa fecha en la zona
// del negocio — usar como límite superior (lte) de un rango de "ese día".
function finDiaNegocio(fechaStr) {
  return horaNegocioAUtc(fechaStr, '23:59:59.999');
}

// "Hoy" tal cual lo marca el reloj de pared del negocio (YYYY-MM-DD), no el
// UTC del servidor (ver comentario de arriba sobre el tramo 18:00-00:00).
function hoyNegocioStr() {
  return fechaNegocioDeInstante(new Date());
}

// A qué fecha calendario (YYYY-MM-DD) corresponde un instante cualquiera
// (ej. Venta.createdAt) EN la zona del negocio — el inverso de
// inicioDiaNegocio/finDiaNegocio. Necesario para agrupar ventas "por día" de
// forma consistente con los límites de día usados para consultarlas: un
// mismo instante puede caer en un día calendario distinto en UTC que en
// México (ej. 2026-08-17T02:00:00Z son las 8pm del 2026-08-16 en CDMX).
function fechaNegocioDeInstante(fechaUtc) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_NEGOCIO }).format(fechaUtc);
}

module.exports = {
  ZONA_NEGOCIO,
  inicioDiaNegocio,
  finDiaNegocio,
  hoyNegocioStr,
  fechaNegocioDeInstante,
};
