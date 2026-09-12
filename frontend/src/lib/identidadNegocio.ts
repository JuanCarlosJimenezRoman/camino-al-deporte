// Identidad de marca (white-label) para usarse desde el SERVER (metadata,
// manifest): nombre, iniciales y logo del negocio, leídos del mismo
// endpoint público que usa ConfigNegocioProvider en el cliente
// (lib/configNegocio.tsx). No se puede reusar ese provider aquí porque
// generateMetadata()/los manifest route handlers corren en el servidor,
// sin React ni contexto — de ahí este helper aparte con su propio fetch.
//
// revalidate corto (60s): es lo primero que se nota desactualizado si
// alguien cambia el nombre en /dashboard/configuracion y el <title> o el
// manifest del PWA siguen mostrando el anterior.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface IdentidadNegocio {
  nombre: string;
  iniciales: string;
  logoUrl: string | null;
}

const DEFAULTS: IdentidadNegocio = { nombre: 'Camino al Deporte', iniciales: 'CD', logoUrl: null };

export async function obtenerIdentidadNegocio(): Promise<IdentidadNegocio> {
  try {
    const res = await fetch(`${API_URL}/configuracion-tienda/publica`, { next: { revalidate: 60 } });
    if (!res.ok) return DEFAULTS;
    const data: { nombreNegocio?: string; iniciales?: string; logoTicketUrl?: string | null } = await res.json();
    return {
      nombre: data.nombreNegocio || DEFAULTS.nombre,
      iniciales: data.iniciales || DEFAULTS.iniciales,
      logoUrl: data.logoTicketUrl || null,
    };
  } catch {
    return DEFAULTS;
  }
}
