'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { aprobarSolicitud, listarSolicitudes, rechazarSolicitud } from './api';
import type { EstadoSolicitud, Solicitud } from './types';

interface UseSolicitudesResult {
  solicitudes: Solicitud[];
  filtro: EstadoSolicitud | '';
  setFiltro: (filtro: EstadoSolicitud | '') => void;
  mensaje: string | null;
  procesandoId: number | null;
  notaPorId: Record<number, string>;
  setNota: (id: number, nota: string) => void;
  cargar: () => Promise<void>;
  aprobar: (id: number) => Promise<void>;
  rechazar: (id: number) => Promise<void>;
}

/**
 * Orquesta estado, carga y mutaciones de solicitudes. Extraído de
 * page.tsx para que la pantalla sea solo composición.
 */
export function useSolicitudes(): UseSolicitudesResult {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtro, setFiltro] = useState<EstadoSolicitud | ''>('PENDIENTE');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [notaPorId, setNotaPorId] = useState<Record<number, string>>({});

  const cargar = useCallback(async () => {
    try {
      const data = await listarSolicitudes(filtro);
      setSolicitudes(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al cargar las solicitudes.');
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const setNota = useCallback((id: number, nota: string) => {
    setNotaPorId((prev) => ({ ...prev, [id]: nota }));
  }, []);

  const aprobar = useCallback(
    async (id: number) => {
      setProcesandoId(id);
      try {
        await aprobarSolicitud(id);
        setMensaje('Solicitud aprobada y aplicada.');
        await cargar();
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : 'Error al aprobar la solicitud.');
      } finally {
        setProcesandoId(null);
      }
    },
    [cargar]
  );

  const rechazar = useCallback(
    async (id: number) => {
      setProcesandoId(id);
      try {
        await rechazarSolicitud(id, notaPorId[id]);
        setMensaje('Solicitud rechazada.');
        await cargar();
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : 'Error al rechazar la solicitud.');
      } finally {
        setProcesandoId(null);
      }
    },
    [cargar, notaPorId]
  );

  return {
    solicitudes,
    filtro,
    setFiltro,
    mensaje,
    procesandoId,
    notaPorId,
    setNota,
    cargar,
    aprobar,
    rechazar,
  };
}