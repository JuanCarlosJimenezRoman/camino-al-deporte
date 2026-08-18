'use client';

/**
 * Contexto global de "sucursal que se está viendo" — SOLO para vistas de
 * consulta (Inventario, Reportes, y a futuro Productos). Ventas y Apartados
 * mantienen su propio selector transaccional (a qué sucursal se registra la
 * venta/apartado, incluido el bloqueo del rol VENTAS) sin ningún cambio de
 * comportamiento: ver ventas/page.tsx (sucursalBloqueada) y
 * apartados/page.tsx (NuevoApartadoForm). Este contexto no se conecta a
 * esas páginas.
 *
 * Usa el mismo endpoint GET /sucursales que ya consumen Inventario,
 * Reportes, Ventas y Apartados hoy — no se agrega nada al backend.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export interface Sucursal {
  id: number;
  nombre: string;
}

interface BranchContextValue {
  sucursales: Sucursal[];
  /** null = "Todas las sucursales" (solo disponible para ADMIN_PRINCIPAL/DESARROLLO) */
  sucursalId: number | null;
  setSucursalId: (id: number | null) => void;
  sucursalActual: Sucursal | null;
  cargando: boolean;
  puedeVerTodas: boolean;
}

const STORAGE_KEY = 'camino:sucursalTopbar';

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalIdState] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  const puedeVerTodas = usuario?.rol === 'ADMIN_PRINCIPAL' || usuario?.rol === 'DESARROLLO';

  useEffect(() => {
    if (!usuario) return;
    let activo = true;

    api<Sucursal[]>('/sucursales')
      .then((data) => {
        if (!activo) return;
        setSucursales(data);

        const guardada = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (guardada === 'todas' && puedeVerTodas) {
          setSucursalIdState(null);
        } else if (guardada && data.some((s) => String(s.id) === guardada)) {
          setSucursalIdState(Number(guardada));
        } else if (usuario.sucursalId) {
          setSucursalIdState(usuario.sucursalId);
        } else if (data[0]) {
          setSucursalIdState(data[0].id);
        }
      })
      .catch(() => {
        /* si falla, el selector del topbar simplemente no se muestra */
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  function setSucursalId(id: number | null) {
    setSucursalIdState(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id === null ? 'todas' : String(id));
    }
  }

  const sucursalActual = sucursales.find((s) => s.id === sucursalId) ?? null;

  return (
    <BranchContext.Provider value={{ sucursales, sucursalId, setSucursalId, sucursalActual, cargando, puedeVerTodas }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch debe usarse dentro de <BranchProvider>');
  return ctx;
}
