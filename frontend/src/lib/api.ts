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
  return localStorage.getItem('token');
}

export async function api<T = unknown>(
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

// Para subir archivos (multipart/form-data). No se pone Content-Type a mano:
// el navegador arma el boundary correcto solo cuando el body es un FormData.
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
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

// Para descargar archivos generados por el backend (plantillas, exportes).
// El navegador no manda el header Authorization en un <a href> normal, así
// que se pide como blob y se dispara la descarga a mano.
export async function apiDownload(path: string, nombreArchivo: string): Promise<void> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Error ${res.status}`, res.status);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
