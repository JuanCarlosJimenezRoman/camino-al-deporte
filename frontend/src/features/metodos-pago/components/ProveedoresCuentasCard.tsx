// Vista: bloque "Cuentas de proveedores" (solo lectura + link a Proveedores).

'use client';

import Link from 'next/link';
import type { UseProveedoresCuentasReturn } from '../useproveedorescuentas';
import { contactoProveedor } from '../utils';

interface Props {
  proveedoresCuentas: UseProveedoresCuentasReturn;
}

export function ProveedoresCuentasCard({ proveedoresCuentas }: Props) {
  const { proveedores, cargando } = proveedoresCuentas;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h2 style={{ fontSize: 15 }}>Cuentas de proveedores</h2>
        <Link href="/dashboard/proveedores" className="btn-secondary btn">
          Administrar / registrar pagos
        </Link>
      </div>
      <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 12 }}>
        A ellos se les paga directo cada pedido. Como son proveedores internos, se puede corroborar cada
        transferencia contra la cuenta que aparece aquí. Los datos se jalan de Proveedores — para editarlos o
        registrar un pago, usa el botón de arriba.
      </p>

      {cargando ? (
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Contacto</th>
              <th>Banco</th>
              <th>Titular</th>
              <th>Cuenta / CLABE</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                <td>{p.nombre}</td>
                <td>{contactoProveedor(p)}</td>
                <td>{p.banco || '—'}</td>
                <td>{p.titular || '—'}</td>
                <td>{p.numeroCuenta || '—'}</td>
                <td>{p.activo ? 'Activo' : 'Inactivo'}</td>
              </tr>
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
      )}
    </div>
  );
}