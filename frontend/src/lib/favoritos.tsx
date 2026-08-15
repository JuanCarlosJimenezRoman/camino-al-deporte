'use client';

// Favoritos de la tienda en línea: a diferencia del carrito (que vive en el
// navegador sin cuenta), la lista de favoritos es personal y vive en el
// backend (ver routes/tienda/favoritos.js) — solo tiene sentido si el
// cliente tiene sesión iniciada. Este contexto solo guarda los IDs de
// producto marcados (para pintar el corazón lleno en cualquier tarjeta), la
// lista completa de productos favoritos se pide aparte en /tienda/favoritos.

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthCliente } from './authCliente';
import { apiTienda } from './apiTienda';

interface FavoritosContextValue {
  ids: Set<number>;
  cargando: boolean;
  esFavorito: (productoId: number) => boolean;
  alternar: (productoId: number) => Promise<void>;
}

const FavoritosContext = createContext<FavoritosContextValue | undefined>(undefined);

export function FavoritosProvider({ children }: { children: ReactNode }) {
  const { cliente } = useAuthCliente();
  const router = useRouter();
  const pathname = usePathname();

  const [ids, setIds] = useState<Set<number>>(new Set());
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!cliente) {
      setIds(new Set());
      return;
    }
    setCargando(true);
    apiTienda<number[]>('/tienda/favoritos/ids')
      .then((data) => setIds(new Set(data)))
      .catch(() => setIds(new Set()))
      .finally(() => setCargando(false));
  }, [cliente]);

  const esFavorito = useCallback((productoId: number) => ids.has(productoId), [ids]);

  const alternar = useCallback(
    async (productoId: number) => {
      if (!cliente) {
        router.push(`/tienda/login?siguiente=${encodeURIComponent(pathname || '/tienda')}`);
        return;
      }
      const yaEsFavorito = ids.has(productoId);
      // Optimista: se actualiza la vista de inmediato y, si la petición
      // falla, se revierte — el corazón no debe sentirse lento.
      setIds((prev) => {
        const siguiente = new Set(prev);
        if (yaEsFavorito) siguiente.delete(productoId);
        else siguiente.add(productoId);
        return siguiente;
      });
      try {
        if (yaEsFavorito) {
          await apiTienda(`/tienda/favoritos/${productoId}`, { method: 'DELETE' });
        } else {
          await apiTienda(`/tienda/favoritos/${productoId}`, { method: 'POST' });
        }
      } catch {
        setIds((prev) => {
          const siguiente = new Set(prev);
          if (yaEsFavorito) siguiente.add(productoId);
          else siguiente.delete(productoId);
          return siguiente;
        });
      }
    },
    [cliente, ids, router, pathname]
  );

  return (
    <FavoritosContext.Provider value={{ ids, cargando, esFavorito, alternar }}>{children}</FavoritosContext.Provider>
  );
}

export function useFavoritos() {
  const ctx = useContext(FavoritosContext);
  if (!ctx) throw new Error('useFavoritos debe usarse dentro de <FavoritosProvider>');
  return ctx;
}
