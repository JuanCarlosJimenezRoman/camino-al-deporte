'use client';

import { useRef, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';

export interface Imagen {
  id: number;
  url: string;
  esPrincipal: boolean;
}

export function GaleriaFotos({
  productoId,
  imagenes,
  onCambio,
}: {
  productoId: number;
  imagenes: Imagen[];
  onCambio: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function subir(file: File) {
    if (!file.type.startsWith('image/')) {
      setMensaje('Solo se pueden subir imágenes.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMensaje('La imagen no puede pesar más de 5 MB.');
      return;
    }

    setSubiendo(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append('imagen', file);
      await apiUpload(`/productos/${productoId}/imagenes`, formData);
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al subir la imagen.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function marcarPrincipal(imagenId: number) {
    try {
      await api(`/productos/${productoId}/imagenes/${imagenId}/principal`, { method: 'PUT' });
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  async function borrar(imagenId: number) {
    if (!window.confirm('¿Borrar esta foto?')) return;
    try {
      await api(`/productos/${productoId}/imagenes/${imagenId}`, { method: 'DELETE' });
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al borrar la imagen.');
    }
  }

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {imagenes.map((img) => (
          <div key={img.id} style={{ textAlign: 'center' }}>
            <img
              src={img.url}
              alt=""
              style={{
                width: 90,
                height: 90,
                objectFit: 'cover',
                borderRadius: 8,
                border: img.esPrincipal ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'center' }}>
              {!img.esPrincipal && (
                <button
                  className="btn-secondary btn"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => marcarPrincipal(img.id)}
                >
                  Portada
                </button>
              )}
              <button
                className="btn-secondary btn"
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => borrar(img.id)}
              >
                Borrar
              </button>
            </div>
            {img.esPrincipal && (
              <div style={{ fontSize: 11, color: 'var(--color-primary)', marginTop: 2 }}>Portada</div>
            )}
          </div>
        ))}
        {imagenes.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin fotos todavía.</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
        disabled={subiendo}
      />
      {subiendo && <span style={{ fontSize: 13, marginLeft: 8 }}>Subiendo...</span>}
      {mensaje && <p style={{ fontSize: 13, marginTop: 8 }}>{mensaje}</p>}
    </div>
  );
}
