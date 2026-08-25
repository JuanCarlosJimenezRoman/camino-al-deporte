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
  actualizarUsuario: (datos: Partial<Usuario>) => void;
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

  // Actualiza los datos del usuario en memoria (p. ej. tras editar el
  // perfil propio) sin necesidad de recargar la página ni volver a loguear.
  function actualizarUsuario(datos: Partial<Usuario>) {
    setUsuario((actual) => (actual ? { ...actual, ...datos } : actual));
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout, actualizarUsuario }}>
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
  // VENTAS ve esta sección para poder capturar pedidos manuales (WhatsApp,
  // Instagram, etc. — ver Pedido.origen) y darles seguimiento; el backend
  // (GET /pedidos-online, ver ROLES_PEDIDOS_MANUAL) filtra para que VENTAS
  // solo vea esos, nunca los pedidos de la tienda en línea con SPEI a la
  // cuenta del negocio, que siguen siendo exclusivos de administración.
  pedidosOnline: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  // Reseñas de clientes de la tienda en línea: mismos roles que administran
  // pedidos en línea, ya que son parte de esa misma operación.
  resenas: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  // Quién surte cada producto y los pagos que se les hace: mismos roles que
  // administran inventario/productos.
  proveedores: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'] as Rol[],
  // Bandeja de solicitudes de permiso: ADMIN_PRINCIPAL/DESARROLLO aprueban o
  // rechazan; INVENTARIO solo ve el estado de las que él mismo mandó (ver
  // GET /solicitudes, que filtra distinto según el rol).
  solicitudes: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'] as Rol[],
  // Bitácora completa de entradas/salidas de inventario (todas las
  // variantes, no solo una) — mismos roles que administran inventario.
  inventarioHistorial: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'] as Rol[],
  // Cupones de la tienda en línea: mismos roles que administran cuentas de
  // transferencia (información financiera/promocional sensible).
  cupones: ['ADMIN_PRINCIPAL', 'DESARROLLO'] as Rol[],
  // Dashboard de reportes/estimaciones de ventas: mismos roles que registran
  // ventas (ver GET /reportes/* en el backend) — ADMIN_PRINCIPAL/DESARROLLO
  // ven todas las sucursales, VENTAS ve acotado a la suya.
  reportes: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  // Registro de gastos por sucursal/proveedor: mismos roles que operan caja
  // (ver ROLES_GASTOS en el backend, routes/gastos.js) — VENTAS solo ve/
  // registra los de su propia sucursal.
  gastos: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
  // Catálogo de transportistas/destinos/tarifas de envío (ver ROLES_ENVIOS
  // en el backend, routes/envios.js) — mismos roles que operan pedidos
  // manuales, porque normalmente es quien se entera del dato cotizando con
  // un cliente.
  envios: ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'] as Rol[],
};

export function puedeVer(seccion: keyof typeof PERMISOS, rol: Rol | undefined) {
  if (!rol) return false;
  return PERMISOS[seccion].includes(rol);
}
