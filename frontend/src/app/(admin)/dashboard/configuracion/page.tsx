'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Eye, Lock } from 'lucide-react';
import { IdentidadCard } from '@/features/configuracion/components/IdentidadCard';
import { LogoCard } from '@/features/configuracion/components/LogoCard';
import { TicketCard } from '@/features/configuracion/components/TicketCard';
import { useConfiguracion } from '@/features/configuracion/useConfiguracion';

export default function ConfiguracionPage() {
  const {
    puedeEditar,

    nombre,
    iniciales,
    logoUrl,

    mensajeTicketPie,
    mostrarCodigoBarrasTicket,
    mostrarVendedorTicket,
    mostrarSucursalTicket,

    cargando,
    cargandoMarca,
    guardando,
    guardandoTicket,
    generandoVistaPrevia,
    subiendo,
    quitando,

    cambiarNombre,
    setIniciales,
    setMensajeTicketPie,
    setMostrarCodigoBarrasTicket,
    setMostrarVendedorTicket,
    setMostrarSucursalTicket,

    guardarIdentidad,
    subirLogo,
    quitarLogo,
    previsualizarTicket,
    guardarConfiguracionTicket,
  } = useConfiguracion();

  if (!puedeEditar) {
    return (
      <EmptyState
        icon={Lock}
        title="Sin acceso"
        description="No tienes permiso para ver esta sección."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Identidad del negocio: nombre, iniciales y logo. Se usa en tickets, comprobantes y en el panel — así puedes reutilizar el sistema para otro negocio."
        breadcrumbs={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Configuración' },
        ]}
        actions={
          !cargando && !cargandoMarca ? (
            <Button
              variant="outline"
              onClick={previsualizarTicket}
              disabled={generandoVistaPrevia}
              title="Genera un ticket de ejemplo con lo que llevas en pantalla, aunque no lo hayas guardado"
            >
              <Eye className="w-4 h-4" />
              {generandoVistaPrevia
                ? 'Generando…'
                : 'Vista previa del ticket'}
            </Button>
          ) : undefined
        }
      />

      {cargando || cargandoMarca ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <IdentidadCard
            nombre={nombre}
            iniciales={iniciales}
            guardando={guardando}
            onNombreChange={cambiarNombre}
            onInicialesChange={setIniciales}
            onGuardar={guardarIdentidad}
          />

          <LogoCard
            logoUrl={logoUrl}
            iniciales={iniciales}
            subiendo={subiendo}
            quitando={quitando}
            onSubir={subirLogo}
            onQuitar={quitarLogo}
          />

          <TicketCard
            mensajeTicketPie={mensajeTicketPie}
            mostrarCodigoBarrasTicket={mostrarCodigoBarrasTicket}
            mostrarVendedorTicket={mostrarVendedorTicket}
            mostrarSucursalTicket={mostrarSucursalTicket}
            guardando={guardandoTicket}
            onMensajeChange={setMensajeTicketPie}
            onMostrarCodigoBarrasChange={setMostrarCodigoBarrasTicket}
            onMostrarVendedorChange={setMostrarVendedorTicket}
            onMostrarSucursalChange={setMostrarSucursalTicket}
            onGuardar={guardarConfiguracionTicket}
          />
        </>
      )}
    </div>
  );
}
