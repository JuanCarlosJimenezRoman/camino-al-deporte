'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { actualizarUsuario, crearUsuario, listarSucursales, listarUsuarios } from '../api';
import type { EdicionUsuario, NuevoUsuarioInput, Sucursal, Usuario } from '../types';

const EDICION_VACIA: EdicionUsuario = { nombre: '', email: '', rol: 'CONSULTA', sucursalId: '' };

// Orquesta la pantalla de Usuarios: carga usuarios/sucursales, y expone las
// acciones (crear, editar, activar/desactivar, restablecer contraseña) para
// que la página y sus componentes de UI no necesiten saber nada de la API.
export function useUsuarios() {
  const { usuario: yo } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicionState] = useState<EdicionUsuario>(EDICION_VACIA);

  async function cargar() {
    const [u, s] = await Promise.all([listarUsuarios(), listarSucursales()]);
    setUsuarios(u);
    setSucursales(s);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(data: NuevoUsuarioInput) {
    try {
      await crearUsuario(data);
      setMensaje('Usuario creado.');
      await cargar();
      return true;
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al crear usuario.');
      return false;
    }
  }

  function abrirEdicion(u: Usuario) {
    setEditandoId(u.id);
    setEdicionState({
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      sucursalId: u.sucursalId ? String(u.sucursalId) : '',
    });
  }

  function cancelarEdicion() {
    setEditandoId(null);
  }

  function setEdicion(patch: Partial<EdicionUsuario>) {
    setEdicionState((prev) => ({ ...prev, ...patch }));
  }

  async function guardarEdicion(id: number) {
    if (!edicion.nombre.trim()) {
      setMensaje('El nombre no puede estar vacío.');
      return;
    }
    try {
      await actualizarUsuario(id, {
        nombre: edicion.nombre,
        email: edicion.email,
        rol: edicion.rol,
        sucursalId: edicion.sucursalId ? Number(edicion.sucursalId) : null,
      });
      setEditandoId(null);
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al editar el usuario.');
    }
  }

  async function toggleActivo(u: Usuario) {
    if (u.id === yo?.id) {
      setMensaje('No puedes desactivar tu propia cuenta.');
      return;
    }
    const accion = u.activo ? 'quitarle el acceso a' : 'reactivar a';
    if (!window.confirm(`¿Seguro que quieres ${accion} ${u.nombre}?`)) return;
    try {
      await actualizarUsuario(u.id, { activo: !u.activo });
      cargar();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al actualizar.');
    }
  }

  async function restablecerPassword(u: Usuario) {
    const nueva = window.prompt(`Nueva contraseña temporal para ${u.nombre} (mínimo 8 caracteres):`);
    if (!nueva) return;
    if (nueva.length < 8) {
      setMensaje('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    try {
      await actualizarUsuario(u.id, { password: nueva });
      setMensaje(`Contraseña restablecida para ${u.nombre}.`);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al restablecer la contraseña.');
    }
  }

  return {
    yo,
    usuarios,
    sucursales,
    mensaje,
    editandoId,
    edicion,
    crear,
    abrirEdicion,
    cancelarEdicion,
    setEdicion,
    guardarEdicion,
    toggleActivo,
    restablecerPassword,
  };
}
