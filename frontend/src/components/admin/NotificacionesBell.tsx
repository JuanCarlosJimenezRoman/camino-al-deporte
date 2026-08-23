'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatearFechaHora } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface Notificacion {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  createdAt: string;
  transferencia: {
    id: number;
    folio: string;
    estado: string;
    sucursalOrigen: { nombre: string };
    sucursalDestino: { nombre: string };
  } | null;
}

// Campanita de notificaciones dentro del sistema. Además de esto, algunos
// eventos también mandan correo cuando está configurado (ver
// config/email.js) — el bajo stock es el primero que lo hace (ver
// utils/bajoStock.js), pero esta campanita muestra CUALQUIER tipo de
// notificación de forma genérica (transferencias, apartados de otra
// sucursal, bajo stock, y lo que se agregue a futuro) sin necesitar cambios
// aquí — ver docs/ARQUITECTURA.md.
export function NotificacionesBell() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    try {
      const data = await api<Notificacion[]>('/notificaciones?soloNoLeidas=true');
      setNotificaciones(data);
    } catch (err) {
      // Si falla (ej. token vencido a media sesión) simplemente no se
      // actualiza — no vale la pena molestar al usuario por esto.
      if (!(err instanceof ApiError)) console.error(err);
    }
  }

  useEffect(() => {
    cargar();
    // Revisa cada 60s por si llega algo nuevo mientras la pestaña sigue
    // abierta — no hay websockets/push en este proyecto todavía.
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, []);

  async function marcarLeida(id: number) {
    setNotificaciones((prev) => prev.filter((n) => n.id !== id));
    try {
      await api(`/notificaciones/${id}/leida`, { method: 'PUT' });
    } catch {
      cargar();
    }
  }

  async function marcarTodasLeidas() {
    setCargando(true);
    const previas = notificaciones;
    setNotificaciones([]);
    try {
      await api('/notificaciones/leer-todas', { method: 'PUT' });
    } catch {
      setNotificaciones(previas);
    } finally {
      setCargando(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          {notificaciones.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {notificaciones.length > 9 ? '9+' : notificaciones.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {notificaciones.length > 0 && (
            <button
              onClick={marcarTodasLeidas}
              disabled={cargando}
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              Marcar todas leídas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notificaciones.length === 0 ? (
          <div className="px-2.5 py-4 text-center text-sm text-muted-foreground">Sin notificaciones nuevas.</div>
        ) : (
          notificaciones.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => marcarLeida(n.id)}
              className="flex-col items-start gap-0.5 whitespace-normal"
            >
              <span className="text-sm font-medium">{n.titulo}</span>
              <span className="text-xs text-muted-foreground">{n.mensaje}</span>
              <span className="text-[11px] text-muted-foreground/70">
                {formatearFechaHora(n.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
