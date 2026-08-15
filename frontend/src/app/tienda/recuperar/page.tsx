'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/tienda/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const data = await apiTienda<{ mensaje: string }>('/tienda/auth/olvide-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setEnviado(true);
      void data;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar tu solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Recuperar contraseña</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">
        Te mandamos un enlace por WhatsApp, al teléfono registrado en tu cuenta, para que puedas crear una contraseña nueva.
      </p>

      {enviado ? (
        <div className="space-y-6">
          <p className="rounded-lg border border-border bg-secondary/50 p-4 text-sm">
            Si el correo está registrado, en unos momentos te llegará un mensaje de WhatsApp con instrucciones para restablecer tu contraseña. El enlace es válido por 30 minutos.
          </p>
          <Link href="/tienda/login" className="text-sm font-semibold text-foreground underline underline-offset-4">
            Volver a iniciar sesión
          </Link>
        </div>
      ) : (
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button type="submit" className={`${claseBotonPrimario} w-full`} disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar enlace'}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/tienda/login" className="font-semibold text-foreground underline underline-offset-4">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
