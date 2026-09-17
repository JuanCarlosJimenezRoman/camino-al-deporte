// Formulario de alta/edición de proveedor.
// Vista pura: recibe valores + handlers, no conoce el API.

'use client';

import type { ProveedorFormValues } from '../types';

interface Props {
  editando: boolean;
  form: ProveedorFormValues;
  guardando: boolean;
  mensaje: string | null;
  onChange: (v: ProveedorFormValues) => void;
  onGuardar: () => void;
}

export function ProveedorForm({ editando, form, guardando, mensaje, onChange, onGuardar }: Props) {
  const set = (k: keyof ProveedorFormValues, v: string) => onChange({ ...form, [k]: v });

  return (
    <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>
        {editando ? 'Editar proveedor' : 'Nuevo proveedor'}
      </h2>

      <label style={{ fontSize: 13 }}>Nombre</label>
      <div style={{ marginBottom: 10 }}>
        <input
          value={form.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          placeholder="Distribuidora XYZ"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13 }}>Contacto</label>
          <input
            value={form.contacto}
            onChange={(e) => set('contacto', e.target.value)}
            placeholder="Nombre de quién atiende"
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13 }}>Teléfono</label>
          <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 6 }}>
        Cuenta bancaria del proveedor (a dónde transferirle al pagarle):
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13 }}>Banco</label>
          <input value={form.banco} onChange={(e) => set('banco', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13 }}>Titular</label>
          <input value={form.titular} onChange={(e) => set('titular', e.target.value)} />
        </div>
      </div>
      <label style={{ fontSize: 13 }}>CLABE / número de cuenta</label>
      <div style={{ marginBottom: 10 }}>
        <input value={form.numeroCuenta} onChange={(e) => set('numeroCuenta', e.target.value)} />
      </div>

      <label style={{ fontSize: 13 }}>Notas (opcional)</label>
      <div style={{ marginBottom: 12 }}>
        <textarea
          value={form.notas}
          onChange={(e) => set('notas', e.target.value)}
          rows={2}
          style={{ width: '100%' }}
        />
      </div>

      {mensaje && <p style={{ fontSize: 13, marginBottom: 10 }}>{mensaje}</p>}

      <button className="btn" onClick={onGuardar} disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  );
}