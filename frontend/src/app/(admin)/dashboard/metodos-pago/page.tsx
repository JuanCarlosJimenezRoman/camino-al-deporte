'use client';

import {
  CuentasTransferenciaCard,
  ProveedoresCuentasCard,
  WhatsappTiendaCard,
  useMetodosPago,
} from '@/features/metodos-pago';

export default function MetodosPagoPage() {
  const { puedeVerSeccion, puedeVerProveedores, config, cuentas, proveedoresCuentas } = useMetodosPago();

  if (!puedeVerSeccion) {
    return (
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 16 }}>Métodos de pago</h1>
        <p style={{ color: 'var(--color-muted)' }}>No tienes permiso para ver esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Métodos de pago</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 20, fontSize: 14 }}>
        Administra las cuentas propias donde se reciben pagos por transferencia.
      </p>

      <WhatsappTiendaCard config={config} />

      <div style={{ marginTop: 20 }}>
        <CuentasTransferenciaCard cuentas={cuentas} />
      </div>

      {puedeVerProveedores && (
        <div style={{ marginTop: 20 }}>
          <ProveedoresCuentasCard proveedoresCuentas={proveedoresCuentas} />
        </div>
      )}
    </div>
  );
}