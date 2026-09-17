// Sub-hook: bloque "Cuentas de transferencia" (CRUD + toggle activo +
// toggle paraVentasOnline, con edición inline de una fila a la vez).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  actualizarCuentaTransferencia,
  crearCuentaTransferencia,
  listarCuentasTransferencia,
} from './api';
import type { CuentaTransferencia, CuentaTransferenciaInput } from './types';
import { cuentaAEditForm, cuentaVacia, validarCuenta } from './utils';

export interface UseCuentasTransferenciaReturn {
  cuentas: CuentaTransferencia[];
  cargando: boolean;
  mensaje: string | null;

  // Formulario de creación (fila superior)
  formNueva: CuentaTransferenciaInput;
  setFormNueva: (v: CuentaTransferenciaInput) => void;
  crear: () => Promise<void>;
  creando: boolean;

  // Edición inline
  editandoId: number | null;
  editando: Required<CuentaTransferenciaInput>;
  setEditando: (v: Required<CuentaTransferenciaInput>) => void;
  abrirEdicion: (c: CuentaTransferencia) => void;
  cerrarEdicion: () => void;
  guardarEdicion: () => Promise<void>;

  // Toggles rápidos
  toggleActivo: (c: CuentaTransferencia) => Promise<void>;
  toggleOnline: (c: CuentaTransferencia) => Promise<void>;

  recargar: () => Promise<void>;
}

export function useCuentasTransferencia(enabled: boolean = true): UseCuentasTransferenciaReturn {
  const [cuentas, setCuentas] = useState<CuentaTransferencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [formNueva, setFormNueva] = useState<CuentaTransferenciaInput>(cuentaVacia());
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Required<CuentaTransferenciaInput>>(cuentaAEditForm({
    id: 0, nombre: '', banco: null, titular: null, numeroCuenta: null, activo: true, paraVentasOnline: false,
  }));

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await listarCuentasTransferencia(true);
      setCuentas(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudieron cargar las cuentas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCargando(false);
      return;
    }
    recargar();
  }, [enabled, recargar]);

  const crear = useCallback(async () => {
    const error = validarCuenta(formNueva);
    if (error) {
      setMensaje(error);
      return;
    }
    setCreando(true);
    setMensaje(null);
    try {
      await crearCuentaTransferencia(formNueva);
      setFormNueva(cuentaVacia());
      await recargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear la cuenta.');
    } finally {
      setCreando(false);
    }
  }, [formNueva, recargar]);

  const abrirEdicion = useCallback((c: CuentaTransferencia) => {
    setEditandoId(c.id);
    setEditando(cuentaAEditForm(c));
    setMensaje(null);
  }, []);

  const cerrarEdicion = useCallback(() => {
    setEditandoId(null);
  }, []);

  const guardarEdicion = useCallback(async () => {
    if (editandoId == null) return;
    const error = validarCuenta(editando);
    if (error) {
      setMensaje(error);
      return;
    }
    try {
      await actualizarCuentaTransferencia(editandoId, editando);
      setEditandoId(null);
      await recargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar la cuenta.');
    }
  }, [editandoId, editando, recargar]);

  const toggleActivo = useCallback(
    async (c: CuentaTransferencia) => {
      try {
        await actualizarCuentaTransferencia(c.id, { activo: !c.activo });
        await recargar();
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
      }
    },
    [recargar]
  );

  const toggleOnline = useCallback(
    async (c: CuentaTransferencia) => {
      try {
        await actualizarCuentaTransferencia(c.id, { paraVentasOnline: !c.paraVentasOnline });
        await recargar();
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
      }
    },
    [recargar]
  );

  return {
    cuentas,
    cargando,
    mensaje,
    formNueva,
    setFormNueva,
    crear,
    creando,
    editandoId,
    editando,
    setEditando,
    abrirEdicion,
    cerrarEdicion,
    guardarEdicion,
    toggleActivo,
    toggleOnline,
    recargar,
  };
}