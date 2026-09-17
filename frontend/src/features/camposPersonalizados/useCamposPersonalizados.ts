'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  actualizarCampoPersonalizado,
  cambiarActivoCampoPersonalizado,
  crearCampoPersonalizado,
  listarCamposPersonalizados,
} from './api';
import {
  agruparPorEntidad,
  armarPayloadEdicion,
  armarPayloadNuevoCampo,
  validarEdicionCampo,
  validarNuevoCampo,
} from './utils';
import {
  CampoPersonalizado,
  NuevoCampoFormState,
  TipoCampo,
} from './types';

function mensajeDeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface UseCamposPersonalizadosResult {
  // Estado
  campos: CampoPersonalizado[];
  grupos: Array<[string, CampoPersonalizado[]]>;
  cargando: boolean;
  mensaje: string | null;
  limpiarMensaje: () => void;

  // Carga
  recargar: () => Promise<void>;

  // Mutaciones (devuelven `true` si salió bien, para que la UI pueda
  // resetear el form / cerrar el modo edición sin duplicar lógica).
  crear: (
    form: Pick<NuevoCampoFormState, 'entidad' | 'etiqueta' | 'clave' | 'tipo' | 'opcionesTexto' | 'requerido'>
  ) => Promise<boolean>;
  guardarEdicion: (
    id: number,
    input: { etiqueta: string; tipo: TipoCampo; opcionesTexto: string; requerido: boolean }
  ) => Promise<boolean>;
  toggleActivo: (campo: CampoPersonalizado) => Promise<boolean>;
}

export function useCamposPersonalizados(): UseCamposPersonalizadosResult {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await listarCamposPersonalizados();
      setCampos(data);
    } catch (err) {
      setMensaje(mensajeDeError(err, 'Error al cargar los campos.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const grupos = useMemo(() => agruparPorEntidad(campos), [campos]);

  const limpiarMensaje = useCallback(() => setMensaje(null), []);

  const crear = useCallback<UseCamposPersonalizadosResult['crear']>(
    async (form) => {
      const errorValidacion = validarNuevoCampo(form);
      if (errorValidacion) {
        setMensaje(errorValidacion);
        return false;
      }
      try {
        const payload = armarPayloadNuevoCampo(form);
        await crearCampoPersonalizado(payload);
        setMensaje(null);
        await recargar();
        return true;
      } catch (err) {
        setMensaje(mensajeDeError(err, 'Error al crear el campo.'));
        return false;
      }
    },
    [recargar]
  );

  const guardarEdicion = useCallback<UseCamposPersonalizadosResult['guardarEdicion']>(
    async (id, input) => {
      const errorValidacion = validarEdicionCampo(input);
      if (errorValidacion) {
        setMensaje(errorValidacion);
        return false;
      }
      try {
        const payload = armarPayloadEdicion(input);
        await actualizarCampoPersonalizado(id, payload);
        setMensaje(null);
        await recargar();
        return true;
      } catch (err) {
        setMensaje(mensajeDeError(err, 'Error al editar el campo.'));
        return false;
      }
    },
    [recargar]
  );

  const toggleActivo = useCallback<UseCamposPersonalizadosResult['toggleActivo']>(
    async (campo) => {
      try {
        await cambiarActivoCampoPersonalizado(campo.id, !campo.activo);
        setMensaje(null);
        await recargar();
        return true;
      } catch (err) {
        setMensaje(mensajeDeError(err, 'Error al actualizar el campo.'));
        return false;
      }
    },
    [recargar]
  );

  return {
    campos,
    grupos,
    cargando,
    mensaje,
    limpiarMensaje,
    recargar,
    crear,
    guardarEdicion,
    toggleActivo,
  };
}