'use client';

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/store/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function TiendaLoginPage() {
  return (
    <Suspense fallback={null}>
      <TiendaLoginForm />
    </Suspense>
  );
}

function TiendaLoginForm() {
  const { login } = useAuthCliente();
  const searchParams = useSearchParams();
  const siguiente = searchParams.get('siguiente') || '/tienda';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password, siguiente);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Inicia sesión</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">Para hacer pedidos y ver tu historial</p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelClase}>Contraseña</label>
            <Link href="/tienda/recuperar" className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={campoClase}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link
          href={`/tienda/registro?siguiente=${encodeURIComponent(siguiente)}`}
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Regístrate
        </Link>
      </p>
    </div>
  );
}
