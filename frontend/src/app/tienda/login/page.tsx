'use client';

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { ApiError } from '@/lib/apiTienda';

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
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 340 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Inicia sesión</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 14, marginBottom: 20 }}>
          Para hacer pedidos y ver tu historial
        </p>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
        <div style={{ marginBottom: 12, marginTop: 4 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Contraseña</label>
        <div style={{ marginBottom: 16, marginTop: 4 }}>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button type="submit" className="btn" style={{ width: '100%', marginBottom: 12 }} disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>

        <p style={{ fontSize: 13, textAlign: 'center' }}>
          ¿No tienes cuenta?{' '}
          <Link href={`/tienda/registro?siguiente=${encodeURIComponent(siguiente)}`} style={{ color: 'var(--color-primary-dark)' }}>
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}
