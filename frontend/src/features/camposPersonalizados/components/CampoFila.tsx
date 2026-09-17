'use client';

import { useState } from 'react';
import { CampoPersonalizado, TIPOS, TipoCampo } from '../types';
import { etiquetaTipo } from '../utils';

export interface CampoFilaProps {
  campo: CampoPersonalizado;
  /**
   * Devuelve `true` si el guardado fue exitoso (para cerrar el modo edición).
   */
  onGuardar: (
    id: number,
    input: { etiqueta: string; tipo: TipoCampo; opcionesTexto: string; requerido: boolean }
  ) => Promise<boolean>;
  onToggleActivo: (campo: CampoPersonalizado) => void;
}

export function CampoFila({ campo, onGuardar, onToggleActivo }: CampoFilaProps) {
  const [editando, setEditando] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [tipo, setTipo] = useState<TipoCampo>('TEXTO');
  const [opcionesTexto, setOpcionesTexto] = useState('');
  const [requerido, setRequerido] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function comenzarEdicion() {
    setEditando(true);
    setEtiqueta(campo.etiqueta);
    setTipo(campo.tipo);
    setOpcionesTexto((campo.opciones || []).join(', '));
    setRequerido(campo.requerido);
  }

  async function guardar() {
    setGuardando(true);
    try {
      const ok = await onGuardar(campo.id, { etiqueta, tipo, opcionesTexto, requerido });
      if (ok) setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <div
        style={{
          padding: '10px 0',
          borderBottom: '1px solid var(--color-border)',
          opacity: campo.activo ? 1 : 0.5,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 560 }}>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-muted)' }}>
            Clave: <code>{campo.clave}</code> (no se puede cambiar — para eso, desactiva este campo y crea
            uno nuevo)
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Nombre para mostrar</label>
            <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Tipo de dato</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampo)}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>
          {tipo === 'SELECT' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                Opciones, separadas por comas
              </label>
              <input value={opcionesTexto} onChange={(e) => setOpcionesTexto(e.target.value)} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              id={`requerido-${campo.id}`}
              type="checkbox"
              checked={requerido}
              onChange={(e) => setRequerido(e.target.checked)}
            />
            <label htmlFor={`requerido-${campo.id}`} style={{ fontSize: 13 }}>
              Obligatorio al editar un producto
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
            <button className="btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              className="btn-secondary btn"
              onClick={() => setEditando(false)}
              disabled={guardando}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid var(--color-border)',
        opacity: campo.activo ? 1 : 0.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14 }}>
            {campo.etiqueta}{' '}
            {campo.requerido && (
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>(obligatorio)</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            <code>{campo.clave}</code> · {etiquetaTipo(campo.tipo)}
            {campo.tipo === 'SELECT' && campo.opciones?.length > 0 && ` (${campo.opciones.join(', ')})`}
          </div>
        </div>
        <button className="btn-secondary btn" onClick={comenzarEdicion}>
          Editar
        </button>
        <button className="btn-secondary btn" onClick={() => onToggleActivo(campo)}>
          {campo.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  );
}