'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Store, ShoppingCart, Users, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, puedeVer } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Kpi {
  titulo: string;
  valor: string;
  descripcion: string;
  icon: typeof Package;
  href: string;
  tono: 'primary' | 'success' | 'warning' | 'destructive';
}

export default function DashboardHome() {
  const { usuario } = useAuth();
  const rol = usuario?.rol;
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      const resultado: Kpi[] = [];

      try {
        const productos = await api<unknown[]>('/productos');
        resultado.push({
          titulo: 'Productos en catálogo',
          valor: String(productos.length),
          descripcion: 'Total de productos dados de alta',
          icon: Package,
          href: '/dashboard/productos',
          tono: 'primary',
        });
      } catch {
        /* si falla, simplemente no se muestra esa tarjeta */
      }

      try {
        const sucursales = await api<unknown[]>('/sucursales');
        resultado.push({
          titulo: 'Sucursales',
          valor: String(sucursales.length),
          descripcion: 'Puntos de venta activos',
          icon: Store,
          href: '/dashboard/sucursales',
          tono: 'success',
        });
      } catch {
        /* noop */
      }

      if (puedeVer('ventas', rol)) {
        try {
          const ventas = await api<{ total: string }[]>('/ventas');
          const suma = ventas.reduce((acc, v) => acc + Number(v.total || 0), 0);
          resultado.push({
            titulo: 'Ventas registradas',
            valor: String(ventas.length),
            descripcion: `$${suma.toLocaleString('es-MX', { minimumFractionDigits: 2 })} acumulado`,
            icon: ShoppingCart,
            href: '/dashboard/ventas',
            tono: 'primary',
          });
        } catch {
          /* noop */
        }
      }

      if (puedeVer('usuarios', rol)) {
        try {
          const usuarios = await api<{ activo: boolean }[]>('/usuarios');
          resultado.push({
            titulo: 'Usuarios activos',
            valor: String(usuarios.filter((u) => u.activo).length),
            descripcion: `${usuarios.length} en total`,
            icon: Users,
            href: '/dashboard/usuarios',
            tono: 'success',
          });
        } catch {
          /* noop */
        }
      }

      if (puedeVer('inventario', rol) && usuario?.sucursalId) {
        try {
          const existencias = await api<{ stockActual: number; stockMinimo: number }[]>(
            `/inventario/existencias?sucursalId=${usuario.sucursalId}`
          );
          const bajas = existencias.filter((e) => e.stockActual <= e.stockMinimo).length;
          resultado.push({
            titulo: 'Alertas de stock bajo',
            valor: String(bajas),
            descripcion: 'En tu sucursal asignada',
            icon: AlertTriangle,
            href: '/dashboard/inventario',
            tono: bajas > 0 ? 'destructive' : 'success',
          });
        } catch {
          /* noop */
        }
      }

      if (activo) setKpis(resultado);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [rol, usuario?.sucursalId]);

  const toneClasses: Record<Kpi['tono'], string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {usuario?.nombre?.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aquí tienes un vistazo general. Usa el menú de la izquierda para gestionar productos,
          inventario o ventas según tu rol.
        </p>
      </div>

      {kpis === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 h-24" />
            </Card>
          ))}
        </div>
      ) : kpis.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No hay datos disponibles todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Link key={kpi.titulo} href={kpi.href}>
              <Card className="hover:shadow-card hover:border-primary/30 transition-all group h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.titulo}</CardTitle>
                  <div className={`p-2 rounded-lg ${toneClasses[kpi.tono]} group-hover:scale-105 transition-transform`}>
                    <kpi.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{kpi.valor}</div>
                  <div className="text-xs text-muted-foreground mt-1">{kpi.descripcion}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {puedeVer('productos', rol) && (
            <Link href="/dashboard/productos">
              <Button variant="secondary" size="sm">
                Productos <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
          {puedeVer('ventas', rol) && (
            <Link href="/dashboard/ventas">
              <Button variant="secondary" size="sm">
                Registrar venta <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
          {puedeVer('inventario', rol) && (
            <Link href="/dashboard/inventario">
              <Button variant="secondary" size="sm">
                Ver existencias <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
