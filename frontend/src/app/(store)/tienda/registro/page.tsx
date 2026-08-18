'use client';

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/store/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function TiendaRegistroPage() {
  return (
    <Suspense fallback={null}>
      <TiendaRegistroForm />
    </Suspense>
  );
}

function TiendaRegistroForm() {
  const { registro } = useAuthCliente();
  const searchParams = useSearchParams();
  const siguiente = searchParams.get('siguiente') || '/tienda';

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await registro({ nombre, telefono, email, password }, siguiente);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Crea tu cuenta</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">Para hacer pedidos y ver tu historial</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClase}>Nombre completo</label>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" className={campoClase} />
        </div>

        <div>
          <label className={labelClase}>Teléfono</label>
          <input
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="10 dígitos"
            className={campoClase}
          />
        </div>

        <div>
          <label className={labelClase}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={campoClase}
          />
        </div>

        <div>
          <label className={labelClase}>Contraseña</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className={campoClase}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
          {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link
          href={`/tienda/login?siguiente=${encodeURIComponent(siguiente)}`}
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
