'use client';

import { useCamposPersonalizados } from '@/features/camposPersonalizados/useCamposPersonalizados';
import { NuevoCampoForm } from '@/features/camposPersonalizados/components/NuevoCampoForm';
import { CamposLista } from '@/features/camposPersonalizados/components/CamposLista';

export default function CamposPersonalizadosPage() {
  const {
    grupos,
    cargando,
    mensaje,
    crear,
    guardarEdicion,
    toggleActivo,
  } = useCamposPersonalizados();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Campos personalizados</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14, maxWidth: 640 }}>
        Aquí se agregan campos nuevos (por ejemplo "Género" o "Material") sin necesitar un cambio de
        código. Un campo creado aquí para la entidad <strong>producto</strong> aparece de inmediato en el
        formulario de Productos → "Editar". Desactivar un campo lo oculta del formulario pero no borra los
        valores ya guardados en los productos existentes.
      </p>

      <NuevoCampoForm onCrear={crear} />

      {mensaje && (
        <p style={{ fontSize: 13, margin: '12px 0', color: 'var(--color-danger, #b91c1c)' }}>{mensaje}</p>
      )}

      {cargando ? (
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Cargando…</p>
      ) : grupos.length === 0 ? (
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Todavía no hay campos personalizados.</p>
      ) : (
        grupos.map(([entidad, items]) => (
          <div key={entidad} className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12, textTransform: 'capitalize' }}>{entidad}</h2>
            <CamposLista campos={items} onGuardar={guardarEdicion} onToggleActivo={toggleActivo} />
          </div>
        ))
      )}
    </div>
  );
}
