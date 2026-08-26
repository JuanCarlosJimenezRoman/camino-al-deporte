// Igual que lib/api.ts pero para la sesión de clientes de la tienda en
// línea: usa su propio token en localStorage ('cliente_token') para no
// mezclarse con la sesión de empleados ('token'). Un cliente y un empleado
// pueden estar conectados al mismo tiempo en el mismo navegador (por
// ejemplo, un vendedor probando la tienda) sin pisarse.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cliente_token');
}

// Igual que SESION_EXPIRADA_EVENT en lib/api.ts, pero para la sesión de
// clientes de la tienda en línea: se dispara cuando el backend responde 401
// con code: 'AUTH_REQUIRED' (ver middleware/authCliente.js). AuthClienteProvider
// (lib/authCliente.tsx) escucha este evento para cerrar la sesión en memoria,
// lo que a su vez hace que cada página protegida (perfil, pedidos, etc.)
// redirija a /tienda/login en vez de dejar al cliente viendo el error sin
// que nada lo desconecte.
export const SESION_CLIENTE_EXPIRADA_EVENT = 'sesion-cliente-expirada';

function manejarPosibleSesionExpirada(status: number, body: any) {
  if (typeof window === 'undefined') return;
  if (status === 401 && body?.code === 'AUTH_REQUIRED') {
    localStorage.removeItem('cliente_token');
    window.dispatchEvent(new Event(SESION_CLIENTE_EXPIRADA_EVENT));
  }
}

export async function apiTienda<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    manejarPosibleSesionExpirada(res.status, body);
    throw new ApiError(body.error || `Error ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Para subir archivos (comprobante de pago).
export async function apiTiendaUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    manejarPosibleSesionExpirada(res.status, body);
    throw new ApiError(body.error || `Error ${res.status}`, res.status);
  }

  return res.json();
}
