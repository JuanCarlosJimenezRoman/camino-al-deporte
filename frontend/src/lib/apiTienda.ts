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
    throw new ApiError(body.error || `Error ${res.status}`, res.status);
  }

  return res.json();
}
