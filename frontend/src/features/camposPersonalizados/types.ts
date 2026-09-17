export type TipoCampo = 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'FECHA' | 'SELECT';

export interface CampoPersonalizado {
  id: number;
  entidad: string;
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  opciones: string[];
  requerido: boolean;
  activo: boolean;
}

export interface OpcionTipoCampo {
  valor: TipoCampo;
  etiqueta: string;
}

// Etiquetas para el <select> de tipo. Vive en types.ts (no en utils.ts)
// porque es una constante de presentación dependiente del contrato
// TipoCampo — si se agrega un tipo nuevo, se agrega acá y en el backend.
export const TIPOS: OpcionTipoCampo[] = [
  { valor: 'TEXTO', etiqueta: 'Texto' },
  { valor: 'NUMERO', etiqueta: 'Número' },
  { valor: 'BOOLEANO', etiqueta: 'Sí / No' },
  { valor: 'FECHA', etiqueta: 'Fecha' },
  { valor: 'SELECT', etiqueta: 'Lista de opciones' },
];

// Payloads que viajan al backend. Separar "form state" de "payload" evita
// que page.tsx/hook tengan que saber cómo se traduce `opcionesTexto` a
// `opciones: string[]` (eso es lógica pura, ver utils.ts).
export interface NuevoCampoPayload {
  entidad: string;
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  opciones?: string[];
  requerido: boolean;
}

export interface EdicionCampoPayload {
  etiqueta: string;
  tipo: TipoCampo;
  opciones: string[];
  requerido: boolean;
}

// Estado interno del formulario de alta (controlado por NuevoCampoForm).
export interface NuevoCampoFormState {
  entidad: string;
  etiqueta: string;
  clave: string;
  claveEditadaAMano: boolean;
  tipo: TipoCampo;
  opcionesTexto: string;
  requerido: boolean;
}