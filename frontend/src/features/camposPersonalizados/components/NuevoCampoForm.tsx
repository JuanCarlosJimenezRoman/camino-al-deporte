'use client';

import { useState } from 'react';
import { TIPOS, TipoCampo } from '../types';
import { sugerirClave } from '../utils';

export interface NuevoCampoFormProps {
  /**
   * Devuelve `true` si el campo se creó con éxito (para que el form se
   * resetee). `false` significa que hubo error de validación o de red
   * — el mensaje ya lo publicó el hook, acá solo no reseteamos.
   */
  onCrear: (form: {
    entidad: string;
    etiqueta: string;
    clave: string;
    tipo: TipoCampo;
    opcionesTexto: string;
    requerido: boolean;
  }) => Promise<boolean>;
}

export function NuevoCampoForm({ onCrear }: NuevoCampoFormProps) {
  const [entidad, setEntidad] = useState('producto');
  const [etiqueta, setEtiqueta] = useState('');
  const [clave, setClave] = useState('');
  const [claveEditadaAMano, setClaveEditadaAMano] = useState(false);
  const [tipo, setTipo] = useState<TipoCampo>('TEXTO');
  const [opcionesTexto, setOpcionesTexto] = useState('');
  const [requerido, setRequerido] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function alCambiarEtiqueta(valor: string) {
    setEtiqueta(valor);
    if (!claveEditadaAMano) setClave(sugerirClave(valor));
  }

  async function crear() {
    setGuardando(true);
    try {
      const ok = await onCrear({
        entidad,
        etiqueta,
        clave,
        tipo,
        opcionesTexto,
        requerido,
      });
      if (!ok) return;
      setEtiqueta('');
      setClave('');
      setClaveEditadaAMano(false);
      setOpcionesTexto('');
      setRequerido(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nuevo campo</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 640 }}>
        <div>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Entidad</label>
          <input
            list="entidades-sugeridas"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            placeholder="producto"
          />
          <datalist id="entidades-sugeridas">
            <option value="producto" />
          </datalist>
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

        <div>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
            Nombre para mostrar (ej. "Género")
          </label>
          <input value={etiqueta} onChange={(e) => alCambiarEtiqueta(e.target.value)} placeholder="Género" />
        </div>

        <div>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
            Clave interna (se genera sola, se puede ajustar)
          </label>
          <input
            value={clave}
            onChange={(e) => {
              setClave(e.target.value);
              setClaveEditadaAMano(true);
            }}
            placeholder="genero"
          />
        </div>

        {tipo === 'SELECT' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Opciones, separadas por comas
            </label>
            <input
              value={opcionesTexto}
              onChange={(e) => setOpcionesTexto(e.target.value)}
              placeholder="Hombre, Mujer, Unisex"
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            id="nuevo-campo-requerido"
            type="checkbox"
            checked={requerido}
            onChange={(e) => setRequerido(e.target.checked)}
          />
          <label htmlFor="nuevo-campo-requerido" style={{ fontSize: 13 }}>
            Obligatorio al editar un producto
          </label>
        </div>
      </div>

      <button className="btn" onClick={crear} disabled={guardando} style={{ marginTop: 14 }}>
        {guardando ? 'Guardando…' : 'Agregar campo'}
      </button>
    </div>
  );
}