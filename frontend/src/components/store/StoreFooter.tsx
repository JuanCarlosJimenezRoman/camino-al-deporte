import Link from 'next/link';
import { Truck, ShieldCheck, CalendarClock, MapPin } from 'lucide-react';

// Beneficios/confianza (sección 8 y 70 del brief) — mismas afirmaciones que
// la barra de confianza del header, sin inventar nada nuevo (envíos,
// apartados y sucursales son capacidades reales del negocio).
const BENEFICIOS = [
  { icon: Truck, titulo: 'Envíos a todo México', texto: 'Recibe tu pedido donde estés.' },
  { icon: ShieldCheck, titulo: 'Compra segura', texto: 'Tu pago se confirma directo con nosotros.' },
  //{ icon: CalendarClock, titulo: 'Apartados disponibles', texto: 'Aparta en sucursal y paga después.' },
  { icon: MapPin, titulo: 'Sucursales físicas', texto: 'Visítanos y conoce el producto en persona.' },
];

export function BenefitsSection() {
  return (
    <div className="border-t border-border py-10">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {BENEFICIOS.map((b) => (
          <div key={b.titulo} className="flex flex-col items-start gap-2">
            <b.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
            <p className="text-sm font-semibold leading-tight">{b.titulo}</p>
            <p className="text-xs text-muted-foreground">{b.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreFooter() {
  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="h-7 w-7 rounded-full ring-1 ring-border" />
              <span className="text-sm font-extrabold uppercase tracking-tight">Camino al Deporte</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Tenis y artículos deportivos, con tienda en línea y sucursales físicas.
            </p>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comprar</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/tienda" className="text-foreground/80 hover:text-foreground">
                  Tienda
                </Link>
              </li>
              <li>
                <Link href="/tienda/favoritos" className="text-foreground/80 hover:text-foreground">
                  Favoritos
                </Link>
              </li>
              <li>
                <Link href="/tienda/pedidos" className="text-foreground/80 hover:text-foreground">
                  Mis pedidos
                </Link>
              </li>
              <li>
                <Link href="/tienda#marcas" className="text-foreground/80 hover:text-foreground">
                  Marcas
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuenta</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/tienda/login" className="text-foreground/80 hover:text-foreground">
                  Iniciar sesión
                </Link>
              </li>
              <li>
                <Link href="/tienda/registro" className="text-foreground/80 hover:text-foreground">
                  Crear cuenta
                </Link>
              </li>
              <li>
                <Link href="/tienda/perfil" className="text-foreground/80 hover:text-foreground">
                  Mi perfil
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Camino al Deporte.</p>
          <p>Envíos a todo México · Compra segura</p>
        </div>
      </div>
    </footer>
  );
}
