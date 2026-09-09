'use client';

import type { ExistenciaDetalle } from '../types';

interface Props {
  existencias: ExistenciaDetalle[];
}

export function ExistenciasSucursalTable({ existencias }: Props) {
  return (
    <>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Productos en esta sucursal</h2>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Marca</th>
            <th>Talla</th>
            <th>SKU</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {existencias.map((e) => (
            <tr key={e.id}>
              <td>{e.variante.producto.nombre}</td>
              <td>{e.variante.producto.marca.nombre}</td>
              <td>{e.variante.talla?.valor ?? '—'}</td>
              <td>{e.variante.sku}</td>
              <td className={e.stockActual <= e.stockMinimo ? 'stock-bajo' : ''}>{e.stockActual}</td>
            </tr>
          ))}
          {existencias.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--color-muted)' }}>
                Sin existencias registradas en esta sucursal.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
