'use client';

import { useUsuarios } from '@/features/usuarios/hooks/useUsuarios';
import { NuevoUsuarioForm } from '@/features/usuarios/components/NuevoUsuarioForm';
import { UsuariosTable } from '@/features/usuarios/components/UsuariosTable';

export default function UsuariosPage() {
  const {
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
  } = useUsuarios();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Usuarios</h1>

      <NuevoUsuarioForm sucursales={sucursales} mensaje={mensaje} onCrear={crear} />

      <UsuariosTable
        usuarios={usuarios}
        sucursales={sucursales}
        yoId={yo?.id}
        editandoId={editandoId}
        edicion={edicion}
        onEdicionChange={setEdicion}
        onAbrirEdicion={abrirEdicion}
        onCancelarEdicion={cancelarEdicion}
        onGuardarEdicion={guardarEdicion}
        onToggleActivo={toggleActivo}
        onRestablecerPassword={restablecerPassword}
      />
    </div>
  );
}
