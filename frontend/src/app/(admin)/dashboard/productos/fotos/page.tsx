'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { apiUpload, ApiError } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

// Una combinación producto+color entre las que hay que elegir cuando el SKU
// es ambiguo (color null = "general", sin color específico).
interface OpcionFoto {
  productoId: number;
  productoNombre: string;
  color: string | null;
}

interface RespuestaFotoPorSku {
  ok: boolean;
  status: number;
  productoId?: number;
  productoNombre?: string;
  color?: string | null;
  error?: string;
  opciones?: OpcionFoto[];
}

// A diferencia de apiUpload de lib/api (que descarta el body cuando la
// respuesta no es ok), aquí sí necesitamos leerlo: el 409 de "SKU ambiguo"
// trae la lista de combinaciones producto+color para poder elegir una a mano.
async function intentarSubirFotoPorSku(sku: string, archivo: File): Promise<RespuestaFotoPorSku> {
  const formData = new FormData();
  formData.append('sku', sku);
  formData.append('imagen', archivo);

  const res = await fetch(`${API_URL}/productos/fotos-por-sku`, {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...body };
}

type Estado = 'pendiente' | 'subiendo' | 'ok' | 'no-encontrado' | 'ambiguo' | 'error';

interface ItemFoto {
  archivo: File;
  sku: string;
  estado: Estado;
  mensaje?: string;
  // Solo cuando estado === 'ambiguo': combinaciones producto+color entre las
  // que hay que elegir, y cuál se seleccionó en el <select> (como clave
  // "productoId::color") mientras no se confirma.
  candidatos?: OpcionFoto[];
  opcionElegida?: string;
}

function claveOpcion(o: OpcionFoto) {
  return `${o.productoId}::${o.color ?? ''}`;
}

const ESTADO_STYLE: Record<Estado, { color: string; label: string }> = {
  pendiente: { color: 'var(--color-muted)', label: 'Pendiente' },
  subiendo: { color: 'var(--color-muted)', label: 'Subiendo...' },
  ok: { color: '#1a7d36', label: 'Subida' },
  'no-encontrado': { color: '#a06a00', label: 'SKU no encontrado' },
  ambiguo: { color: '#a06a00', label: 'SKU ambiguo' },
  error: { color: 'var(--color-danger)', label: 'Error' },
};

// El nombre del archivo (sin extensión) se usa tal cual como SKU de fábrica
// para buscar a qué producto pertenece — así una carpeta local con fotos
// nombradas "112441113-13.jpg" se puede subir en un solo lote sin buscar
// cada producto a mano.
function skuDeNombreArchivo(nombreArchivo: string): string {
  return nombreArchivo.replace(/\.[^/.]+$/, '').trim();
}

export default function FotosPorSkuPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ItemFoto[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  function agregarArchivos(lista: FileList | File[]) {
    const nuevos = Array.from(lista)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ archivo: f, sku: skuDeNombreArchivo(f.name), estado: 'pendiente' as Estado }));
    setItems(nuevos);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    if (e.dataTransfer.files?.length) agregarArchivos(e.dataTransfer.files);
  }

  async function subirTodo() {
    setSubiendo(true);
    // Una a la vez: Cloudinary/Render no necesitan que les caigan 200
    // peticiones simultáneas, y así el reporte se va viendo en vivo.
    for (let i = 0; i < items.length; i++) {
      setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, estado: 'subiendo' } : it)));
      const resp = await intentarSubirFotoPorSku(items[i].sku, items[i].archivo);
      if (resp.ok) {
        const etiqueta = resp.color ? `${resp.productoNombre} (${resp.color})` : resp.productoNombre;
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, estado: 'ok', mensaje: etiqueta } : it)));
      } else if (resp.status === 404) {
        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, estado: 'no-encontrado', mensaje: resp.error } : it))
        );
      } else if (resp.status === 409) {
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, estado: 'ambiguo', mensaje: resp.error, candidatos: resp.opciones || [] } : it
          )
        );
      } else {
        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, estado: 'error', mensaje: resp.error || 'Error al subir.' } : it))
        );
      }
    }
    setSubiendo(false);
  }

  // Cuando un SKU salió "ambiguo" (mismo SKU repetido en más de una
  // combinación producto+color — típico de modelos "By You" custom donde el
  // color cambia mucho el aspecto), se resuelve a mano: se elige la
  // combinación correcta del desplegable y se sube directo a esa galería con
  // ese color, sin pasar por la búsqueda por SKU.
  async function resolverAmbiguo(i: number) {
    const it = items[i];
    const opcion = it.candidatos?.find((c) => claveOpcion(c) === it.opcionElegida);
    if (!opcion) return;
    setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, estado: 'subiendo' } : x)));
    try {
      const formData = new FormData();
      formData.append('imagen', it.archivo);
      if (opcion.color) formData.append('color', opcion.color);
      await apiUpload(`/productos/${opcion.productoId}/imagenes`, formData);
      const etiqueta = opcion.color ? `${opcion.productoNombre} (${opcion.color})` : opcion.productoNombre;
      setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, estado: 'ok', mensaje: etiqueta } : x)));
    } catch (err) {
      setItems((prev) =>
        prev.map((x, idx) =>
          idx === i
            ? { ...x, estado: 'ambiguo', mensaje: err instanceof ApiError ? err.message : 'Error al subir la foto.' }
            : x
        )
      );
    }
  }

  function reiniciar() {
    setItems([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  const resumen = items.reduce(
    (acc, it) => {
      if (it.estado === 'ok') acc.ok++;
      else if (it.estado === 'no-encontrado' || it.estado === 'ambiguo' || it.estado === 'error') acc.conProblema++;
      return acc;
    },
    { ok: 0, conProblema: 0 }
  );
  const terminado = items.length > 0 && items.every((it) => it.estado !== 'pendiente' && it.estado !== 'subiendo');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>Subir fotos por SKU</h1>
        <Link href="/dashboard/productos" className="btn-secondary btn" style={{ textDecoration: 'none' }}>
          ← Volver a Productos
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>1. Elige las fotos</h2>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
          El nombre de cada archivo (sin la extensión) se usa como SKU de fábrica para encontrar el producto — por
          ejemplo <code>112441113-13.jpg</code> busca el producto que tenga ese SKU. Si ese SKU está repetido en más
          de un producto (por ejemplo modelos &quot;By You&quot; de distintos colores que comparten SKU de fábrica),
          te lo marca como ambiguo y puedes elegir a mano a cuál va.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${arrastrando ? 'var(--color-primary, #d35400)' : 'var(--color-border)'}`,
            borderRadius: 8,
            padding: 24,
            textAlign: 'center',
            cursor: 'pointer',
            background: arrastrando ? '#fff7f0' : '#fafafa',
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            Arrastra aquí las fotos, o haz clic para elegirlas
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && agregarArchivos(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" onClick={subirTodo} disabled={subiendo || terminado}>
              {subiendo ? 'Subiendo...' : `Subir ${items.length} fotos`}
            </button>
            <button className="btn-secondary btn" onClick={reiniciar} disabled={subiendo}>
              {terminado ? 'Subir otra carpeta' : 'Cancelar'}
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>2. Resultado</h2>
          {terminado && (
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              <strong style={{ color: '#1a7d36' }}>{resumen.ok} subidas</strong>
              {resumen.conProblema > 0 && (
                <span style={{ color: 'var(--color-danger)' }}> · {resumen.conProblema} con problema</span>
              )}
            </p>
          )}
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>SKU buscado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.archivo.name}</td>
                    <td>{it.sku || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      <span style={{ color: ESTADO_STYLE[it.estado].color }}>{ESTADO_STYLE[it.estado].label}</span>
                      {it.estado === 'ok' && it.mensaje ? ` — ${it.mensaje}` : ''}
                      {it.estado === 'no-encontrado' || it.estado === 'error' ? ` — ${it.mensaje}` : ''}
                      {it.estado === 'ambiguo' && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                          <select
                            value={it.opcionElegida || ''}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, idx) => (idx === i ? { ...x, opcionElegida: e.target.value } : x))
                              )
                            }
                            style={{ fontSize: 12, maxWidth: 260 }}
                          >
                            <option value="">Elige producto y color...</option>
                            {(it.candidatos || []).map((c) => (
                              <option key={claveOpcion(c)} value={claveOpcion(c)}>
                                {c.productoNombre}
                                {c.color ? ` (${c.color})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px' }}
                            onClick={() => resolverAmbiguo(i)}
                            disabled={!it.opcionElegida}
                          >
                            Subir a esta opción
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
