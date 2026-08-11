'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';

// Igual que apiUpload en lib/api, pero necesitamos leer el body también
// cuando la respuesta NO es ok (por ejemplo el 409 de SKU ambiguo trae
// nombres de producto útiles) — apiUpload normal descarta eso.
async function subirFotoPorSku(sku: string, archivo: File): Promise<ResultadoFoto> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const formData = new FormData();
  formData.append('sku', sku);
  formData.append('imagen', archivo);

  const res = await fetch(`${API_URL}/productos/fotos-por-sku`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(body.error || `Error ${res.status}`, res.status);
  }
  return body;
}

interface ResultadoFoto {
  productoId: number;
  productoNombre: string;
}

type Estado = 'pendiente' | 'subiendo' | 'ok' | 'no-encontrado' | 'ambiguo' | 'error';

interface ItemFoto {
  archivo: File;
  sku: string;
  estado: Estado;
  mensaje?: string;
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
      try {
        const data = await subirFotoPorSku(items[i].sku, items[i].archivo);
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, estado: 'ok', mensaje: data.productoNombre } : it
          )
        );
      } catch (err) {
        let estado: Estado = 'error';
        if (err instanceof ApiError && err.status === 404) estado = 'no-encontrado';
        if (err instanceof ApiError && err.status === 409) estado = 'ambiguo';
        const mensaje = err instanceof ApiError ? err.message : 'Error al subir la foto.';
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, estado, mensaje } : it)));
      }
    }
    setSubiendo(false);
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
          ejemplo <code>112441113-13.jpg</code> busca el producto que tenga ese SKU. Una foto por SKU.
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
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
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
                    <td style={{ color: ESTADO_STYLE[it.estado].color, fontSize: 12 }}>
                      {ESTADO_STYLE[it.estado].label}
                      {it.estado === 'ok' ? ` — ${it.mensaje}` : ''}
                      {it.estado === 'no-encontrado' || it.estado === 'ambiguo' || it.estado === 'error'
                        ? ` — ${it.mensaje}`
                        : ''}
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
