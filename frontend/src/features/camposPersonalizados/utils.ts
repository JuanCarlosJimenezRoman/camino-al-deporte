import {
  CampoPersonalizado,
  EdicionCampoPayload,
  NuevoCampoFormState,
  NuevoCampoPayload,
  TIPOS,
  TipoCampo,
} from './types';

/**
 * De "clave" libre a algo parecido a snake_case sin caracteres raros —
 * evita que "Talla de calcetín" se guarde tal cual como clave y luego
 * choque con espacios/acentos al usarse como llave dentro de un JSON.
 */
export function sugerirClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function etiquetaTipo(tipo: TipoCampo): string {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

/**
 * Agrupa los campos por entidad y devuelve los grupos ordenados
 * alfabéticamente por nombre de entidad. Reemplaza el `useMemo` inline
 * que vivía en page.tsx.
 */
export function agruparPorEntidad(
  campos: CampoPersonalizado[]
): Array<[string, CampoPersonalizado[]]> {
  const porEntidad = new Map<string, CampoPersonalizado[]>();
  for (const c of campos) {
    if (!porEntidad.has(c.entidad)) porEntidad.set(c.entidad, []);
    porEntidad.get(c.entidad)!.push(c);
  }
  return Array.from(porEntidad.entries()).sort(([a], [b]) => a.localeCompare(b));
}

/** Convierte "Hombre, Mujer, Unisex" en ['Hombre', 'Mujer', 'Unisex']. */
export function parsearOpciones(texto: string): string[] {
  return texto
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Valida el formulario de alta. Devuelve null si está OK, o el mensaje
 * de error a mostrar. Pura: no toca React ni el DOM.
 */
export function validarNuevoCampo(
  form: Pick<NuevoCampoFormState, 'entidad' | 'etiqueta' | 'clave' | 'tipo' | 'opcionesTexto'>
): string | null {
  const claveFinal = form.clave.trim() || sugerirClave(form.etiqueta);
  if (!form.entidad.trim() || !form.etiqueta.trim() || !claveFinal) {
    return 'Completa entidad, etiqueta y clave antes de guardar.';
  }
  if (form.tipo === 'SELECT' && !form.opcionesTexto.trim()) {
    return 'Una lista de opciones necesita al menos una opción (sepáralas con comas).';
  }
  return null;
}

/** Valida el formulario de edición. Devuelve null si está OK. */
export function validarEdicionCampo(input: {
  etiqueta: string;
  tipo: TipoCampo;
  opcionesTexto: string;
}): string | null {
  if (!input.etiqueta.trim()) {
    return 'El nombre para mostrar no puede quedar vacío.';
  }
  if (input.tipo === 'SELECT' && !input.opcionesTexto.trim()) {
    return 'Una lista de opciones necesita al menos una opción.';
  }
  return null;
}

/** Construye el payload para POST /catalogos/campos-personalizados. */
export function armarPayloadNuevoCampo(
  form: Pick<NuevoCampoFormState, 'entidad' | 'etiqueta' | 'clave' | 'tipo' | 'opcionesTexto' | 'requerido'>
): NuevoCampoPayload {
  const claveFinal = form.clave.trim() || sugerirClave(form.etiqueta);
  const payload: NuevoCampoPayload = {
    entidad: form.entidad.trim(),
    clave: claveFinal,
    etiqueta: form.etiqueta.trim(),
    tipo: form.tipo,
    requerido: form.requerido,
  };
  if (form.tipo === 'SELECT') {
    payload.opciones = parsearOpciones(form.opcionesTexto);
  }
  return payload;
}

/** Construye el payload para PUT /catalogos/campos-personalizados/:id. */
export function armarPayloadEdicion(input: {
  etiqueta: string;
  tipo: TipoCampo;
  opcionesTexto: string;
  requerido: boolean;
}): EdicionCampoPayload {
  return {
    etiqueta: input.etiqueta.trim(),
    tipo: input.tipo,
    opciones: input.tipo === 'SELECT' ? parsearOpciones(input.opcionesTexto) : [],
    requerido: input.requerido,
  };
}