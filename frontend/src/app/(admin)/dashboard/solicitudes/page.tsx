'use client';

import { useAuth } from '@/lib/auth';
import { SolicitudesFilters } from '@/features/solicitudes/components/SolicitudesFilters';
import { SolicitudesTable } from '@/features/solicitudes/components/SolicitudesTable';
import { puedeAdministrarSolicitudes } from '@/features/solicitudes/utils';
import { useSolicitudes } from '@/features/solicitudes/useSolicitudes';

export default function SolicitudesPage() {
  const { usuario } = useAuth();
  const esAdmin = puedeAdministrarSolicitudes(usuario);

  const {
    solicitudes,
    filtro,
    setFiltro,
    mensaje,
    procesandoId,
    notaPorId,
    setNota,
    aprobar,
    rechazar,
  } = useSolicitudes();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Solicitudes</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 16, fontSize: 14 }}>
        {esAdmin
          ? 'Acciones que Inventario pidió hacer (desactivar catálogos, editar o desactivar proveedores) y que necesitan tu aprobación.'
          : 'Aquí puedes ver el estado de las acciones que enviaste a aprobación (desactivar catálogos, editar o desactivar proveedores).'}
      </p>

      <SolicitudesFilters valor={filtro} onChange={setFiltro} />

      {mensaje && <p style={{ fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}

      <SolicitudesTable
        solicitudes={solicitudes}
        esAdmin={esAdmin}
        filtro={filtro}
        procesandoId={procesandoId}
        notaPorId={notaPorId}
        onNotaChange={setNota}
        onAprobar={aprobar}
        onRechazar={rechazar}
      />
    </div>
  );
}
