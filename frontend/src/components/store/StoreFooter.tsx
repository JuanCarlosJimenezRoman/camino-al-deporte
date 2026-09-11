import Link from 'next/link';
import { Truck, ShieldCheck, MapPin } from 'lucide-react';

// Beneficios/confianza (sección 8 y 70 del brief) — mismas afirmaciones que
// la barra de confianza del header, sin inventar nada nuevo (envíos,
// apartados y sucursales son capacidades reales del negocio).
const BENEFICIOS = [
  { icon: Truck, titulo: 'Envíos a todo México', texto: 'Recibe tu pedido donde estés.' },
  { icon: ShieldCheck, titulo: 'Compra segura', texto: 'Tu pago se confirma directo con nosotros.' },
  { icon: MapPin, titulo: 'Sucursales físicas', texto: 'Visítanos y conoce el producto en persona.' },
];

export function BenefitsSection() {
  return (
    <div className="border-t border-border py-10">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {BENEFICIOS.map((b) => (
          <div key={b.titulo} className="group flex flex-col items-start gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-bronze ring-1 ring-gold/30 transition group-hover:bg-gold group-hover:text-ink">
              <b.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p className="text-sm font-semibold leading-tight">{b.titulo}</p>
            <p className="text-xs text-muted-foreground">{b.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Footer "deportivo premium": superficie tinta (#0D0D0D) con acentos dorados,
// para cerrar la tienda con la marca en primer plano en vez de un pie gris
// discreto.
export function StoreFooter() {
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="h-[3px] w-full bg-gradient-to-r from-gold via-bronze to-gold" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="h-8 w-8 rounded-full ring-1 ring-white/15" />
              <span className="text-sm font-extrabold uppercase tracking-tight text-white">Camino al Deporte</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-white/60">
              Tenis y artículos deportivos, con tienda en línea y sucursales físicas.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
              Hecho para el deporte
            </p>
          </div>

          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">Comprar</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/tienda" className="text-white/70 transition-colors hover:text-gold">
                  Tienda
                </Link>
              </li>
              <li>
                <Link href="/tienda/productos" className="text-white/70 transition-colors hover:text-gold">
                  Catálogo
                </Link>
              </li>
              <li>
                <Link href="/tienda/favoritos" className="text-white/70 transition-colors hover:text-gold">
                  Favoritos
                </Link>
              </li>
              <li>
                <Link href="/tienda#marcas" className="text-white/70 transition-colors hover:text-gold">
                  Marcas
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">Cuenta</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/tienda/login" className="text-white/70 transition-colors hover:text-gold">
                  Iniciar sesión
                </Link>
              </li>
              <li>
                <Link href="/tienda/registro" className="text-white/70 transition-colors hover:text-gold">
                  Crear cuenta
                </Link>
              </li>
              <li>
                <Link href="/tienda/perfil" className="text-white/70 transition-colors hover:text-gold">
                  Mi perfil
                </Link>
              </li>
              <li>
                <Link href="/tienda/pedidos" className="text-white/70 transition-colors hover:text-gold">
                  Mis pedidos
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-1">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">Confianza</p>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-gold" strokeWidth={1.75} /> Envíos a todo México
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-gold" strokeWidth={1.75} /> Compra segura
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold" strokeWidth={1.75} /> Sucursales físicas
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Camino al Deporte.</p>
          <p>Envíos a todo México · Compra segura</p>
        </div>
      </div>
    </footer>
  );
}
