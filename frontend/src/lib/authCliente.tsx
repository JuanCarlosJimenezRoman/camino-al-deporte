'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiTienda, SESION_CLIENTE_EXPIRADA_EVENT } from './apiTienda';
import { toast } from '@/components/ui/use-toast';

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
}

interface RegistroPayload {
  nombre: string;
  telefono: string;
  email: string;
  password: string;
}

interface AuthClienteContextValue {
  cliente: Cliente | null;
  cargando: boolean;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  registro: (payload: RegistroPayload, redirectTo?: string) => Promise<void>;
  logout: () => void;
  // Para actualizar los datos en memoria (header, etc.) justo después de que
  // el cliente edita su perfil, sin tener que volver a pedir /me.
  actualizarCliente: (cliente: Cliente) => void;
}

const AuthClienteContext = createContext<AuthClienteContextValue | undefined>(undefined);

export function AuthClienteProvider({ children }: { children: ReactNode }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('cliente_token');
    if (!token) {
      setCargando(false);
      return;
    }
    apiTienda<Cliente>('/tienda/auth/me')
      .then(setCliente)
      .catch(() => localStorage.removeItem('cliente_token'))
      .finally(() => setCargando(false));
  }, []);

  // Igual que en lib/auth.tsx (panel de administración): si cualquier
  // petición recibe un 401 con code: 'AUTH_REQUIRED', cerramos la sesión del
  // cliente en memoria aunque ya estuviera navegando la tienda cuando el
  // token expiró. Cada página protegida (perfil, pedidos, etc.) ya redirige
  // a /tienda/login cuando `cliente` es null, así que esto basta para que
  // el cliente no se quede "adentro" con una sesión muerta.
  useEffect(() => {
    function onSesionExpirada() {
      setCliente((actual) => {
        if (actual) {
          toast({
            title: 'Tu sesión expiró',
            description: 'Vuelve a iniciar sesión para continuar.',
            variant: 'warning',
          });
        }
        return null;
      });
    }
    window.addEventListener(SESION_CLIENTE_EXPIRADA_EVENT, onSesionExpirada);
    return () => window.removeEventListener(SESION_CLIENTE_EXPIRADA_EVENT, onSesionExpirada);
  }, []);

  async function login(email: string, password: string, redirectTo = '/tienda') {
    const data = await apiTienda<{ token: string; cliente: Cliente }>('/tienda/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('cliente_token', data.token);
    setCliente(data.cliente);
    router.push(redirectTo);
  }

  async function registro(payload: RegistroPayload, redirectTo = '/tienda') {
    const data = await apiTienda<{ token: string; cliente: Cliente }>('/tienda/auth/registro', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    localStorage.setItem('cliente_token', data.token);
    setCliente(data.cliente);
    router.push(redirectTo);
  }

  function logout() {
    localStorage.removeItem('cliente_token');
    setCliente(null);
    router.push('/tienda/login');
  }

  return (
    <AuthClienteContext.Provider value={{ cliente, cargando, login, registro, logout, actualizarCliente: setCliente }}>
      {children}
    </AuthClienteContext.Provider>
  );
}

export function useAuthCliente() {
  const ctx = useContext(AuthClienteContext);
  if (!ctx) throw new Error('useAuthCliente debe usarse dentro de <AuthClienteProvider>');
  return ctx;
}
