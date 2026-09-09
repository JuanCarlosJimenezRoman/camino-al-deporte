'use client';

import { useSucursales } from '@/features/sucursales/hooks/useSucursales';
import { NuevaSucursalForm } from '@/features/sucursales/components/NuevaSucursalForm';
import { SucursalesTabs } from '@/features/sucursales/components/SucursalesTabs';
import { WhatsappSucursalForm } from '@/features/sucursales/components/WhatsappSucursalForm';
import { ExistenciasSucursalTable } from '@/features/sucursales/components/ExistenciasSucursalTable';

export default function SucursalesPage() {
  const {
    esAdmin,
    sucursales,
    seleccionada,
    setSeleccionada,
    existencias,
    mensaje,
    crear,
    telefonoEdicion,
    setTelefonoEdicion,
    phoneNumberIdEdicion,
    setPhoneNumberIdEdicion,
    guardandoTelefono,
    mensajeTelefono,
    guardarTelefono,
  } = useSucursales();

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Sucursales</h1>

      {esAdmin && <NuevaSucursalForm mensaje={mensaje} onCrear={crear} />}

      <SucursalesTabs sucursales={sucursales} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />

      {esAdmin && seleccionada && (
        <WhatsappSucursalForm
          telefono={telefonoEdicion}
          phoneNumberId={phoneNumberIdEdicion}
          guardando={guardandoTelefono}
          mensaje={mensajeTelefono}
          onChangeTelefono={setTelefonoEdicion}
          onChangePhoneNumberId={setPhoneNumberIdEdicion}
          onGuardar={guardarTelefono}
        />
      )}

      <ExistenciasSucursalTable existencias={existencias} />
    </div>
  );
}
