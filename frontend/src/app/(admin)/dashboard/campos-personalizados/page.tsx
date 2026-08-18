'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type TipoCampo = 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'FECHA' | 'SELECT';

interface CampoPersonalizado {
  id: number;
  entidad: string;
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  opciones: string[];
  requerido: boolean;
  activo: boolean;
}

const TIPOS: { valor: TipoCampo; etiqueta: string }[] = [
  { valor: 'TEXTO', etiqueta: 'Texto' },
  { valor: 'NUMERO', etiqueta: 'Número' },
  { valor: 'BOOLEANO', etiqueta: 'Sí / No' },
  { valor: 'FECHA', etiqueta: 'Fecha' },
  { valor: 'SELECT', etiqueta: 'Lista de opciones' },
];

function etiquetaTipo(tipo: TipoCampo) {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

// De "clave" libre a algo parecido a snake_case sin caracteres raros —
// evita que "Talla de calcetín" se guarde tal cual como clave y luego
// choque con espacios/acentos al usarse como llave dentro de un JSON.
function sugerirClave(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function CamposPersonalizadosPage() {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const data = await api<CampoPersonalizado[]>('/catalogos/campos-personalizados?todos=1');
      setCampos(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cargar los campos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const grupos = useMemo(() => {
    const porEntidad = new Map<string, CampoPersonalizado[]>();
    for (const c of campos) {
      if (!porEntidad.has(c.entidad)) porEntidad.set(c.entidad, []);
      porEntidad.get(c.entidad)!.push(c);
    }
    return Array.from(porEntidad.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [campos]);

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Campos personalizados</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14, maxWidth: 640 }}>
        Aquí se agregan campos nuevos (por ejemplo "Género" o "Material") sin necesitar un cambio de
        código. Un campo creado aquí para la entidad <strong>producto</strong> aparece de inmediato en el
        formulario de Productos → "Editar". Desactivar un campo lo oculta del formulario pero no borra los
        valores ya guardados en los productos existentes.
      </p>

      <NuevoCampoForm onCreado={cargar} onError={setMensaje} />

      {mensaje && (
        <p style={{ fontSize: 13, margin: '12px 0', color: 'var(--color-danger, #b91c1c)' }}>{mensaje}</p>
      )}

      {cargando ? (
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Cargando…</p>
      ) : grupos.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Todavía no hay campos personalizados.</p>
      ) : (
        grupos.map(([entidad, items]) => (
          <div key={entidad} className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12, textTransform: 'capitalize' }}>{entidad}</h2>
            <CamposLista campos={items} onCambio={cargar} onError={setMensaje} />
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta de un campo nuevo
// ---------------------------------------------------------------------------

function NuevoCampoForm({
  onCreado,
  onError,
}: {
  onCreado: () => void;
  onError: (msg: string) => void;
}) {
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
    const claveFinal = clave.trim() || sugerirClave(etiqueta);
    if (!entidad.trim() || !etiqueta.trim() || !claveFinal) {
      onError('Completa entidad, etiqueta y clave antes de guardar.');
      return;
    }
    if (tipo === 'SELECT' && !opcionesTexto.trim()) {
      onError('Una lista de opciones necesita al menos una opción (sepáralas con comas).');
      return;
    }
    setGuardando(true);
    try {
      await api('/catalogos/campos-personalizados', {
        method: 'POST',
        body: JSON.stringify({
          entidad: entidad.trim(),
          clave: claveFinal,
          etiqueta: etiqueta.trim(),
          tipo,
          ...(tipo === 'SELECT'
            ? { opciones: opcionesTexto.split(',').map((o) => o.trim()).filter(Boolean) }
            : {}),
          requerido,
        }),
      });
      setEtiqueta('');
      setClave('');
      setClaveEditadaAMano(false);
      setOpcionesTexto('');
      setRequerido(false);
      onCreado();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Error al crear el campo.');
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

// ---------------------------------------------------------------------------
// Lista + edición de los campos ya existentes de una entidad
// ---------------------------------------------------------------------------

function CamposLista({
  campos,
  onCambio,
  onError,
}: {
  campos: CampoPersonalizado[];
  onCambio: () => void;
  onError: (msg: string) => void;
}) {
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [etiqueta, setEtiqueta] = useState('');
  const [tipo, setTipo] = useState<TipoCampo>('TEXTO');
  const [opcionesTexto, setOpcionesTexto] = useState('');
  const [requerido, setRequerido] = useState(false);

  function comenzarEdicion(c: CampoPersonalizado) {
    setEditandoId(c.id);
    setEtiqueta(c.etiqueta);
    setTipo(c.tipo);
    setOpcionesTexto((c.opciones || []).join(', '));
    setRequerido(c.requerido);
  }

  async function guardarEdicion(id: number) {
    if (!etiqueta.trim()) {
      onError('El nombre para mostrar no puede quedar vacío.');
      return;
    }
    if (tipo === 'SELECT' && !opcionesTexto.trim()) {
      onError('Una lista de opciones necesita al menos una opción.');
      return;
    }
    try {
      await api(`/catalogos/campos-personalizados/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          etiqueta: etiqueta.trim(),
          tipo,
          ...(tipo === 'SELECT'
            ? { opciones: opcionesTexto.split(',').map((o) => o.trim()).filter(Boolean) }
            : { opciones: [] }),
          requerido,
        }),
      });
      setEditandoId(null);
      onCambio();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Error al editar el campo.');
    }
  }

  async function toggleActivo(c: CampoPersonalizado) {
    try {
      await api(`/catalogos/campos-personalizados/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !c.activo }),
      });
      onCambio();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Error al actualizar el campo.');
    }
  }

  return (
    <div>
      {campos.map((c) => (
        <div
          key={c.id}
          style={{
            padding: '10px 0',
            borderBottom: '1px solid var(--color-border)',
            opacity: c.activo ? 1 : 0.5,
          }}
        >
          {editandoId === c.id ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 560 }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-muted)' }}>
                Clave: <code>{c.clave}</code> (no se puede cambiar — para eso, desactiva este campo y crea
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
                  id={`requerido-${c.id}`}
                  type="checkbox"
                  checked={requerido}
                  onChange={(e) => setRequerido(e.target.checked)}
                />
                <label htmlFor={`requerido-${c.id}`} style={{ fontSize: 13 }}>
                  Obligatorio al editar un producto
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6 }}>
                <button className="btn" onClick={() => guardarEdicion(c.id)}>
                  Guardar
                </button>
                <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>
                  {c.etiqueta}{' '}
                  {c.requerido && (
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>(obligatorio)</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  <code>{c.clave}</code> · {etiquetaTipo(c.tipo)}
                  {c.tipo === 'SELECT' && c.opciones?.length > 0 && ` (${c.opciones.join(', ')})`}
                </div>
              </div>
              <button className="btn-secondary btn" onClick={() => comenzarEdicion(c)}>
                Editar
              </button>
              <button className="btn-secondary btn" onClick={() => toggleActivo(c)}>
                {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
