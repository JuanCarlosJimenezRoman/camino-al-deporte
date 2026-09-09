'use client';

interface Props {
  telefono: string;
  phoneNumberId: string;
  guardando: boolean;
  mensaje: string | null;
  onChangeTelefono: (v: string) => void;
  onChangePhoneNumberId: (v: string) => void;
  onGuardar: () => void;
}

export function WhatsappSucursalForm({
  telefono,
  phoneNumberId,
  guardando,
  mensaje,
  onChangeTelefono,
  onChangePhoneNumberId,
  onGuardar,
}: Props) {
  return (
    <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
      <h2 style={{ fontSize: 15, marginBottom: 6 }}>WhatsApp de esta sucursal</h2>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
        Número desde el que se manda el ticket digital de compra a los clientes de esta sucursal. Déjalo vacío
        para seguir usando el WhatsApp general de la tienda.
      </p>
      <input
        value={telefono}
        onChange={(e) => onChangeTelefono(e.target.value)}
        placeholder="10 dígitos, ej. 5512345678"
        style={{ marginBottom: 10 }}
      />

      <label style={{ fontSize: 12, fontWeight: 600 }}>
        WhatsApp Cloud API — Phone Number ID (opcional, técnico)
      </label>
      <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2, marginBottom: 6 }}>
        Solo si ya conectaste este número a WhatsApp Business Platform en Meta Business Manager. Con esto el
        ticket se manda solo, sin que el cajero tenga que abrir WhatsApp. Es el "Phone Number ID" que da Meta,
        no el número de teléfono.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={phoneNumberId}
          onChange={(e) => onChangePhoneNumberId(e.target.value)}
          placeholder="Ej. 109876543212345"
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {mensaje && <p style={{ fontSize: 13, marginTop: 8 }}>{mensaje}</p>}
    </div>
  );
}
