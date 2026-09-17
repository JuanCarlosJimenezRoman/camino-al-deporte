'use client';

import { CampoPersonalizado, TipoCampo } from '../types';
import { CampoFila } from './CampoFila';

export interface CamposListaProps {
  campos: CampoPersonalizado[];
  onGuardar: (
    id: number,
    input: { etiqueta: string; tipo: TipoCampo; opcionesTexto: string; requerido: boolean }
  ) => Promise<boolean>;
  onToggleActivo: (campo: CampoPersonalizado) => void;
}

export function CamposLista({ campos, onGuardar, onToggleActivo }: CamposListaProps) {
  return (
    <div>
      {campos.map((c) => (
        <CampoFila key={c.id} campo={c} onGuardar={onGuardar} onToggleActivo={onToggleActivo} />
      ))}
    </div>
  );
}