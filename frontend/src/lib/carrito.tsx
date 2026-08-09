'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ItemCarrito {
  varianteId: number;
  productoId: number;
  nombre: string;
  talla?: string | null;
  color?: string | null;
  sku: string;
  precioVenta: number;
  imagenUrl?: string | null;
  stockDisponible: number;
  cantidad: number;
}

interface CarritoContextValue {
  items: ItemCarrito[];
  agregar: (item: Omit<ItemCarrito, 'cantidad'>, cantidad?: number) => void;
  actualizarCantidad: (varianteId: number, cantidad: number) => void;
  quitar: (varianteId: number) => void;
  vaciar: () => void;
  total: number;
  totalItems: number;
}

const CarritoContext = createContext<CarritoContextValue | undefined>(undefined);
const STORAGE_KEY = 'carrito_tienda';

export function CarritoProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // Carrito corrupto o inaccesible: arrancamos vacío, no rompemos la página.
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, cargado]);

  function agregar(item: Omit<ItemCarrito, 'cantidad'>, cantidad = 1) {
    setItems((prev) => {
      const existente = prev.find((i) => i.varianteId === item.varianteId);
      if (existente) {
        const nuevaCantidad = Math.min(existente.cantidad + cantidad, item.stockDisponible);
        return prev.map((i) => (i.varianteId === item.varianteId ? { ...i, cantidad: nuevaCantidad } : i));
      }
      return [...prev, { ...item, cantidad: Math.min(cantidad, item.stockDisponible) }];
    });
  }

  function actualizarCantidad(varianteId: number, cantidad: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.varianteId === varianteId ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.stockDisponible)) } : i
      )
    );
  }

  function quitar(varianteId: number) {
    setItems((prev) => prev.filter((i) => i.varianteId !== varianteId));
  }

  function vaciar() {
    setItems([]);
  }

  const total = items.reduce((acc, i) => acc + i.precioVenta * i.cantidad, 0);
  const totalItems = items.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <CarritoContext.Provider value={{ items, agregar, actualizarCantidad, quitar, vaciar, total, totalItems }}>
      {children}
    </CarritoContext.Provider>
  );
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
}
