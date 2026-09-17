// Hook de dominio de Proveedores: estado + orquestación + efectos.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  actualizarProveedor,
  crearProveedor,
  listarProveedores,
  obtenerProveedor,
  registrarPagoProveedor,
} from './api';
import type {
  NuevoPagoInput,
  Proveedor,
  ProveedorDetalle,
  ProveedorFormValues,
} from './types';
import { esPendiente, proveedorAFormValues, proveedorVacio, validarProveedor } from './utils';

export interface UseProveedoresReturn {
  // Lista
  proveedores: Proveedor[];
  cargando: boolean;

  // Detalle expandido
  expandidoId: number | null;
  detalle: ProveedorDetalle | null;
  cargandoDetalle: boolean;
  toggleExpandir: (id: number) => void;

  // Formulario (crear/editar)
  mostrarForm: boolean;
  editandoId: number | null;
  form: ProveedorFormValues;
  setForm: (v: ProveedorFormValues) => void;
  abrirNuevo: () => void;
  abrirEdicion: (p: Proveedor) => void;
  cerrarForm: () => void;
  guardar: () => Promise<void>;
  guardando: boolean;

  // Acciones sobre un proveedor
  toggleActivo: (p: Proveedor) => Promise<void>;

  // Pagos
  registrarPago: (proveedorId: number, input: NuevoPagoInput) => Promise<void>;

  // Mensajería (aviso global de la pantalla)
  mensaje: string | null;
  limpiarMensaje: () => void;
}

export function useProveedores(): UseProveedoresReturn {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(false);

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<ProveedorDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<ProveedorFormValues>(proveedorVacio());
  const [guardando, setGuardando] = useState(false);

  const [mensaje, setMensaje] = useState<string | null>(null);

  const limpiarMensaje = useCallback(() => setMensaje(null), []);

  // Descarta respuestas de detalle que llegan fuera de orden (p. ej. el
  // usuario expande otro proveedor antes de que resuelva la petición anterior).
  const detalleRequestIdRef = useRef(0);

  // Distingue cada apertura/cierre del formulario para que un guardar()
  // en vuelo no pise el mensaje o el estado de un formulario distinto que
  // el usuario ya haya abierto en su lugar.
  const formSessionRef = useRef(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await listarProveedores(true);
      setProveedores(data);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'No se pudieron cargar los proveedores.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarDetalle = useCallback(async (id: number) => {
    const requestId = ++detalleRequestIdRef.current;
    setCargandoDetalle(true);
    try {
      const data = await obtenerProveedor(id);
      if (detalleRequestIdRef.current === requestId) setDetalle(data);
    } catch (err) {
      if (detalleRequestIdRef.current === requestId) {
        setMensaje(err instanceof ApiError ? err.message : 'No se pudo cargar el detalle del proveedor.');
      }
    } finally {
      if (detalleRequestIdRef.current === requestId) setCargandoDetalle(false);
    }
  }, []);

  const toggleExpandir = useCallback(
    (id: number) => {
      if (expandidoId === id) {
        setExpandidoId(null);
        setDetalle(null);
      } else {
        setExpandidoId(id);
        cargarDetalle(id);
      }
    },
    [expandidoId, cargarDetalle]
  );

  const abrirNuevo = useCallback(() => {
    formSessionRef.current += 1;
    setEditandoId(null);
    setForm(proveedorVacio());
    setMensaje(null);
    setMostrarForm(true);
  }, []);

  const abrirEdicion = useCallback((p: Proveedor) => {
    formSessionRef.current += 1;
    setEditandoId(p.id);
    setForm(proveedorAFormValues(p));
    setMensaje(null);
    setMostrarForm(true);
  }, []);

  const cerrarForm = useCallback(() => {
    formSessionRef.current += 1;
    setMostrarForm(false);
    setMensaje(null);
  }, []);

  const guardar = useCallback(async () => {
    const errorValidacion = validarProveedor(form);
    if (errorValidacion) {
      setMensaje(errorValidacion);
      return;
    }
    const session = formSessionRef.current;
    setGuardando(true);
    try {
      if (editandoId !== null) {
        const resultado = await actualizarProveedor(editandoId, form);
        if (session !== formSessionRef.current) return;
        setMostrarForm(false);
        if (esPendiente(resultado)) {
          setMensaje(resultado.mensaje);
        } else {
          setMensaje('Proveedor actualizado.');
          await cargar();
          if (editandoId === expandidoId) await cargarDetalle(editandoId);
        }
      } else {
        await crearProveedor(form);
        if (session !== formSessionRef.current) return;
        setMensaje('Proveedor creado.');
        setMostrarForm(false);
        await cargar();
      }
    } catch (err) {
      if (session === formSessionRef.current) {
        setMensaje(err instanceof ApiError ? err.message : 'Error al guardar el proveedor.');
      }
    } finally {
      setGuardando(false);
    }
  }, [form, editandoId, expandidoId, cargar, cargarDetalle]);

  const toggleActivo = useCallback(
    async (p: Proveedor) => {
      try {
        const resultado = await actualizarProveedor(p.id, { activo: !p.activo });
        if (esPendiente(resultado)) {
          setMensaje(resultado.mensaje);
        } else {
          await cargar();
        }
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado del proveedor.');
      }
    },
    [cargar]
  );

  const registrarPago = useCallback(
    async (proveedorId: number, input: NuevoPagoInput) => {
      await registrarPagoProveedor(proveedorId, input);
      if (expandidoId === proveedorId) {
        await cargarDetalle(proveedorId);
      }
    },
    [expandidoId, cargarDetalle]
  );

  return {
    proveedores,
    cargando,
    expandidoId,
    detalle,
    cargandoDetalle,
    toggleExpandir,
    mostrarForm,
    editandoId,
    form,
    setForm,
    abrirNuevo,
    abrirEdicion,
    cerrarForm,
    guardar,
    guardando,
    toggleActivo,
    registrarPago,
    mensaje,
    limpiarMensaje,
  };
}