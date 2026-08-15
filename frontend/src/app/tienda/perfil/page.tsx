'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthCliente, Cliente } from '@/lib/authCliente';
import { apiTienda, ApiError } from '@/lib/apiTienda';
import { claseBotonPrimario } from '@/components/tienda/ui';

const campoClase = 'w-full rounded-lg border border-border bg-input px-3.5 py-3 text-sm outline-none focus:border-foreground';
const labelClase = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function PerfilPage() {
  const { cliente, cargando, actualizarCliente } = useAuthCliente();
  const router = useRouter();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [mensajeDatos, setMensajeDatos] = useState<string | null>(null);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [mensajePassword, setMensajePassword] = useState<string | null>(null);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);

  useEffect(() => {
    if (cargando) return;
    if (!cliente) {
      router.replace('/tienda/login?siguiente=/tienda/perfil');
      return;
    }
    setNombre(cliente.nombre);
    setTelefono(cliente.telefono);
    setEmail(cliente.email || '');
  }, [cargando, cliente, router]);

  if (cargando || !cliente) return null;

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    setErrorDatos(null);
    setMensajeDatos(null);
    setGuardandoDatos(true);
    try {
      const actualizado = await apiTienda<Cliente>('/tienda/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ nombre, telefono, email }),
      });
      actualizarCliente(actualizado);
      setMensajeDatos('Tus datos se guardaron correctamente.');
    } catch (err) {
      setErrorDatos(err instanceof ApiError ? err.message : 'No se pudieron guardar tus datos.');
    } finally {
      setGuardandoDatos(false);
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setErrorPassword(null);
    setMensajePassword(null);
    if (passwordNueva !== passwordConfirmar) {
      setErrorPassword('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    setGuardandoPassword(true);
    try {
      await apiTienda('/tienda/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ passwordActual, passwordNueva }),
      });
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordConfirmar('');
      setMensajePassword('Tu contraseña se actualizó correctamente.');
    } catch (err) {
      setErrorPassword(err instanceof ApiError ? err.message : 'No se pudo cambiar tu contraseña.');
    } finally {
      setGuardandoPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-8 text-2xl font-extrabold uppercase tracking-tight">Mi perfil</h1>

      <form onSubmit={guardarDatos} className="mb-12 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide">Mis datos</h2>

        <div>
          <label className={labelClase}>Nombre</label>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={campoClase} />
        </div>
        <div>
          <label className={labelClase}>Teléfono</label>
          <input required value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campoClase} />
        </div>
        <div>
          <label className={labelClase}>Correo electrónico</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={campoClase}
          />
        </div>

        {errorDatos && <p className="text-sm text-destructive">{errorDatos}</p>}
        {mensajeDatos && <p className="text-sm text-primary">{mensajeDatos}</p>}

        <button type="submit" className={`${claseBotonPrimario} w-full sm:w-auto`} disabled={guardandoDatos}>
          {guardandoDatos ? 'Guardando...' : 'Guardar datos'}
        </button>
      </form>

      <form onSubmit={cambiarPassword} className="space-y-4 border-t border-border pt-8">
        <h2 className="text-sm font-bold uppercase tracking-wide">Cambiar contraseña</h2>

        <div>
          <label className={labelClase}>Contraseña actual</label>
          <input
            required
            type="password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
            className={campoClase}
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
            className={campoClase}
          />
        </div>

        {errorPassword && <p className="text-sm text-destructive">{errorPassword}</p>}
        {mensajePassword && <p className="text-sm text-primary">{mensajePassword}</p>}

        <button type="submit" className={`${claseBotonPrimario} w-full sm:w-auto`} disabled={guardandoPassword}>
          {guardandoPassword ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  );
}
