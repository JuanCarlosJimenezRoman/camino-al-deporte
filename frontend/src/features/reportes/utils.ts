// Lógica de negocio pura del dominio Reportes.
// Sin React, sin acceso a UI, sin fetch. Todo lo que se pueda probar
// con un input y un output vive aquí.

import type { PresetRango, RangoFechas } from './types';

export function money(n: number): string {
  return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyCompacto(n: number): string {
  const abs = Math.abs(n || 0);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return money(n);
}

export function formatFechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function menosDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function calcularPreset(preset: PresetRango): RangoFechas {
  const hasta = hoyISO();
  switch (preset) {
    case 'hoy':
      return { desde: hasta, hasta };
    case '7d':
      return { desde: menosDias(6), hasta };
    case '30d':
      return { desde: menosDias(29), hasta };
    case 'mes': {
      const ahora = new Date();
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: inicio.toISOString().slice(0, 10), hasta };
    }
    case 'mesPasado': {
      const ahora = new Date();
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
    }
    default:
      // 'personalizado' no pasa por aquí (los inputs de fecha manejan su
      // propio valor); este caso solo existe para que el switch compile.
      return { desde: menosDias(29), hasta };
  }
}
