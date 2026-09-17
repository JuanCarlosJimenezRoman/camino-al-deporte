// Hook de dominio de Reportes: estado + orquestación + efectos.
// Expone todo lo que ReportesVentasPage necesita para renderizar sin
// conocer detalles de fetch.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import {
  exportarReporte,
  listarSucursales,
  obtenerDesglose,
  obtenerEstimacion,
  obtenerPorMetodoPago,
  obtenerPorProveedor,
  obtenerPorSucursal,
  obtenerResumen,
  obtenerSerie,
} from './api';
import type {
  DesgloseResponse,
  EstimacionResponse,
  MetodoPagoRow,
  PresetRango,
  ProveedorRendimientoRow,
  PuntoProyeccion,
  ResumenResponse,
  SeriePunto,
  Sucursal,
  SucursalRow,
} from './types';
import { calcularPreset, formatFechaCorta } from './utils';

export function useReportes() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const esAdmin = rol === 'ADMIN_PRINCIPAL' || rol === 'DESARROLLO';
  const puedeVerReportes = puedeVer('reportes', rol);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [preset, setPreset] = useState<PresetRango>('30d');
  const [{ desde, hasta }, setRango] = useState(calcularPreset('30d'));

  const [resumen, setResumen] = useState<ResumenResponse | null>(null);
  const [serie, setSerie] = useState<SeriePunto[] | null>(null);
  const [porMetodoPago, setPorMetodoPago] = useState<MetodoPagoRow[] | null>(null);
  const [porSucursal, setPorSucursal] = useState<SucursalRow[] | null>(null);
  const [desglose, setDesglose] = useState<DesgloseResponse | null>(null);
  const [porProveedor, setPorProveedor] = useState<ProveedorRendimientoRow[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const [horizonte, setHorizonte] = useState(30);
  const [estimacion, setEstimacion] = useState<EstimacionResponse | null>(null);
  const [cargandoEstimacion, setCargandoEstimacion] = useState(false);

  useEffect(() => {
    if (esAdmin) listarSucursales().then(setSucursales).catch(() => {});
  }, [esAdmin]);

  function aplicarPreset(p: PresetRango) {
    setPreset(p);
    setRango(calcularPreset(p));
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const filtro = { desde, hasta, sucursalId: esAdmin ? sucursalId : undefined };

      const [resumenData, serieData, metodoData, desgloseData, sucursalData, proveedorData] = await Promise.all([
        obtenerResumen(filtro),
        obtenerSerie(filtro),
        obtenerPorMetodoPago(filtro),
        obtenerDesglose(filtro, 10),
        esAdmin ? obtenerPorSucursal(filtro) : Promise.resolve(null),
        obtenerPorProveedor(filtro),
      ]);

      setResumen(resumenData);
      setSerie(serieData);
      setPorMetodoPago(metodoData);
      setDesglose(desgloseData);
      setPorSucursal(sucursalData);
      setPorProveedor(proveedorData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los reportes.');
    } finally {
      setCargando(false);
    }
  }

  async function cargarEstimacion() {
    setCargandoEstimacion(true);
    try {
      const data = await obtenerEstimacion({
        horizonte,
        historialDias: 90,
        sucursalId: esAdmin ? sucursalId : undefined,
      });
      setEstimacion(data);
    } catch {
      setEstimacion(null);
    } finally {
      setCargandoEstimacion(false);
    }
  }

  useEffect(() => {
    if (puedeVerReportes) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerReportes, desde, hasta, sucursalId]);

  useEffect(() => {
    if (puedeVerReportes) cargarEstimacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerReportes, horizonte, sucursalId]);

  async function exportar() {
    setExportando(true);
    try {
      await exportarReporte({ desde, hasta, sucursalId: esAdmin ? sucursalId : undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo exportar el reporte.');
    } finally {
      setExportando(false);
    }
  }

  const datosProyeccion = useMemo<PuntoProyeccion[]>(() => {
    if (!estimacion) return [];
    const puntos: PuntoProyeccion[] = estimacion.historico.slice(-45).map((p) => ({
      fecha: formatFechaCorta(p.fecha),
      real: p.monto,
    }));
    if (puntos.length && estimacion.proyeccion.length) {
      puntos[puntos.length - 1].estimado = puntos[puntos.length - 1].real;
    }
    for (const p of estimacion.proyeccion) {
      puntos.push({ fecha: formatFechaCorta(p.fecha), estimado: p.monto });
    }
    return puntos;
  }, [estimacion]);

  const datosSerie = useMemo(
    () => (serie || []).map((p) => ({ ...p, fechaCorta: formatFechaCorta(p.fecha) })),
    [serie]
  );

  return {
    usuario,
    esAdmin,
    puedeVerReportes,

    sucursales,
    sucursalId,
    setSucursalId,
    preset,
    aplicarPreset,
    desde,
    hasta,
    setRango,
    setPreset,

    resumen,
    serie,
    porMetodoPago,
    porSucursal,
    desglose,
    porProveedor,
    cargando,
    error,

    horizonte,
    setHorizonte,
    estimacion,
    cargandoEstimacion,

    exportando,
    exportar,

    datosSerie,
    datosProyeccion,
  };
}
