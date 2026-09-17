// Fila de la tabla de proveedores + panel expandible con detalle y pagos.
// Vista pura: recibe todo por props.

'use client';

import { formatearFechaHora } from '@/lib/utils';
import type { NuevoPagoInput, Proveedor, ProveedorDetalle } from '../types';
import { etiquetaMetodoPago, formatearCuenta } from '../utils';
import { RegistrarPagoForm } from './RegistrarPagoForm';

interface Props {
  proveedor: Proveedor;
  expandido: boolean;
  detalle: ProveedorDetalle | null;
  cargandoDetalle: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onToggleActivo: () => void;
  onPagoRegistrado: (input: NuevoPagoInput) => Promise<void>;
}

export function ProveedorFila({
  proveedor,
  expandido,
  detalle,
  cargandoDetalle,
  onToggle,
  onEditar,
  onToggleActivo,
  onPagoRegistrado,
}: Props) {
  const cuentaTexto = formatearCuenta(proveedor.banco, proveedor.numeroCuenta);

  return (
    <>
      <tr style={{ opacity: proveedor.activo ? 1 : 0.5 }}>
        <td>{proveedor.nombre}</td>
        <td>{proveedor.contacto || '—'}</td>
        <td>{proveedor.telefono || '—'}</td>
        <td>{cuentaTexto}</td>
        <td>{proveedor.activo ? 'Activo' : 'Inactivo'}</td>
        <td style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn" onClick={onToggle}>
            {expandido ? 'Ocultar' : 'Ver'}
          </button>
          <button className="btn-secondary btn" onClick={onEditar}>
            Editar
          </button>
          <button className="btn-secondary btn" onClick={onToggleActivo}>
            {proveedor.activo ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={6}>
            <div style={{ padding: 12, background: 'var(--color-panel)', borderRadius: 8 }}>
              {cargandoDetalle || !detalle ? (
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Cargando...</p>
              ) : (
                <>
                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Productos que surte ({detalle.variantes.length})
                  </h3>
                  {detalle.variantes.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
                      Todavía no tiene variantes asignadas. Se asignan desde Productos.
                    </p>
                  ) : (
                    <div style={{ marginBottom: 12, fontSize: 13 }}>
                      {detalle.variantes.map((v) => (
                        <div key={v.id} style={{ padding: '2px 0' }}>
                          {v.producto.nombre} {v.talla ? `(${v.talla.valor})` : ''} — {v.sku}
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 style={{ fontSize: 13, marginBottom: 6 }}>
                    Pagos — total pagado: ${detalle.totalPagado.toFixed(2)}
                  </h3>
                  {detalle.pagos.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
                      Sin pagos registrados.
                    </p>
                  ) : (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr>
                          <th>Monto</th>
                          <th>Método</th>
                          <th>Concepto</th>
                          <th>Registrado por</th>
                          <th>Fecha</th>
                          <th>Comprobante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.pagos.map((pg) => (
                          <tr key={pg.id}>
                            <td>${pg.monto}</td>
                            <td>{etiquetaMetodoPago(pg.metodoPago)}</td>
                            <td>{pg.concepto || '—'}</td>
                            <td>{pg.registradoPor?.nombre}</td>
                            <td>{formatearFechaHora(pg.createdAt)}</td>
                            <td>
                              {pg.comprobanteUrl ? (
                                <a href={pg.comprobanteUrl} target="_blank" rel="noreferrer">
                                  ver
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <RegistrarPagoForm
                    proveedorNombre={proveedor.nombre}
                    cuentaTexto={cuentaTexto}
                    onRegistrar={onPagoRegistrado}
                  />
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}