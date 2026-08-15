'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/tienda/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

// Flujo en dos pasos, en la misma página: primero pide el correo y manda el
// código por WhatsApp, luego captura el código y la contraseña nueva. Va
// todo en una sola pantalla, a diferencia del link que se usaba antes,
// porque el código de la plantilla AUTHENTICATION de Meta no se puede
// mandar dentro de un link — el cliente lo copia de WhatsApp y lo teclea
// aquí.
export default function RecuperarPasswordPage() {
  const router = useRouter();

  const [paso, setPaso] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeEnvio, setMensajeEnvio] = useState<string | null>(null);

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const data = await apiTienda<{ mensaje: string }>('/tienda/auth/olvide-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMensajeEnvio(data.mensaje);
      setPaso('codigo');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar tu solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  async function restablecer(e: FormEvent) {
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
        body: JSON.stringify({ email, codigo, passwordNueva }),
      });
      setListo(true);
      setTimeout(() => router.push('/tienda/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer tu contraseña.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Recuperar contraseña</h1>

      {listo ? (
        <>
          <p className="mb-8 mt-1 text-sm text-muted-foreground">Tu contraseña se actualizó correctamente.</p>
          <p className="rounded-lg border border-border bg-secondary/50 p-4 text-sm">
            Te llevamos a iniciar sesión...
          </p>
        </>
      ) : paso === 'email' ? (
        <>
          <p className="mb-8 mt-1 text-sm text-muted-foreground">
            Te mandamos un código de 6 dígitos por WhatsApp, al teléfono registrado en tu cuenta.
          </p>
          <form onSubmit={pedirCodigo} className="space-y-4">
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar código'}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/tienda/login" className="font-semibold text-foreground underline underline-offset-4">
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        </>
      ) : (
        <>
          <p className="mb-8 mt-1 text-sm text-muted-foreground">{mensajeEnvio}</p>
          <form onSubmit={restablecer} className="space-y-4">
            <div>
              <label className={labelClase}>Código de 6 dígitos</label>
              <input
                required
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className={`${campoClase} text-center text-lg font-bold tracking-[0.4em]`}
              />
            </div>
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

            <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando || codigo.length !== 6}>
              {enviando ? 'Guardando...' : 'Restablecer contraseña'}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              ¿No te llegó el código?{' '}
              <button
                type="button"
                onClick={() => setPaso('email')}
                className="font-semibold text-foreground underline underline-offset-4"
              >
                Solicitar otro
              </button>
            </p>
          </form>
        </>
      )}
    </div>
  );
}
