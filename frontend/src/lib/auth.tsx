'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';

export type Rol = 'ADMIN_PRINCIPAL' | 'DESARROLLO' | 'INVENTARIO' | 'VENTAS' | 'CONSULTA';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  sucursalId?: number | null;
  sucursal?: { id: number; nombre: string } | null;
}

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setCargando(false);
      return;
    }
    api<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setCargando(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', data.token);
    setUsuario(data.usuario);
    router.push('/dashboard');
  }

  function logout() {
    localStorage.removeItem('token');
    setUsuario(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

// Mapa central de qué roles pueden ver cada sección. Al agregar un rol o
// sección nueva, solo hay que tocar este archivo.
export const PERMISOS = {
  productos: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA'] as Rol[],
  // VENTAS entra en modo solo-consulta: puede ver existencias de cualquier
  // sucursal (para buscar un modelo y pedirlo si no lo tiene la suya), pero
  // la página oculta los botones de Entrada/Salida/Ajuste para ese rol.
  inventario: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS'] as Rol[],
  ventas: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  usuarios: ['ADMIN_PRINCIPAL', 'DESARROLLO'] as Rol[],
  camposPersonalizados: ['ADMIN_PRINCIPAL', 'DESARROLLO'] as Rol[],
  sucursales: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO', 'VENTAS', 'CONSULTA'] as Rol[],
  transferencias: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'] as Rol[],
  catalogos: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'] as Rol[],
  // Cuentas donde se reciben transferencias: información financiera, solo
  // administración las crea/edita (el resto de roles solo las consulta al
  // elegir cuenta en una venta/abono).
  cuentasTransferencia: ['ADMIN_PRINCIPAL', 'DESARROLLO'] as Rol[],
  apartados: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  historialVentas: ['ADMIN_PRINCIPAL', 'DESARROLLO'] as Rol[],
};

export function puedeVer(seccion: keyof typeof PERMISOS, rol: Rol | undefined) {
  if (!rol) return false;
  return PERMISOS[seccion].includes(rol);
}
