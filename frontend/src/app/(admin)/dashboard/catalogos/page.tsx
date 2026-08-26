'use client';

import { useEffect, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';

interface Marca {
  id: number;
  nombre: string;
  activo: boolean;
}
interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
  // Portada para la tarjeta de categoría de la tienda en línea. null/undefined
  // = todavía no se subió ninguna (la tienda cae a la foto de un producto de
  // esa categoría, ver CategoryGrid en el frontend de la tienda).
  imagenPortada?: string | null;
}
interface Modelo {
  id: number;
  nombre: string;
  marcaId: number;
  activo: boolean;
}
interface Talla {
  id: number;
  valor: string;
  tipo: string;
  orden: number;
  activo: boolean;
}

// Cuando INVENTARIO intenta desactivar algo, el backend no lo aplica: crea
// una solicitud pendiente de aprobación y responde 202 con esta forma en vez
// del registro actualizado.
interface RespuestaPendiente {
  pendiente: true;
  mensaje: string;
}

function esPendiente(resultado: unknown): resultado is RespuestaPendiente {
  return !!resultado && typeof resultado === 'object' && (resultado as RespuestaPendiente).pendiente === true;
}

export default function CatalogosPage() {
  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Catálogos</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14 }}>
        Marcas, modelos, categorías y tallas se usan para clasificar los productos. Los cambios aquí
        aparecen de inmediato en el formulario de "Nuevo producto".
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <MarcasCard />
        <CategoriasCard />
        <ModelosCard />
        <TallasCard />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marcas
// ---------------------------------------------------------------------------

