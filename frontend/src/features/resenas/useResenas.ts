'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { actualizarVisibilidadResena, listarResenas } from './api';
import type { Resena } from './types';

interface UseResenasResult {
  /** null = cargando; [] = sin reseñas todavía. */
  resenas: Resena[] | null;
  error: string | null;
  fotoAbierta: string | null;
  abrirFoto: (url: string) => void;
  cerrarFoto: () => void;
  alternarVisibilidad: (resena: Resena) => Promise<void>;
}

/**
 * Orquesta la carga y las mutaciones de reseñas. La página solo consume
 * este hook y compone componentes de presentación.
 */
export function useResenas(): UseResenasResult {
  const [resenas, setResenas] = useState<Resena[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);

  useEffect(() => {
    listarResenas()
      .then(setResenas)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las reseñas.');
      });
  }, []);

  const abrirFoto = useCallback((url: string) => setFotoAbierta(url), []);
  const cerrarFoto = useCallback(() => setFotoAbierta(null), []);

  const alternarVisibilidad = useCallback(async (r: Resena) => {
    try {
      await actualizarVisibilidadResena(r.id, !r.visible);
      setResenas((prev) => prev && prev.map((x) => (x.id === r.id ? { ...x, visible: !r.visible } : x)));
    } catch {
      // sin acción especial: si falla, el estado local no cambia y el
      // botón sigue reflejando lo real (comportamiento original).
    }
  }, []);

  return { resenas, error, fotoAbierta, abrirFoto, cerrarFoto, alternarVisibilidad };
}