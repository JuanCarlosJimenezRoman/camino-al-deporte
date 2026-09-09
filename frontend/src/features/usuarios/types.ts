export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  sucursalId: number | null;
  sucursal: string | null;
}

export interface Sucursal {
  id: number;
  nombre: string;
}

export interface EdicionUsuario {
  nombre: string;
  email: string;
  rol: string;
  sucursalId: string;
}

export interface NuevoUsuarioInput {
  nombre: string;
  email: string;
  password: string;
  rol: string;
  sucursalId?: number;
}

export interface ActualizarUsuarioInput {
  nombre?: string;
  email?: string;
  rol?: string;
  sucursalId?: number | null;
  activo?: boolean;
  password?: string;
}
