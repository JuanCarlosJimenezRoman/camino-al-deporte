'use client';

import { useRef, useState } from 'react';
import { api, apiUpload, ApiError } from '@/lib/api';

export interface Imagen {
  id: number;
  url: string;
  esPrincipal: boolean;
  // Color de variante al que pertenece esta foto (modelos "By You" custom,
  // por ejemplo, donde el color cambia mucho el aspecto). null = foto
  // general, válida para cualquier color que no tenga la suya propia.
  color?: string | null;
}

// Sentinel para "foto general" en el <select> de color — '' se deja libre
// para "sin elegir nada" no hace falta aquí porque el <select> siempre tiene
// un valor, pero se usa igual por consistencia con el resto de la app.
const GENERAL = '__general__';

export function GaleriaFotos({
  productoId,
  imagenes,
  colores = [],
  onCambio,
}: {
  productoId: number;
  imagenes: Imagen[];
  // Colores de las variantes de este producto, para poder etiquetar cada
  // foto con uno de ellos en vez de escribirlo a mano.
  colores?: (string | null)[];
  onCambio: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [colorNuevo, setColorNuevo] = useState(GENERAL);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const coloresDisponibles = Array.from(new Set(colores.filter((c): c is string => !!c)));

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
      if (colorNuevo !== GENERAL) formData.append('color', colorNuevo);
      await apiUpload(`/productos/${productoId}/imagenes`, formData);
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al subir la imagen.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function cambiarColor(imagenId: number, color: string) {
    try {
      await api(`/productos/${productoId}/imagenes/${imagenId}`, {
        method: 'PUT',
        body: JSON.stringify({ color: color === GENERAL ? null : color }),
      });
      onCambio();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar el color.');
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
          <div key={img.id} style={{ textAlign: 'center', width: 90 }}>
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
            {coloresDisponibles.length > 0 && (
              <select
                value={img.color || GENERAL}
                onChange={(e) => cambiarColor(img.id, e.target.value)}
                style={{ fontSize: 11, marginTop: 4, width: '100%' }}
              >
                <option value={GENERAL}>General (todos)</option>
                {coloresDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        {imagenes.length === 0 && (
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin fotos todavía.</p>
        )}
      </div>

      {coloresDisponibles.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, marginRight: 6 }}>Esta foto es de:</label>
          <select value={colorNuevo} onChange={(e) => setColorNuevo(e.target.value)} style={{ fontSize: 12, maxWidth: 180 }}>
            <option value={GENERAL}>General (todos los colores)</option>
            {coloresDisponibles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

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
