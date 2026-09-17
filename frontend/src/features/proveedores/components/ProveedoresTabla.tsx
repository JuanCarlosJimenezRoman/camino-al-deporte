// Tabla de proveedores con estado de fila expandida.
// Vista pura: solo props.

'use client';

import type { NuevoPagoInput, Proveedor, ProveedorDetalle } from '../types';
import { ProveedorFila } from './ProveedorFila';

interface Props {
  proveedores: Proveedor[];
  expandidoId: number | null;
  detalle: ProveedorDetalle | null;
  cargandoDetalle: boolean;
  onToggleExpandir: (id: number) => void;
  onEditar: (p: Proveedor) => void;
  onToggleActivo: (p: Proveedor) => void;
  onPagoRegistrado: (proveedorId: number, input: NuevoPagoInput) => Promise<void>;
}

export function ProveedoresTabla({
  proveedores,
  expandidoId,
  detalle,
  cargandoDetalle,
  onToggleExpandir,
  onEditar,
  onToggleActivo,
  onPagoRegistrado,
}: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Contacto</th>
          <th>Teléfono</th>
          <th>Cuenta</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {proveedores.map((p) => (
          <ProveedorFila
            key={p.id}
            proveedor={p}
            expandido={expandidoId === p.id}
            detalle={expandidoId === p.id ? detalle : null}
            cargandoDetalle={expandidoId === p.id && cargandoDetalle}
            onToggle={() => onToggleExpandir(p.id)}
            onEditar={() => onEditar(p)}
            onToggleActivo={() => onToggleActivo(p)}
            onPagoRegistrado={(input) => onPagoRegistrado(p.id, input)}
          />
        ))}
        {proveedores.length === 0 && (
          <tr>
            <td colSpan={6} style={{ color: 'var(--color-muted)' }}>
              Sin proveedores registrados todavía.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}