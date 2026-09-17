// Sub-formulario para registrar un pago a un proveedor.
// Vista pura: maneja solo su propio estado local de inputs; el submit
// lo delega por prop (onRegistrar), que devuelve Promise para saber si
// limpiar los campos.

'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { METODOS_PAGO, type MetodoPagoProveedor } from '../types';
import { requiereComprobante } from '../utils';

interface Props {
  proveedorNombre: string;
  cuentaTexto: string;
  onRegistrar: (input: {
    monto: number;
    metodoPago: MetodoPagoProveedor;
    concepto?: string;
    comprobante?: File | null;
  }) => Promise<void>;
}

export function RegistrarPagoForm({ proveedorNombre, cuentaTexto, onRegistrar }: Props) {
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoProveedor>('EFECTIVO');
  const [concepto, setConcepto] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function registrar() {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    if (requiereComprobante(metodoPago, comprobante)) {
      setMensaje('Falta la foto del comprobante.');
      return;
    }
    setGuardando(true);
    try {
      await onRegistrar({
        monto: montoNum,
        metodoPago,
        concepto: concepto || undefined,
        comprobante,
      });
      setMonto('');
      setMetodoPago('EFECTIVO');
      setConcepto('');
      setComprobante(null);
      setMensaje('Pago registrado.');
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : 'Error al registrar el pago.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Monto a pagar</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Método</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value as MetodoPagoProveedor)}
          >
            {METODOS_PAGO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, display: 'block' }}>Concepto (opcional)</label>
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Reabasto de..."
            style={{ maxWidth: 180 }}
          />
        </div>
        {metodoPago === 'TRANSFERENCIA' && (
          <div>
            <label style={{ fontSize: 12, display: 'block' }}>Comprobante</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setComprobante(e.target.files?.[0] || null)}
            />
          </div>
        )}
        <button className="btn" onClick={registrar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Registrar pago'}
        </button>
      </div>
      {mensaje && <p style={{ fontSize: 13, marginTop: 10 }}>{mensaje}</p>}
      {metodoPago === 'TRANSFERENCIA' && cuentaTexto !== '—' && (
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
          Transferir a: {cuentaTexto} · {proveedorNombre}
        </p>
      )}
    </>
  );
}