const XLSX = require('xlsx');
const prisma = require('../db');

// Prefijo para las columnas de atributos extra en la plantilla/exportación/
// importación de productos: una columna por cada CampoPersonalizado activo
// de la entidad indicada (hoy solo se usa "producto"). Este archivo es el
// único lugar donde vive esta lógica — utils/excel.js (exportación y
// plantilla) y utils/importarProductos.js (importación) lo comparten, para
// que los dos lados del Excel hablen exactamente el mismo formato de
// columna. Si el prefijo cambia algún día, cambia en un solo lugar y
// export/import siguen sincronizados.
const PREFIJO_ATRIBUTO = 'atributo_';

function columnaAtributo(clave) {
  return `${PREFIJO_ATRIBUTO}${clave}`;
}

function esColumnaAtributo(nombreColumna) {
  return typeof nombreColumna === 'string' && nombreColumna.startsWith(PREFIJO_ATRIBUTO);
}

function claveDeColumnaAtributo(nombreColumna) {
  return nombreColumna.slice(PREFIJO_ATRIBUTO.length);
}

// Campos activos de una entidad, en el mismo orden en que se agregan como
// columnas tanto en la plantilla/exportación como al leerlos de vuelta al
// importar (el orden de las columnas en sí no importa para importar, ya que
// se leen por nombre de encabezado, pero sí para que la plantilla y el
// mensaje de instrucciones sean consistentes entre sí).
async function obtenerCamposExtraActivos(entidad = 'producto') {
  return prisma.campoPersonalizado.findMany({
    where: { entidad, activo: true },
    orderBy: { etiqueta: 'asc' },
  });
}

function descripcionTipo(campo) {
  switch (campo.tipo) {
    case 'NUMERO':
      return 'número';
    case 'BOOLEANO':
      return 'Sí / No';
    case 'FECHA':
      return 'fecha, formato AAAA-MM-DD';
    case 'SELECT':
      return `una de estas opciones: ${(campo.opciones || []).join(', ')}`;
    default:
      return 'texto libre';
  }
}

// Convierte el valor ya guardado en producto.atributosExtra[clave] (JS) al
// texto que se muestra en la celda del Excel exportado.
function formatearValorAtributo(valor, campo) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (campo.tipo === 'BOOLEANO') return valor ? 'Sí' : 'No';
  return String(valor);
}

// Convierte el valor crudo de una celda del Excel (texto, número o Date,
// según cómo haya llenado esa columna quien hizo el archivo) al valor que
// se guarda en producto.atributosExtra[clave], validando contra el tipo del
// campo. Nunca lanza: devuelve { ok: true, valor } (valor === undefined si
// la celda venía vacía, es decir "no se guarda nada para este campo") o
// { ok: false, error } con un mensaje listo para mostrarle al usuario — ver
// normalizarFilas en importarProductos.js, que junta estos errores con los
// demás de la fila.
function normalizarValorAtributo(valorCrudo, campo) {
  if (valorCrudo === null || valorCrudo === undefined) return { ok: true, valor: undefined };
  const texto = String(valorCrudo).trim();
  if (!texto) return { ok: true, valor: undefined };

  switch (campo.tipo) {
    case 'NUMERO': {
      const n = Number(texto.replace(',', '.'));
      if (!Number.isFinite(n)) {
        return { ok: false, error: `"${campo.etiqueta}" debe ser un número (se recibió "${texto}").` };
      }
      return { ok: true, valor: n };
    }
    case 'BOOLEANO': {
      const t = texto.toLowerCase();
      if (['si', 'sí', 'true', '1', 'x'].includes(t)) return { ok: true, valor: true };
      if (['no', 'false', '0'].includes(t)) return { ok: true, valor: false };
      return { ok: false, error: `"${campo.etiqueta}" debe ser Sí o No (se recibió "${texto}").` };
    }
    case 'FECHA': {
      // Si la celda tenía formato de fecha en Excel, sheet_to_json entrega
      // un número de serie (no un Date ni un string) salvo que se lea con
      // la opción cellDates, que este importador no usa. Si la celda era
      // texto libre, llega tal cual.
      let fecha;
      if (typeof valorCrudo === 'number') {
        const parsed = XLSX.SSF.parse_date_code(valorCrudo);
        if (parsed) fecha = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      } else {
        fecha = new Date(texto);
      }
      if (!fecha || Number.isNaN(fecha.getTime())) {
        return { ok: false, error: `"${campo.etiqueta}" debe ser una fecha válida (se recibió "${texto}").` };
      }
      return { ok: true, valor: fecha.toISOString().slice(0, 10) };
    }
    case 'SELECT': {
      const opciones = campo.opciones || [];
      const encontrada = opciones.find((o) => String(o).toLowerCase() === texto.toLowerCase());
      if (!encontrada) {
        return {
          ok: false,
          error: `"${campo.etiqueta}" debe ser una de: ${opciones.join(', ')} (se recibió "${texto}").`,
        };
      }
      return { ok: true, valor: encontrada };
    }
    default: // TEXTO
      return { ok: true, valor: texto };
  }
}

module.exports = {
  PREFIJO_ATRIBUTO,
  columnaAtributo,
  esColumnaAtributo,
  claveDeColumnaAtributo,
  obtenerCamposExtraActivos,
  descripcionTipo,
  formatearValorAtributo,
  normalizarValorAtributo,
};
