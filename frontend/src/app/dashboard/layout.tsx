'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, puedeVer } from '@/lib/auth';
import { NavItem } from '@/components/NavItem';

const ROL_LABEL: Record<string, string> = {
  ADMIN_PRINCIPAL: 'Administrador Principal',
  DESARROLLO: 'Desarrollo',
  INVENTARIO: 'Inventario',
  VENTAS: 'Ventas',
  CONSULTA: 'Consulta',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login');
  }, [cargando, usuario, router]);

  if (cargando || !usuario) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          background: 'var(--color-panel)',
          borderRight: '1px solid var(--color-border)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Camino al Deporte</div>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {ROL_LABEL[usuario.rol] || usuario.rol}
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          {puedeVer('productos', usuario.rol) && (
            <NavItem href="/dashboard/productos">Productos</NavItem>
          )}
          {puedeVer('catalogos', usuario.rol) && (
            <NavItem href="/dashboard/catalogos">Catálogos</NavItem>
          )}
          {puedeVer('inventario', usuario.rol) && (
            <NavItem href="/dashboard/inventario">Inventario</NavItem>
          )}
          {puedeVer('sucursales', usuario.rol) && (
            <NavItem href="/dashboard/sucursales">Sucursales</NavItem>
          )}
          {puedeVer('transferencias', usuario.rol) && (
            <NavItem href="/dashboard/transferencias">Transferencias</NavItem>
          )}
          {puedeVer('ventas', usuario.rol) && <NavItem href="/dashboard/ventas">Ventas</NavItem>}
          {puedeVer('apartados', usuario.rol) && (
            <NavItem href="/dashboard/apartados">Apartados</NavItem>
          )}
          {puedeVer('usuarios', usuario.rol) && (
            <NavItem href="/dashboard/usuarios">Usuarios</NavItem>
          )}
        </nav>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{usuario.nombre}</div>
          <button className="btn-secondary btn" onClick={logout} style={{ width: '100%' }}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
