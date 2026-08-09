'use client';

import { Suspense, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthCliente } from '@/lib/authCliente';
import { ApiError } from '@/lib/apiTienda';

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
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Crea tu cuenta</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 14, marginBottom: 20 }}>
          Para hacer pedidos y ver tu historial
        </p>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Nombre completo</label>
        <div style={{ marginBottom: 12, marginTop: 4 }}>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Teléfono</label>
        <div style={{ marginBottom: 12, marginTop: 4 }}>
          <input required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="10 dígitos" />
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
        <div style={{ marginBottom: 12, marginTop: 4 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>Contraseña</label>
        <div style={{ marginBottom: 16, marginTop: 4 }}>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button type="submit" className="btn" style={{ width: '100%', marginBottom: 12 }} disabled={enviando}>
          {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>

        <p style={{ fontSize: 13, textAlign: 'center' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href={`/tienda/login?siguiente=${encodeURIComponent(siguiente)}`} style={{ color: 'var(--color-primary-dark)' }}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
