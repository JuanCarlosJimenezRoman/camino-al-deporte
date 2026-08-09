'use client';

import { useAuth } from '@/lib/auth';

export default function DashboardHome() {
  const { usuario } = useAuth();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Hola, {usuario?.nombre}</h1>
      <p style={{ color: 'var(--color-muted)' }}>
        Usa el menú de la izquierda para gestionar productos, inventario o ventas según tu rol.
      </p>
    </div>
  );
}
