import Link from 'next/link';
import { ConteoNombre } from '@/lib/catalogo';
import { claseOjo, claseTituloSeccion } from './ui';

// "Las marcas que buscas" (sección 19): el catálogo no guarda logotipos de
// marca, así que se usa tipografía elegante en vez de inventar/descargar
// íconos que no están en el sistema (ver sección 68).
export function BrandsSection({ marcas }: { marcas: ConteoNombre[] }) {
  if (marcas.length === 0) return null;

  return (
    <section id="marcas" className="border-t border-border py-10 sm:py-12">
      <p className={claseOjo}>Marcas</p>
      <h2 className={`mt-1 ${claseTituloSeccion}`}>Las marcas que buscas</h2>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {marcas.map((m) => (
          <Link
            key={m.nombre}
            href={`/tienda?marca=${encodeURIComponent(m.nombre)}#catalogo`}
            className="group flex flex-col items-start justify-center gap-1 rounded-2xl border border-border px-5 py-6 transition-colors hover:border-foreground"
          >
            <span className="text-lg font-extrabold uppercase tracking-tight transition-colors group-hover:text-primary sm:text-xl">
              {m.nombre}
            </span>
            <span className="text-xs text-muted-foreground">
              {m.cantidad} {m.cantidad === 1 ? 'modelo' : 'modelos'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
