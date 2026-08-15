'use client';

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/tienda/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function RestablecerPasswordPage() {
  return (
    <Suspense fallback={null}>
      <RestablecerForm />
    </Suspense>
  );
}

function RestablecerForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva !== passwordConfirmar) {
      setError('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      await apiTienda('/tienda/auth/restablecer', {
        method: 'POST',
        body: JSON.stringify({ token, passwordNueva }),
      });
      setListo(true);
      setTimeout(() => router.push('/tienda/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer tu contraseña.');
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight">Enlace inválido</h1>
        <p className="mb-8 mt-1 text-sm text-muted-foreground">
          Falta el código de restablecimiento. Solicita un nuevo enlace.
        </p>
        <Link href="/tienda/recuperar" className="text-sm font-semibold text-foreground underline underline-offset-4">
          Solicitar enlace
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Nueva contraseña</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">Crea una contraseña nueva para tu cuenta.</p>

      {listo ? (
        <p className="rounded-lg border border-border bg-secondary/50 p-4 text-sm">
          Tu contraseña se actualizó correctamente. Te llevamos a iniciar sesión...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClase}>Nueva contraseña</label>
            <input
              required
              type="password"
              minLength={6}
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              placeholder="••••••••"
              className={campoClase}
            />
          </div>
          <div>
            <label className={labelClase}>Confirmar nueva contraseña</label>
            <input
              required
              type="password"
              minLength={6}
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
              placeholder="••••••••"
              className={campoClase}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
            {enviando ? 'Guardando...' : 'Restablecer contraseña'}
          </button>
        </form>
      )}
    </div>
  );
}