function MarcasCard() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setMarcas(await api<Marca[]>('/catalogos/marcas?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api('/catalogos/marcas', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
      setNombre('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la marca.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/marcas/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: editandoNombre }) });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la marca.');
    }
  }

  async function toggleActivo(m: Marca) {
    try {
      const resultado = await api(`/catalogos/marcas/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !m.activo }),
      });
      if (esPendiente(resultado)) {
        setMensaje(resultado.mensaje);
      } else {
        cargar();
      }
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Marcas</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nueva marca (ej. Nike)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {marcas.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: m.activo ? 1 : 0.5,
            }}
          >
            {editandoId === m.id ? (
              <>
                <input
                  value={editandoNombre}
                  onChange={(e) => setEditandoNombre(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => guardarEdicion(m.id)}>
                  Guardar
                </button>
                <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14 }}>{m.nombre}</span>
                <button
                  className="btn-secondary btn"
                  onClick={() => {
                    setEditandoId(m.id);
                    setEditandoNombre(m.nombre);
                  }}
                >
                  Editar
                </button>
                <button className="btn-secondary btn" onClick={() => toggleActivo(m)}>
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </div>
        ))}
        {marcas.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin marcas todavía.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

function CategoriasCard() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Id de la categoría cuya portada se está subiendo ahora mismo (para
  // deshabilitar solo ese input mientras sube, no todos).
  const [subiendoId, setSubiendoId] = useState<number | null>(null);

  async function cargar() {
    setCategorias(await api<Categoria[]>('/catalogos/categorias?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api('/catalogos/categorias', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
      setNombre('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la categoría.');
    }
  }

  async function subirPortada(id: number, file: File, inputEl: HTMLInputElement) {
    if (!file.type.startsWith('image/')) {
      setMensaje('Solo se pueden subir imágenes.');
      inputEl.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMensaje('La imagen no puede pesar más de 5 MB.');
      inputEl.value = '';
      return;
    }
    setSubiendoId(id);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('imagen', file);
      await apiUpload(`/catalogos/categorias/${id}/imagen`, formData);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al subir la portada.');
    } finally {
      setSubiendoId(null);
      inputEl.value = '';
    }
  }

  async function quitarPortada(id: number) {
    if (!window.confirm('¿Quitar la portada? La tienda volverá a usar la foto de un producto de esta categoría.')) return;
    try {
      await api(`/catalogos/categorias/${id}/imagen`, { method: 'DELETE' });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al quitar la portada.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/categorias/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: editandoNombre }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar.');
    }
  }

  async function toggleActivo(c: Categoria) {
    try {
      const resultado = await api(`/catalogos/categorias/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !c.activo }),
      });
      if (esPendiente(resultado)) {
        setMensaje(resultado.mensaje);
      } else {
        cargar();
      }
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 4 }}>Categorías</h2>
      <p style={{ color: 'var(--color-muted)', fontSize: 12, marginBottom: 12 }}>
        La portada se usa en "Explora por categoría" de la tienda en línea. Si una categoría no tiene
        portada propia, la tienda usa de respaldo la foto de un producto de esa categoría.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nueva categoría (ej. Calzado)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {categorias.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: c.activo ? 1 : 0.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editandoId === c.id ? (
                <>
                  <input
                    value={editandoNombre}
                    onChange={(e) => setEditandoNombre(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn" onClick={() => guardarEdicion(c.id)}>
                    Guardar
                  </button>
                  <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>{c.nombre}</span>
                  <button
                    className="btn-secondary btn"
                    onClick={() => {
                      setEditandoId(c.id);
                      setEditandoNombre(c.nombre);
                    }}
                  >
                    Editar
                  </button>
                  <button className="btn-secondary btn" onClick={() => toggleActivo(c)}>
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {c.imagenPortada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imagenPortada}
                  alt=""
                  style={{
                    width: 40,
                    height: 50,
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 50,
                    borderRadius: 6,
                    border: '1px dashed var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontSize: 9,
                    lineHeight: 1.2,
                    color: 'var(--color-muted)',
                    flexShrink: 0,
                  }}
                >
                  Sin portada
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                disabled={subiendoId === c.id}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) subirPortada(c.id, file, e.target);
                }}
                style={{ fontSize: 11, maxWidth: 200 }}
              />
              {subiendoId === c.id && <span style={{ fontSize: 12 }}>Subiendo...</span>}
              {c.imagenPortada && (
                <button
                  className="btn-secondary btn"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => quitarPortada(c.id)}
                >
                  Quitar portada
                </button>
              )}
            </div>
          </div>
        ))}
        {categorias.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin categorías todavía.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modelos (dependen de una marca)
// ---------------------------------------------------------------------------

function ModelosCard() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaId, setMarcaId] = useState('');
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    api<Marca[]>('/catalogos/marcas').then((data) => {
      setMarcas(data);
      if (data[0]) setMarcaId(String(data[0].id));
    });
  }, []);

  async function cargarModelos() {
    if (!marcaId) return;
    setModelos(await api<Modelo[]>(`/catalogos/modelos?marcaId=${marcaId}&todas=1`));
  }

  useEffect(() => {
    cargarModelos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaId]);

  async function crear() {
    if (!nombre.trim() || !marcaId) return;
    try {
      await api('/catalogos/modelos', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim(), marcaId: Number(marcaId) }),
      });
      setNombre('');
      cargarModelos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear el modelo.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/modelos/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: editandoNombre }) });
      setEditandoId(null);
      cargarModelos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar el modelo.');
    }
  }

  async function toggleActivo(m: Modelo) {
    try {
      const resultado = await api(`/catalogos/modelos/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !m.activo }),
      });
      if (esPendiente(resultado)) {
        setMensaje(resultado.mensaje);
      } else {
        cargarModelos();
      }
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Modelos</h2>

      <label style={{ fontSize: 13 }}>Marca</label>
      <div style={{ marginBottom: 10 }}>
        <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Nuevo modelo (ej. Air Max)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <button className="btn" onClick={crear} disabled={!marcaId}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <div>
        {modelos.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-border)',
              opacity: m.activo ? 1 : 0.5,
            }}
          >
            {editandoId === m.id ? (
              <>
                <input
                  value={editandoNombre}
                  onChange={(e) => setEditandoNombre(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={() => guardarEdicion(m.id)}>
                  Guardar
                </button>
                <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14 }}>{m.nombre}</span>
                <button
                  className="btn-secondary btn"
                  onClick={() => {
                    setEditandoId(m.id);
                    setEditandoNombre(m.nombre);
                  }}
                >
                  Editar
                </button>
                <button className="btn-secondary btn" onClick={() => toggleActivo(m)}>
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </div>
        ))}
        {modelos.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin modelos para esta marca.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tallas (agrupadas por tipo: calzado, ropa, etc.)
// ---------------------------------------------------------------------------

function TallasCard() {
  const [tallas, setTallas] = useState<Talla[]>([]);
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState('calzado');
  const [orden, setOrden] = useState('0');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoValor, setEditandoValor] = useState('');
  const [editandoOrden, setEditandoOrden] = useState('0');
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setTallas(await api<Talla[]>('/catalogos/tallas?todas=1'));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear() {
    if (!valor.trim() || !tipo.trim()) return;
    try {
      await api('/catalogos/tallas', {
        method: 'POST',
        body: JSON.stringify({ valor: valor.trim(), tipo: tipo.trim(), orden: Number(orden) || 0 }),
      });
      setValor('');
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la talla.');
    }
  }

  async function guardarEdicion(id: number) {
    try {
      await api(`/catalogos/tallas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ valor: editandoValor, orden: Number(editandoOrden) || 0 }),
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la talla.');
    }
  }

  async function toggleActivo(t: Talla) {
    try {
      const resultado = await api(`/catalogos/tallas/${t.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !t.activo }),
      });
      if (esPendiente(resultado)) {
        setMensaje(resultado.mensaje);
      } else {
        cargar();
      }
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  const tiposExistentes = Array.from(new Set(tallas.map((t) => t.tipo)));
  const grupos = tiposExistentes.length > 0 ? tiposExistentes : [tipo];

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Tallas</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          placeholder="Valor (ej. 9.5)"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          style={{ maxWidth: 100 }}
        />
        <input
          placeholder="Tipo (ej. calzado)"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <input
          type="number"
          placeholder="Orden"
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          style={{ maxWidth: 80 }}
        />
        <button className="btn" onClick={crear}>
          Agregar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      {grupos.map((g) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4 }}>
            {g}
          </div>
          {tallas
            .filter((t) => t.tipo === g)
            .map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  borderBottom: '1px solid var(--color-border)',
                  opacity: t.activo ? 1 : 0.5,
                }}
              >
                {editandoId === t.id ? (
                  <>
                    <input
                      value={editandoValor}
                      onChange={(e) => setEditandoValor(e.target.value)}
                      style={{ maxWidth: 100 }}
                    />
                    <input
                      type="number"
                      value={editandoOrden}
                      onChange={(e) => setEditandoOrden(e.target.value)}
                      style={{ maxWidth: 80 }}
                    />
                    <button className="btn" onClick={() => guardarEdicion(t.id)}>
                      Guardar
                    </button>
                    <button className="btn-secondary btn" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 14 }}>{t.valor}</span>
                    <button
                      className="btn-secondary btn"
                      onClick={() => {
                        setEditandoId(t.id);
                        setEditandoValor(t.valor);
                        setEditandoOrden(String(t.orden));
                      }}
                    >
                      Editar
                    </button>
                    <button className="btn-secondary btn" onClick={() => toggleActivo(t)}>
                      {t.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      ))}
      {tallas.length === 0 && <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin tallas todavía.</p>}
    </div>
  );
}
